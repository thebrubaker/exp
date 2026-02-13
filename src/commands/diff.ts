import { existsSync } from "node:fs";
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

	const hasGit = existsSync(`${expDir}/.git`);

	if (config.json) {
		await jsonDiff(root, expDir, name, expName, hasGit);
		return;
	}

	if (hasGit) {
		await gitDiff(root, expDir, name, expName, config);
	} else {
		await fsDiff(root, expDir, name, expName);
	}
}

/**
 * Filter lines from git diff output, removing paths that match DIFF_EXCLUDES.
 * Each stat line looks like: " path/to/file | 3 +++" or for --no-index
 * it includes full absolute paths. We check if any exclude pattern appears
 * as a path segment.
 */
export function filterExcludedLines(lines: string[], excludes: string[]): string[] {
	return lines.filter((line) => {
		for (const ex of excludes) {
			// Match as a path segment: /node_modules/ or starts with node_modules/
			if (line.includes(`/${ex}/`) || line.includes(`/${ex} `)) {
				return false;
			}
		}
		return true;
	});
}

/**
 * Rewrite absolute paths in stat output to shorter relative-looking labels.
 * e.g., "/Users/joel/Code/my-project/src/index.ts" -> "[source]/src/index.ts"
 */
export function rewritePaths(line: string, root: string, expDir: string): string {
	return line.replace(root, "[source]").replace(expDir, "[exp]");
}

async function gitDiff(
	root: string,
	expDir: string,
	name: string,
	expName: string,
	config: ExpConfig,
) {
	// Get branch name in experiment
	const branchResult = await exec(["git", "-C", expDir, "branch", "--show-current"]);
	const branch = branchResult.stdout.trim() || "detached HEAD";

	// Get uncommitted changes count
	const statusResult = await exec(["git", "-C", expDir, "status", "--porcelain"]);
	const uncommitted = statusResult.stdout.trim()
		? statusResult.stdout.trim().split("\n").length
		: 0;

	// Header
	console.log();
	console.log(`  ${c.bold(`Diff: ${c.cyan(name)} ${c.dim("↔")} ${c.magenta(expName)}`)}`);

	// Branch info
	const branchInfo = `  Branch: ${c.cyan(branch)}`;
	const uncommittedInfo =
		uncommitted > 0
			? ` ${c.dim("·")} ${c.yellow(`${uncommitted} uncommitted change${uncommitted === 1 ? "" : "s"}`)}`
			: "";
	console.log(branchInfo + uncommittedInfo);
	console.log();

	// Stat summary via git diff --no-index
	const statResult = await exec([
		"git",
		"diff",
		"--no-index",
		"--stat",
		"--color=always",
		root,
		expDir,
	]);

	// git diff --no-index exits 1 when there are differences — that's normal
	const statOutput = statResult.stdout || statResult.stderr;

	if (!statOutput.trim()) {
		dim("  No differences found.");
		console.log();
		return;
	}

	// Filter and display stat lines
	const statLines = statOutput.trim().split("\n");
	const filtered = filterExcludedLines(statLines, DIFF_EXCLUDES);

	for (const line of filtered) {
		const display = rewritePaths(line, root, expDir);
		console.log(`  ${display}`);
	}

	console.log();

	// Full diff if verbose
	if (config.verbose) {
		const fullResult = await exec(["git", "diff", "--no-index", "--color=always", root, expDir]);

		const fullOutput = fullResult.stdout || fullResult.stderr;
		if (fullOutput.trim()) {
			const fullLines = fullOutput.trim().split("\n");
			const filteredFull = filterExcludedLines(fullLines, DIFF_EXCLUDES);
			for (const line of filteredFull) {
				console.log(rewritePaths(line, root, expDir));
			}
			console.log();
		}
	}

	dim("  Merge path: commit → push → PR");
}

async function fsDiff(root: string, expDir: string, name: string, expName: string) {
	console.log();
	console.log(`  ${c.bold(`Diff: ${c.cyan(name)} ${c.dim("↔")} ${c.magenta(expName)}`)}`);
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
	dim(`  Full: diff -r '${root}' '${expDir}' --exclude=node_modules --exclude=.git`);
}

async function jsonDiff(
	root: string,
	expDir: string,
	name: string,
	expName: string,
	hasGit: boolean,
) {
	let branch: string | null = null;
	let uncommitted = 0;

	if (hasGit) {
		const branchResult = await exec(["git", "-C", expDir, "branch", "--show-current"]);
		branch = branchResult.stdout.trim() || null;

		const statusResult = await exec(["git", "-C", expDir, "status", "--porcelain"]);
		uncommitted = statusResult.stdout.trim() ? statusResult.stdout.trim().split("\n").length : 0;
	}

	// Get file-level differences
	const excludeArgs = DIFF_EXCLUDES.flatMap((e) => ["--exclude", e]);
	const result = await exec(["diff", "-rq", root, expDir, ...excludeArgs]);

	const files: Array<{ path: string; status: "modified" | "added" | "removed" }> = [];

	if (result.stdout.trim()) {
		for (const line of result.stdout.trim().split("\n").filter(Boolean)) {
			const differMatch = line.match(/^Files (.+) and (.+) differ$/);
			if (differMatch) {
				const relPath = differMatch[2].replace(`${expDir}/`, "");
				files.push({ path: relPath, status: "modified" });
				continue;
			}

			const onlyInMatch = line.match(/^Only in (.+): (.+)$/);
			if (onlyInMatch) {
				const dir = onlyInMatch[1];
				const fileName = onlyInMatch[2];
				if (dir.startsWith(expDir) || dir === expDir) {
					const relPath = `${dir.replace(`${expDir}/`, "").replace(expDir, "")}${dir === expDir ? "" : "/"}${fileName}`;
					files.push({ path: relPath.replace(/^\//, ""), status: "added" });
				} else {
					const relPath = `${dir.replace(`${root}/`, "").replace(root, "")}${dir === root ? "" : "/"}${fileName}`;
					files.push({ path: relPath.replace(/^\//, ""), status: "removed" });
				}
			}
		}
	}

	console.log(
		JSON.stringify({
			project: name,
			experiment: expName,
			path: expDir,
			branch,
			uncommitted,
			files,
		}),
	);
}
