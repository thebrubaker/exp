import { rmSync } from "node:fs";
import { basename } from "node:path";
import { confirm } from "@inquirer/prompts";
import type { ExpConfig } from "../core/config.ts";
import { getExpBase, resolveExp } from "../core/experiment.ts";
import { getProjectRoot } from "../core/project.ts";
import { c, dim, err, ok, warn } from "../utils/colors.ts";
import { exec } from "../utils/shell.ts";

export async function cmdTrash(args: string[], config: ExpConfig) {
	const flags = args.filter((a) => a.startsWith("-"));
	const positional = args.filter((a) => !a.startsWith("-"));
	const query = positional[0];
	const force = flags.includes("--force") || flags.includes("-y");

	if (!query) {
		err("Usage: exp trash <id> [--force|-y]");
		process.exit(1);
	}

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
			err(`Cannot confirm interactively (no TTY). Use --force or -y to skip confirmation.`);
			process.exit(1);
		}

		const sizeResult = await exec(["du", "-sh", expDir]);
		const size = sizeResult.success ? sizeResult.stdout.split("\t")[0] : "?";
		warn(`Delete ${c.magenta(expName)}? (${size})`);

		const yes = await confirm({ message: "Confirm?" });
		if (!yes) {
			dim("Cancelled.");
			return;
		}
	}

	rmSync(expDir, { recursive: true, force: true });

	if (config.json) {
		console.log(JSON.stringify({ trashed: expName, path: expDir }));
	} else {
		ok(`Trashed ${expName}`);
	}
}
