import { type Dirent, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { rename } from "node:fs/promises";
import { basename, join } from "node:path";
import { confirm } from "@inquirer/prompts";
import type { ExpConfig } from "../core/config.ts";
import { detectContext } from "../core/context.ts";
import { getDivergedSize } from "../core/divergence.ts";
import { getExpBase, listBranches, readMetadata, resolveExp } from "../core/experiment.ts";
import { getProjectRoot } from "../core/project.ts";
import { isWrapperActive, writeCdTarget, writeDeferredRm } from "../utils/cd-file.ts";
import { c, dim, err, ok, warn } from "../utils/colors.ts";
import { fmt } from "../utils/format.ts";
import { parseTargets } from "../utils/targets.ts";

const TRASH_SUBDIR = ".trash";

function ensureTrashDir(base: string): string {
	const dir = join(base, TRASH_SUBDIR);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	return dir;
}

/**
 * Sweep any orphans left in `<base>/.trash/` (e.g. from a crashed background rm).
 * Fire-and-forget — emits rm: directives or falls back to sync rm.
 */
function sweepTrash(base: string): void {
	const trashDir = join(base, TRASH_SUBDIR);
	if (!existsSync(trashDir)) return;
	const orphans = readdirSync(trashDir);
	if (orphans.length === 0) return;

	const wrapper = isWrapperActive();
	for (const name of orphans) {
		const orphanPath = join(trashDir, name);
		if (wrapper) {
			writeDeferredRm(orphanPath);
		} else {
			try {
				rmSync(orphanPath, { recursive: true, force: true });
			} catch {
				// Sweep is opportunistic — ignore failures.
			}
		}
	}
}

// Full UUID, not a slice: UUIDv7's leading chars are a millisecond timestamp,
// so two same-basename targets staged in the same tick (e.g. several
// `node_modules` dirs during a --shrink) would collide on a truncated suffix.
// The random tail guarantees uniqueness. The name is ephemeral (rm'd shortly).
async function stageOne(expDir: string, trashDir: string): Promise<string> {
	const stagedName = `${basename(expDir)}.${Bun.randomUUIDv7()}`;
	const stagedPath = join(trashDir, stagedName);
	await rename(expDir, stagedPath);
	return stagedPath;
}

async function stageAndDefer(
	expDirs: string[],
	base: string,
): Promise<{ elapsedMs: number; deferred: boolean }> {
	const trashDir = ensureTrashDir(base);
	const t0 = performance.now();

	const stagedPaths = await Promise.all(expDirs.map((d) => stageOne(d, trashDir)));

	const wrapper = isWrapperActive();
	if (wrapper) {
		for (const p of stagedPaths) writeDeferredRm(p);
	} else {
		// No shell wrapper: rm in foreground — slower but correct.
		for (const p of stagedPaths) {
			rmSync(p, { recursive: true, force: true });
		}
	}

	return { elapsedMs: performance.now() - t0, deferred: wrapper };
}

function stageAndDeferSync(expDir: string, base: string): { elapsedMs: number; deferred: boolean } {
	const trashDir = ensureTrashDir(base);
	const t0 = performance.now();

	const stagedName = `${basename(expDir)}.${Bun.randomUUIDv7()}`;
	const stagedPath = join(trashDir, stagedName);
	renameSync(expDir, stagedPath);

	const wrapper = isWrapperActive();
	if (wrapper) {
		writeDeferredRm(stagedPath);
	} else {
		rmSync(stagedPath, { recursive: true, force: true });
	}

	return { elapsedMs: performance.now() - t0, deferred: wrapper };
}

function deferredSuffix(deferred: boolean): string {
	return deferred ? c.dim(" (rm in background)") : "";
}

// ── Shrink: reclaim disposable dirs without trashing the branch ──

/** Directory names exp already classifies as disposable (regenerable, safe to lose). */
function disposableDirNames(config: ExpConfig): Set<string> {
	return new Set([...config.deferDirs, ...config.clean]);
}

// Dirs that never hold disposable targets worth the walk cost.
const SKIP_WALK = new Set([".git"]);

/**
 * Recursively collect directories inside `branchDir` whose name is in the
 * disposable set (e.g. node_modules, .next, .turbo). Prunes at every match —
 * never descends *into* a disposable dir — so nested workspace node_modules in
 * a monorepo are all found without walking their interiors. Skips `.git`.
 * Symlinks are not directories here, so pnpm's symlink farms are never followed.
 *
 * Never throws: an unreadable directory is skipped, so a partial filesystem
 * failure degrades to "reclaim what we could" rather than aborting.
 */
export function findDisposableDirs(branchDir: string, disposable: Set<string>): string[] {
	const found: string[] = [];
	const walk = (dir: string) => {
		let entries: Dirent[];
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return; // unreadable — skip, stay operational
		}
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const full = join(dir, entry.name);
			if (disposable.has(entry.name)) {
				found.push(full); // collect, do not descend (prune)
			} else if (!SKIP_WALK.has(entry.name)) {
				walk(full);
			}
		}
	};
	walk(branchDir);
	return found;
}

