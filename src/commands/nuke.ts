import { existsSync, readdirSync, rmSync } from "node:fs";
import { input } from "@inquirer/prompts";
import type { ExpConfig } from "../core/config.ts";
import { getExpBase } from "../core/experiment.ts";
import { getProjectName, getProjectRoot } from "../core/project.ts";
import { c, dim, err, ok, warn } from "../utils/colors.ts";
import { exec } from "../utils/shell.ts";

export async function cmdNuke(_args: string[], config: ExpConfig) {
	const root = getProjectRoot();
	const name = getProjectName(root);
	const base = getExpBase(root, config);

	if (!existsSync(base)) {
		dim(`No forks for ${name}`);
		return;
	}

	if (!process.stdin.isTTY) {
		err("exp nuke requires interactive confirmation — a human must run this command.");
		err("To delete individual forks programmatically, use: exp trash <id> --force");
		process.exit(1);
	}

	const entries = readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory());
	const sizeResult = await exec(["du", "-sh", base]);
	const size = sizeResult.success ? sizeResult.stdout.split("\t")[0] : "?";

	warn(`Delete ALL ${entries.length} forks for ${c.cyan(name)}? (${size})`);

	const answer = await input({ message: "Type project name to confirm:" });
	if (answer !== name) {
		dim("Cancelled.");
		return;
	}

	rmSync(base, { recursive: true, force: true });
	ok(`Nuked all forks for ${name}`);
}
