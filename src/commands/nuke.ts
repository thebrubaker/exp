import { existsSync, readdirSync, rmSync } from "node:fs";
import { input } from "@inquirer/prompts";
import type { ExpConfig } from "../core/config.ts";
import { getExpBase } from "../core/experiment.ts";
import { getProjectName, getProjectRoot } from "../core/project.ts";
import { c, dim, err, ok, warn } from "../utils/colors.ts";
import { exec } from "../utils/shell.ts";

export async function cmdNuke(args: string[], config: ExpConfig) {
	const force = args.includes("--force") || args.includes("-y");

	const root = getProjectRoot();
	const name = getProjectName(root);
	const base = getExpBase(root, config);

	if (!existsSync(base)) {
		dim(`No forks for ${name}`);
		return;
	}

	const entries = readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory());

	if (!force) {
		if (!process.stdin.isTTY) {
			err(`Cannot confirm interactively (no TTY). Use --force or -y to skip confirmation.`);
			process.exit(1);
		}

		const sizeResult = await exec(["du", "-sh", base]);
		const size = sizeResult.success ? sizeResult.stdout.split("\t")[0] : "?";
		warn(`Delete ALL ${entries.length} forks for ${c.cyan(name)}? (${size})`);

		const answer = await input({ message: "Type project name to confirm:" });
		if (answer !== name) {
			dim("Cancelled.");
			return;
		}
	}

	const count = entries.length;
	rmSync(base, { recursive: true, force: true });

	if (config.json) {
		console.log(JSON.stringify({ nuked: name, count }));
	} else {
		ok(`Nuked all forks for ${name}`);
	}
}