interface ReclaimResult {
	elapsedMs: number;
	deferred: boolean;
	reclaimed: number;
}

/**
 * Stage every disposable dir found inside the given branches for deferred
 * removal — leaving the branches and their code intact. Reuses the same atomic
 * rename-into-.trash + background-rm path as a full trash, so it's instant
 * regardless of how heavy node_modules is.
 */
export async function reclaimDisposable(
	branchDirs: string[],
	base: string,
	config: ExpConfig,
): Promise<ReclaimResult> {
	const disposable = disposableDirNames(config);
	const dirs = branchDirs.flatMap((d) => findDisposableDirs(d, disposable));
	if (dirs.length === 0) {
		return { elapsedMs: 0, deferred: false, reclaimed: 0 };
	}
	const { elapsedMs, deferred } = await stageAndDefer(dirs, base);
	return { elapsedMs, deferred, reclaimed: dirs.length };
}

function reportShrink(
	branchNames: string[],
	reclaimed: number,
	elapsedMs: number,
	deferred: boolean,
	config: ExpConfig,
) {
	if (config.json) {
		console.log(
			JSON.stringify({
				shrunk: branchNames,
				reclaimed,
				elapsedMs: Math.round(elapsedMs),
				deferred,
			}),
		);
		return;
	}
	if (reclaimed === 0) {
		dim("Nothing to reclaim — no deps/build dirs found.");
		return;
	}
	const ds = reclaimed === 1 ? "" : "s";
	const bs = branchNames.length === 1 ? "" : "es";
	ok(
		`Reclaimed ${reclaimed} dir${ds} from ${branchNames.length} branch${bs} in ${fmt(elapsedMs)}${deferredSuffix(deferred)}`,
	);
}

