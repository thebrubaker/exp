import { rmSync } from "node:fs";
import { basename } from "node:path";
import { confirm } from "@inquirer/prompts";
import type { ExpConfig } from "../core/config.ts";
import { detectContext } from "../core/context.ts";
import { getDivergedSize } from "../core/divergence.ts";
import { getExpBase, readMetadata, resolveExp } from "../core/experiment.ts";
import { getProjectRoot } from "../core/project.ts";
import { writeCdTarget } from "../utils/cd-file.ts";
import { c, dim, err, ok, warn } from "../utils/colors.ts";
import { fmt } from "../utils/format.ts";

export async function cmdTrash(args: string[], config: ExpConfig) {
	const flags = args.filter((a) => a.startsWith("-"));
	const positional = args.filter((a) => !a.startsWith("-"));
	const query = positional[0];
	const force = flags.includes("--force") || flags.includes("-y");

	// ── Self-trash: no args, inside a fork ──
	if (!query) {
		const context = detectContext();
		if (!context.isFork) {
			err("Usage: exp trash <id> [--force|-y]");
			process.exit(1);
		}

		// Self-trash requires TTY — user should be explicit
		if (!process.stdin.isTTY) {
			err("Cannot self-trash without TTY. Use exp trash <id> --force from outside the fork.");
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

	// ── Standard trash by ID ──
	const root = getProjectRoot();
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
