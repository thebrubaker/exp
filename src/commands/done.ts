import { basename } from "node:path";
import type { ExpConfig } from "../core/config.ts";
import { detectContext } from "../core/context.ts";
import { getExpBase, readMetadata, resolveExp, writeMetadata } from "../core/experiment.ts";
import { getProjectRoot } from "../core/project.ts";
import { c, dim, err, ok, warn } from "../utils/colors.ts";
import { parseTargets } from "../utils/targets.ts";

export async function cmdDone(args: string[], config: ExpConfig) {
	const flags = args.filter((a) => a.startsWith("-"));
	const positional = args.filter((a) => !a.startsWith("-"));
	const query = positional[0];
	const undo = flags.includes("--undo");

	// ── No args: mark current branch (if inside one) ──
	if (!query) {
		const context = detectContext();
		if (!context.isClone) {
			err("Usage: exp done [id] [--undo]");
			process.exit(1);
		}

		const { expDir, expName } = context;
		toggleDone(expDir, expName, undo, config);
		return;
	}

	// ── Multi-target: exp done 1 3-5 8 ──
	const isMulti = positional.length > 1 || /^\d+-\d+$/.test(positional[0]);
	const targets = isMulti ? parseTargets(positional) : null;
	if (targets) {
		doneMultiple(targets, undo, config);
		return;
	}

	// ── Single target by ID ──
	const ctx = detectContext();
	const root = ctx.isClone ? ctx.originalRoot : getProjectRoot();
	const base = getExpBase(root, config);
	const expDir = resolveExp(query, base);

	if (!expDir) {
		err(`Not found: ${query}`);
		process.exit(1);
	}

	const expName = basename(expDir);
	toggleDone(expDir, expName, undo, config);
}

function doneMultiple(targets: number[], undo: boolean, config: ExpConfig) {
	const ctx = detectContext();
	const root = ctx.isClone ? ctx.originalRoot : getProjectRoot();
	const base = getExpBase(root, config);

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
		err("No matching branches.");
		process.exit(1);
	}

	const action = undo ? "active" : "done";
	const results: { name: string; status: string; doneAt?: string }[] = [];

	for (const { expDir, expName } of resolved) {
		const meta = readMetadata(expDir);
		if (!meta) {
			warn(`No metadata for ${expName}, skipping`);
			continue;
		}

		if (undo) {
			meta.status = "active";
			meta.doneAt = undefined;
			writeMetadata(expDir, meta);
			results.push({ name: expName, status: "active" });
		} else {
			meta.status = "done";
			meta.doneAt = new Date().toISOString();
			writeMetadata(expDir, meta);
			results.push({ name: expName, status: "done", doneAt: meta.doneAt });
		}

		if (!config.json) {
			const msg = undo ? `${expName} marked active` : `${expName} marked done`;
			ok(msg);
		}
	}

	if (config.json) {
		console.log(JSON.stringify(results));
	}
}

function toggleDone(expDir: string, expName: string, undo: boolean, config: ExpConfig) {
	const meta = readMetadata(expDir);
	if (!meta) {
		err(`No metadata found for ${expName}`);
		process.exit(1);
	}

	if (undo) {
		meta.status = "active";
		meta.doneAt = undefined;
		writeMetadata(expDir, meta);

		if (config.json) {
			console.log(JSON.stringify({ name: expName, status: "active" }));
		} else {
			ok(`${expName} marked active`);
		}
	} else {
		meta.status = "done";
		meta.doneAt = new Date().toISOString();
		writeMetadata(expDir, meta);

		if (config.json) {
			console.log(JSON.stringify({ name: expName, status: "done", doneAt: meta.doneAt }));
		} else {
			ok(`${expName} marked done — safe to trash later`);
		}
	}
}