export async function cmdTrash(args: string[], config: ExpConfig) {
	const flags = args.filter((a) => a.startsWith("-"));
	const positional = args.filter((a) => !a.startsWith("-"));
	const query = positional[0];
	const force = flags.includes("--force") || flags.includes("-y");
	const trashDone = flags.includes("--done");
	// --shrink reclaims only the disposable dirs (node_modules, build output)
	// inside the selected branches — the branch and its code are left intact.
	const shrink = flags.includes("--shrink");

	// ── Batch over all done branches ──
	if (trashDone) {
		await trashAllDone(config, force, shrink);
		return;
	}

	// ── Self-trash: no args, inside a branch ──
	if (!query) {
		const context = detectContext();
		if (!context.isClone) {
			err("Usage: exp trash <id> [--force|-y]");
			process.exit(1);
		}

		// Self-trash requires TTY — user should be explicit
		if (!process.stdin.isTTY) {
			err("Cannot self-trash without TTY. Use exp trash <id> --force from outside the branch.");
			process.exit(1);
		}

		const { expDir, expName, originalRoot } = context;
		const base = getExpBase(originalRoot, config);
		sweepTrash(base);

		// Shrink keeps the branch — reclaim its disposable dirs and stay put.
		if (shrink) {
			if (!force) {
				const yes = await confirm({
					message: `Reclaim deps/build dirs from ${c.magenta(expName)}? (keeps code)`,
				});
				if (!yes) {
					dim("Cancelled.");
					return;
				}
			}
			const { elapsedMs, deferred, reclaimed } = await reclaimDisposable([expDir], base, config);
			reportShrink([expName], reclaimed, elapsedMs, deferred, config);
			return;
		}

		const size = await getDivergedSize(originalRoot, expDir);
		warn(`Delete ${c.magenta(expName)}? (diverged ${size})`);

		const yes = await confirm({ message: "Confirm?" });
		if (!yes) {
			dim("Cancelled.");
			return;
		}

		const { elapsedMs, deferred } = stageAndDeferSync(expDir, base);

		if (config.json) {
			console.log(
				JSON.stringify({
					trashed: expName,
					path: expDir,
					elapsedMs: Math.round(elapsedMs),
					deferred,
				}),
			);
		} else {
			ok(`Trashed ${expName} in ${fmt(elapsedMs)}${deferredSuffix(deferred)}`);
		}

		// cd back to project root
		const wrapperActive = writeCdTarget(originalRoot);
		if (!wrapperActive) {
			dim(`  cd ${originalRoot}`);
		}

		return;
	}

	// ── Multi-target trash: exp trash 1 3-5 8 ──
	const isMulti = positional.length > 1 || /^\d+-\d+$/.test(positional[0]);
	const targets = isMulti ? parseTargets(positional) : null;
	if (targets) {
		await trashMultiple(targets, config, force, shrink);
		return;
	}

	// ── Standard trash by ID ──
	const ctx = detectContext();
	const root = ctx.isClone ? ctx.originalRoot : getProjectRoot();
	const base = getExpBase(root, config);
	sweepTrash(base);

	const expDir = resolveExp(query, base);

	if (!expDir) {
		err(`Not found: ${query}`);
		process.exit(1);
	}

	const expName = basename(expDir);

	// Shrink a single branch: reclaim its disposable dirs, keep the branch.
	if (shrink) {
		if (!force) {
			if (!process.stdin.isTTY) {
				err("Cannot confirm interactively (no TTY). Use --force or -y to skip confirmation.");
				process.exit(1);
			}
			const yes = await confirm({
				message: `Reclaim deps/build dirs from ${c.magenta(expName)}? (keeps code)`,
			});
			if (!yes) {
				dim("Cancelled.");
				return;
			}
		}
		const { elapsedMs, deferred, reclaimed } = await reclaimDisposable([expDir], base, config);
		reportShrink([expName], reclaimed, elapsedMs, deferred, config);
		return;
	}

	if (!force) {
		if (!process.stdin.isTTY) {
			err("Cannot confirm interactively (no TTY). Use --force or -y to skip confirmation.");
			process.exit(1);
		}

		const sourceRoot = readMetadata(expDir)?.source ?? root;
		const size = await getDivergedSize(sourceRoot, expDir);
		warn(`Delete ${c.magenta(expName)}? (diverged ${size})`);

		const yes = await confirm({ message: "Confirm?" });
		if (!yes) {
			dim("Cancelled.");
			return;
		}
	}

	const { elapsedMs, deferred } = await stageAndDefer([expDir], base);

	if (config.json) {
		console.log(
			JSON.stringify({
				trashed: expName,
				path: expDir,
				elapsedMs: Math.round(elapsedMs),
				deferred,
			}),
		);
	} else {
		ok(`Trashed ${expName} in ${fmt(elapsedMs)}${deferredSuffix(deferred)}`);
	}
}

