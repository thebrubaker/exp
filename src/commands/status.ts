import { existsSync, readdirSync } from "node:fs";
import { Glob } from "bun";
import type { ExpConfig } from "../core/config.ts";
import { getExpBase } from "../core/experiment.ts";
import { getProjectName, getProjectRoot } from "../core/project.ts";
import { c } from "../utils/colors.ts";
import { exec } from "../utils/shell.ts";
import { detectTerminal } from "../utils/terminal.ts";

export async function cmdStatus(config: ExpConfig) {
	const root = getProjectRoot();
	const name = getProjectName(root);
	const base = getExpBase(root, config);

	console.log();
	console.log(`${c.bold("Project:")}  ${c.cyan(name)}`);
	console.log(`${c.bold("Root:")}     ${root}`);
	console.log(`${c.bold("Exp dir:")}  ${base}`);

	if (existsSync(base)) {
		const entries = readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory());
		const sizeResult = await exec(["du", "-sh", base]);
		const size = sizeResult.success ? sizeResult.stdout.split("\t")[0] : "?";
		console.log(`${c.bold("Active:")}   ${entries.length} experiments (${size})`);
	} else {
		console.log(`${c.bold("Active:")}   0`);
	}

	console.log(`${c.bold("Terminal:")} ${detectTerminal(config.terminal)}`);

	// Check for export files
	let exportCount = 0;
	const exportGlob = new Glob("claude-{export,session}-*.md");
	for (const _file of exportGlob.scanSync(root)) {
		exportCount++;
	}

	if (exportCount > 0) {
		console.log(`${c.bold("Exports:")}  ${exportCount} session export(s) in project root`);
	}
	console.log();
}
