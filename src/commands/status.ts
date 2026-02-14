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

	const forkCount = existsSync(base)
		? readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory()).length
		: 0;

	const terminal = detectTerminal(config.terminal);

	let exportCount = 0;
	const exportGlob = new Glob("claude-{export,session}-*.md");
	for (const _file of exportGlob.scanSync(root)) {
		exportCount++;
	}

	if (config.json) {
		console.log(
			JSON.stringify({
				project: name,
				root,
				expDir: base,
				forks: forkCount,
				terminal,
				clean: config.clean,
				exports: exportCount,
			}),
		);
		return;
	}

	console.log();
	console.log(`${c.bold("Project:")}  ${c.cyan(name)}`);
	console.log(`${c.bold("Root:")}     ${root}`);
	console.log(`${c.bold("Exp dir:")}  ${base}`);

	if (existsSync(base)) {
		const sizeResult = await exec(["du", "-sh", base]);
		const size = sizeResult.success ? sizeResult.stdout.split("\t")[0] : "?";
		console.log(`${c.bold("Active:")}   ${forkCount} forks (${size})`);
	} else {
		console.log(`${c.bold("Active:")}   0`);
	}

	console.log(`${c.bold("Terminal:")} ${terminal}`);
	if (config.clean.length > 0) {
		console.log(`${c.bold("Clean:")}    ${config.clean.join(" ")}`);
	}

	if (exportCount > 0) {
		console.log(`${c.bold("Exports:")}  ${exportCount} session export(s) in project root`);
	}
	console.log();
}