async function trashMultiple(
	targets: number[],
	config: ExpConfig,
	force: boolean,
	shrink: boolean,
) {
	const ctx = detectContext();
	const root = ctx.isClone ? ctx.originalRoot : getProjectRoot();
	const base = getExpBase(root, config);
	sweepTrash(base);

	// Resolve each target number
	const resolved: { num: number; expDir: string; expName: string }[] = [];
	const missing: number[] = [];

	for (const num of targets) {
		const expDir = resolveExp(String(num), base);
		if (expDir) {
			resolved.push({ num, expDir, expName: basename(expDir) });
		} else {
			missing.push(num);
		}
	}

	if (missing.length > 0) {
		warn(`Not found: ${missing.join(", ")}`);
	}

	if (resolved.length === 0) {
		err(`No matching branches to ${shrink ? "reclaim" : "trash"}.`);
		process.exit(1);
	}

	const s = resolved.length === 1 ? "" : "es";
	warn(`${resolved.length} branch${s} to ${shrink ? "reclaim from" : "trash"}:`);
	for (const { expName } of resolved) {
		console.log(`  ${c.dim(expName)}`);
	}

	if (!force) {
		if (!process.stdin.isTTY) {
			err("Cannot confirm interactively (no TTY). Use --force or -y to skip confirmation.");
			process.exit(1);
		}

		const message = shrink
			? `Reclaim deps/build dirs from ${resolved.length} branch${s}? (keeps code)`
			: `Trash ${resolved.length} branch${s}?`;
		const yes = await confirm({ message });
		if (!yes) {
			dim("Cancelled.");
			return;
		}
	}

	const branchDirs = resolved.map((r) => r.expDir);
	const names = resolved.map((r) => r.expName);

	if (shrink) {
		const { elapsedMs, deferred, reclaimed } = await reclaimDisposable(branchDirs, base, config);
		reportShrink(names, reclaimed, elapsedMs, deferred, config);
		return;
	}

	const { elapsedMs, deferred } = await stageAndDefer(branchDirs, base);

	if (config.json) {
		console.log(JSON.stringify({ trashed: names, elapsedMs: Math.round(elapsedMs), deferred }));
	} else {
		ok(`Trashed ${names.length} branch${s} in ${fmt(elapsedMs)}${deferredSuffix(deferred)}`);
	}
}

async function trashAllDone(config: ExpConfig, force: boolean, shrink: boolean) {
	const ctx = detectContext();
	const root = ctx.isClone ? ctx.originalRoot : getProjectRoot();
	const base = getExpBase(root, config);

	if (!existsSync(base)) {
		dim("No branches found.");
		return;
	}
	sweepTrash(base);

	const entries = listBranches(base).sort((a, b) => a.name.localeCompare(b.name));

	const doneBranches = entries.filter((e) => {
		const meta = readMetadata(join(base, e.name));
		return meta?.status === "done";
	});

	if (doneBranches.length === 0) {
		dim(`No done branches to ${shrink ? "reclaim from" : "trash"}.`);
		return;
	}

	const s = doneBranches.length === 1 ? "" : "es";
	warn(`${doneBranches.length} done branch${s} to ${shrink ? "reclaim from" : "trash"}:`);
	for (const entry of doneBranches) {
		console.log(`  ${c.dim(entry.name)}`);
	}

	if (!force) {
		if (!process.stdin.isTTY) {
			err(
				"Cannot confirm interactively (no TTY). Ask the human to run this command, or get their explicit approval before using --force.",
			);
			process.exit(1);
		}

		const message = shrink
			? `Reclaim deps/build dirs from all ${doneBranches.length} done branch${s}? (keeps code)`
			: `Trash all ${doneBranches.length} done branch${s}?`;
		const yes = await confirm({ message });
		if (!yes) {
			dim("Cancelled.");
			return;
		}
	}

	const branchDirs = doneBranches.map((e) => join(base, e.name));
	const names = doneBranches.map((e) => e.name);

	if (shrink) {
		const { elapsedMs, deferred, reclaimed } = await reclaimDisposable(branchDirs, base, config);
		reportShrink(names, reclaimed, elapsedMs, deferred, config);
		return;
	}

	const { elapsedMs, deferred } = await stageAndDefer(branchDirs, base);

	if (config.json) {
		console.log(JSON.stringify({ trashed: names, elapsedMs: Math.round(elapsedMs), deferred }));
	} else {
		ok(`Trashed ${names.length} done branch${s} in ${fmt(elapsedMs)}${deferredSuffix(deferred)}`);
	}
}
