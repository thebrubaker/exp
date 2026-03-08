import { basename } from "node:path";
import type { ExpConfig } from "../core/config.ts";
import { detectContext } from "../core/context.ts";
import {
	getExpBase,
	readMetadata,
	resolveExp,
	writeMetadata,
} from "../core/experiment.ts";
import { getProjectRoot } from "../core/project.ts";
import { c, dim, err, ok } from "../utils/colors.ts";

export async function cmdDone(args: string[], config: ExpConfig) {
	const flags = args.filter((a) => a.startsWith("-"));
	const positional = args.filter((a) => !a.startsWith("-"));
	const query = positional[0];
	const undo = flags.includes("--undo");

	// ── No args: mark current clone (if inside one) ──
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

	// ── By ID ──
	const root = getProjectRoot();
	const base = getExpBase(root, config);
	const expDir = resolveExp(query, base);

	if (!expDir) {
		err(`Not found: ${query}`);
		process.exit(1);
	}

	const expName = basename(expDir);
	toggleDone(expDir, expName, undo, config);
}

function toggleDone(
	expDir: string,
	expName: string,
	undo: boolean,
	config: ExpConfig,
) {
	const meta = readMetadata(expDir);
	if (!meta) {
		err(`No metadata found for ${expName}`);
		process.exit(1);
	}

	if (undo) {
		meta.status = "active";
		delete meta.doneAt;
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
			console.log(
				JSON.stringify({ name: expName, status: "done", doneAt: meta.doneAt }),
			);
		} else {
			ok(`${expName} marked done — safe to trash later`);
		}
	}
}
