import { basename } from "node:path";
import { rmSync } from "node:fs";
import { confirm } from "@inquirer/prompts";
import type { ExpConfig } from "../core/config.ts";
import { getExpBase, resolveExp } from "../core/experiment.ts";
import { getProjectRoot } from "../core/project.ts";
import { c, dim, err, ok, warn } from "../utils/colors.ts";
import { exec } from "../utils/shell.ts";

export async function cmdTrash(query: string | undefined, config: ExpConfig) {
	if (!query) {
		err("Usage: exp trash <id>");
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
	const sizeResult = await exec(["du", "-sh", expDir]);
	const size = sizeResult.success ? sizeResult.stdout.split("\t")[0] : "?";

	warn(`Delete ${c.magenta(expName)}? (${size})`);

	const yes = await confirm({ message: "Confirm?" });
	if (!yes) {
		dim("Cancelled.");
		return;
	}

	rmSync(expDir, { recursive: true, force: true });
	ok(`Trashed ${expName}`);
}
