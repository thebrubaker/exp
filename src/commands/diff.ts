import { basename } from "node:path";
import type { ExpConfig } from "../core/config.ts";
import { getExpBase, resolveExp } from "../core/experiment.ts";
import { getProjectName, getProjectRoot } from "../core/project.ts";
import { c, dim, err } from "../utils/colors.ts";
import { exec } from "../utils/shell.ts";

const DIFF_EXCLUDES = [
	".exp",
	".git",
	"node_modules",
	".next",
	".turbo",
	"dist",
	"build",
	".cache",
	"__pycache__",
	".DS_Store",
	".pnpm-store",
];

export async function cmdDiff(query: string | undefined, config: ExpConfig) {
	if (!query) {
		err("Usage: exp diff <id>");
		process.exit(1);
	}

	const root = getProjectRoot();
	const base = getExpBase(root, config);
	const expDir = resolveExp(query, base);

	if (!expDir) {
		err(`Not found: ${query}`);
		process.exit(1);
	}

	const name = getProjectName(root);
	const expName = basename(expDir);

	console.log();
	console.log(`${c.bold(`Diff: ${c.cyan(name)} ↔ ${c.magenta(expName)}`)}`);
	console.log();

	const excludeArgs = DIFF_EXCLUDES.flatMap((e) => ["--exclude", e]);
	const result = await exec(["diff", "-rq", root, expDir, ...excludeArgs]);

	// diff returns exit code 1 when files differ — that's normal
	const output = result.stdout || result.stderr;
	if (!output.trim()) {
		dim("  No differences found.");
	} else {
		const lines = output.trim().split("\n");
		for (const line of lines) {
			const display = line.replace(root, "[source]").replace(expDir, "[exp]");
			if (display.includes("Only in [exp]")) {
				console.log(`  ${c.green("+")} ${display}`);
			} else if (display.includes("Only in [source]")) {
				console.log(`  ${c.red("-")} ${display}`);
			} else if (display.includes("differ")) {
				console.log(`  ${c.yellow("~")} ${display}`);
			}
		}
	}

	console.log();
	dim(`Full: diff -r '${root}' '${expDir}' --exclude=node_modules --exclude=.git`);
}
