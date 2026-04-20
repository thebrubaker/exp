import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
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

async function stageOne(expDir: string, trashDir: string): Promise<string> {
	const stagedName = `${basename(expDir)}.${Bun.randomUUIDv7().slice(0, 8)}`;
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

	const stagedName = `${basename(expDir)}.${Bun.randomUUIDv7().slice(0, 8)}`;
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

export async function cmdTrash(args: string[], config: ExpConfig) {
	const flags = args.filter((a) => a.startsWith("-"));
	const positional = args.filter((a) => !a.startsWith("-"));
	const query = positional[0];
	const force = flags.includes("--force") || flags.includes("-y");
	const trashDone = flags.includes("--done");

	// ── Batch trash all done branches ──
	if (trashDone) {
		await trashAllDone(config, force);
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
		await trashMultiple(targets, config, force);
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

async function trashMultiple(targets: number[], config: ExpConfig, force: boolean) {
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
		err("No matching branches to trash.");
		process.exit(1);
	}

	const s = resolved.length === 1 ? "" : "es";
	warn(`${resolved.length} branch${s} to trash:`);
	for (const { expName } of resolved) {
		console.log(`  ${c.dim(expName)}`);
	}

	if (!force) {
		if (!process.stdin.isTTY) {
			err("Cannot confirm interactively (no TTY). Use --force or -y to skip confirmation.");
			process.exit(1);
		}

		const yes = await confirm({ message: `Trash ${resolved.length} branch${s}?` });
		if (!yes) {
			dim("Cancelled.");
			return;
		}
	}

	const { elapsedMs, deferred } = await stageAndDefer(
		resolved.map((r) => r.expDir),
		base,
	);
	const trashed = resolved.map((r) => r.expName);

	if (config.json) {
		console.log(JSON.stringify({ trashed, elapsedMs: Math.round(elapsedMs), deferred }));
	} else {
		ok(`Trashed ${trashed.length} branch${s} in ${fmt(elapsedMs)}${deferredSuffix(deferred)}`);
	}
}

async function trashAllDone(config: ExpConfig, force: boolean) {
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
		dim("No done branches to trash.");
		return;
	}

	const s = doneBranches.length === 1 ? "" : "es";
	warn(`${doneBranches.length} done branch${s} to trash:`);
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

		const yes = await confirm({ message: `Trash all ${doneBranches.length} done branch${s}?` });
		if (!yes) {
			dim("Cancelled.");
			return;
		}
	}

	const { elapsedMs, deferred } = await stageAndDefer(
		doneBranches.map((e) => join(base, e.name)),
		base,
	);
	const trashed = doneBranches.map((e) => e.name);

	if (config.json) {
		console.log(JSON.stringify({ trashed, elapsedMs: Math.round(elapsedMs), deferred }));
	} else {
		ok(`Trashed ${trashed.length} done branch${s} in ${fmt(elapsedMs)}${deferredSuffix(deferred)}`);
	}
}
