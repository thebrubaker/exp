import { existsSync, readdirSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { confirm } from "@inquirer/prompts";
import type { ExpConfig } from "../core/config.ts";
import { detectContext } from "../core/context.ts";
import { getDivergedSize } from "../core/divergence.ts";
import { getExpBase, readMetadata, resolveExp } from "../core/experiment.ts";
import { getProjectRoot } from "../core/project.ts";
import { writeCdTarget } from "../utils/cd-file.ts";
import { c, dim, err, ok, warn } from "../utils/colors.ts";
import { fmt } from "../utils/format.ts";

/** Parse args like ["1", "3-5", "8"] into sorted deduplicated numbers [1, 3, 4, 5, 8] */
export function parseTargets(args: string[]): number[] | null {
	const RANGE_RE = /^(\d+)-(\d+)$/;
	const NUM_RE = /^\d+$/;

	// All args must be numbers or ranges — otherwise fall through to single-target
	if (!args.every((a) => NUM_RE.test(a) || RANGE_RE.test(a))) return null;

	const nums = new Set<number>();
	for (const arg of args) {
		const rangeMatch = arg.match(RANGE_RE);
		if (rangeMatch) {
			const lo = Number.parseInt(rangeMatch[1], 10);
			const hi = Number.parseInt(rangeMatch[2], 10);
			const [start, end] = lo <= hi ? [lo, hi] : [hi, lo];
			for (let i = start; i <= end; i++) nums.add(i);
		} else {
			nums.add(Number.parseInt(arg, 10));
		}
	}

	return [...nums].sort((a, b) => a - b);
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
		const size = await getDivergedSize(originalRoot, expDir);
		warn(`Delete ${c.magenta(expName)}? (diverged ${size})`);

		const yes = await confirm({ message: "Confirm?" });
		if (!yes) {
			dim("Cancelled.");
			return;
		}

		const t0 = performance.now();
		rmSync(expDir, { recursive: true, force: true });
		const elapsed = performance.now() - t0;

		if (config.json) {
			console.log(
				JSON.stringify({ trashed: expName, path: expDir, elapsedMs: Math.round(elapsed) }),
			);
		} else {
			ok(`Trashed ${expName} in ${fmt(elapsed)}`);
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

	const t0 = performance.now();
	rmSync(expDir, { recursive: true, force: true });
	const elapsed = performance.now() - t0;

	if (config.json) {
		console.log(JSON.stringify({ trashed: expName, path: expDir, elapsedMs: Math.round(elapsed) }));
	} else {
		ok(`Trashed ${expName} in ${fmt(elapsed)}`);
	}
}

async function trashMultiple(targets: number[], config: ExpConfig, force: boolean) {
	const ctx = detectContext();
	const root = ctx.isClone ? ctx.originalRoot : getProjectRoot();
	const base = getExpBase(root, config);

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

	const t0 = performance.now();
	const trashed: string[] = [];
	for (const { expDir, expName } of resolved) {
		rmSync(expDir, { recursive: true, force: true });
		trashed.push(expName);
	}
	const elapsed = performance.now() - t0;

	if (config.json) {
		console.log(JSON.stringify({ trashed, elapsedMs: Math.round(elapsed) }));
	} else {
		ok(`Trashed ${trashed.length} branch${s} in ${fmt(elapsed)}`);
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

	const entries = readdirSync(base, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.sort((a, b) => a.name.localeCompare(b.name));

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

	const t0 = performance.now();
	const trashed: string[] = [];
	for (const entry of doneBranches) {
		const expDir = join(base, entry.name);
		rmSync(expDir, { recursive: true, force: true });
		trashed.push(entry.name);
	}
	const elapsed = performance.now() - t0;

	if (config.json) {
		console.log(JSON.stringify({ trashed, elapsedMs: Math.round(elapsed) }));
	} else {
		ok(`Trashed ${trashed.length} done branch${s} in ${fmt(elapsed)}`);
	}
}
