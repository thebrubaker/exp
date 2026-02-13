import { existsSync, readdirSync } from "node:fs";
import type { ExpConfig } from "../core/config.ts";
import { getExpBase, readMetadata } from "../core/experiment.ts";
import { getProjectName, getProjectRoot } from "../core/project.ts";
import { c, dim } from "../utils/colors.ts";
import { exec } from "../utils/shell.ts";
import { timeAgo } from "../utils/time.ts";

interface ExpEntry {
	dirName: string;
	expDir: string;
	description: string;
	created: string;
	status: string;
	size: string;
}

interface ExpDetailEntry extends ExpEntry {
	gitStatus: string;
	fileDivergence: string;
}

const DIFF_EXCLUDES = ["node_modules", ".git", ".exp", ".next", ".turbo", "dist", ".DS_Store"];

export async function cmdLs(args: string[], config: ExpConfig) {
	const root = getProjectRoot();
	const name = getProjectName(root);
	const base = getExpBase(root, config);
	const detail = args.includes("--detail");

	if (!existsSync(base)) {
		dim(`No experiments for ${name}. Run: exp new "my idea"`);
		return;
	}

	const entries = readdirSync(base, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.sort((a, b) => a.name.localeCompare(b.name));

	if (entries.length === 0) {
		dim(`No experiments for ${name}. Run: exp new "my idea"`);
		return;
	}

	if (detail) {
		await printDetail(entries, base, root, name);
	} else {
		await printCompact(entries, base, name);
	}
}

async function printCompact(entries: { name: string }[], base: string, projectName: string) {
	// Gather sizes in parallel
	const sizePromises = entries.map((entry) => {
		const expDir = `${base}/${entry.name}`;
		return exec(["du", "-sh", expDir]).then((r) => ({
			name: entry.name,
			size: r.success ? r.stdout.split("\t")[0].trim() : "?",
		}));
	});
	const sizes = await Promise.all(sizePromises);
	const sizeMap = new Map(sizes.map((s) => [s.name, s.size]));

	// Build row data
	const rows: ExpEntry[] = entries.map((entry) => {
		const expDir = `${base}/${entry.name}`;
		const meta = readMetadata(expDir);
		return {
			dirName: entry.name,
			expDir,
			description: meta?.description ?? "",
			created: meta?.created ?? "",
			status: meta?.status ?? "active",
			size: sizeMap.get(entry.name) ?? "?",
		};
	});

	// Calculate column widths for alignment
	const maxName = Math.max(...rows.map((r) => r.dirName.length));
	const maxDesc = Math.max(...rows.map((r) => r.description.length));
	const maxTime = Math.max(...rows.map((r) => (r.created ? timeAgo(r.created).length : 1)));

	console.log();
	console.log(`${c.bold(`Experiments for ${c.cyan(projectName)}`)}`);
	console.log();

	for (const row of rows) {
		const nameCol = c.bold(row.dirName.padEnd(maxName));
		const descCol = c.dim(row.description.padEnd(maxDesc));
		const timeCol = c.dim((row.created ? timeAgo(row.created) : "?").padStart(maxTime));
		const sizeCol = c.dim(row.size.padStart(6));

		console.log(`  ${nameCol}  ${descCol}  ${timeCol}  ${sizeCol}`);
	}

	console.log();
}

async function printDetail(
	entries: { name: string }[],
	base: string,
	sourceRoot: string,
	projectName: string,
) {
	// Gather all async data in parallel
	const detailPromises = entries.map(async (entry) => {
		const expDir = `${base}/${entry.name}`;
		const meta = readMetadata(expDir);

		const [sizeResult, gitResult, diffResult] = await Promise.all([
			exec(["du", "-sh", expDir]),
			getGitStatus(expDir),
			getFileDivergence(sourceRoot, expDir),
		]);

		return {
			dirName: entry.name,
			expDir,
			description: meta?.description ?? "",
			created: meta?.created ?? "",
			status: meta?.status ?? "active",
			size: sizeResult.success ? sizeResult.stdout.split("\t")[0].trim() : "?",
			gitStatus: gitResult,
			fileDivergence: diffResult,
		} satisfies ExpDetailEntry;
	});

	const details = await Promise.all(detailPromises);

	console.log();
	console.log(`${c.bold(`Experiments for ${c.cyan(projectName)}`)}`);
	console.log();

	for (const d of details) {
		const time = d.created ? timeAgo(d.created) : "?";

		console.log(`  ${c.bold(d.dirName)} ${c.dim("·")} ${d.description}`);
		console.log(`    ${c.dim(`Created ${time} · ${d.size}`)}`);
		console.log(`    ${c.dim(`Git: ${d.gitStatus}`)}`);
		console.log(`    ${c.dim(`Files: ${d.fileDivergence}`)}`);
		console.log();
	}
}

async function getGitStatus(expDir: string): Promise<string> {
	if (!existsSync(`${expDir}/.git`)) {
		return "no git";
	}

	const result = await exec(["git", "status", "--porcelain"], {
		cwd: expDir,
	});

	if (!result.success) {
		return "unknown";
	}

	const lines = result.stdout.trim().split("\n").filter(Boolean);
	if (lines.length === 0) {
		return "clean";
	}

	return lines.length === 1 ? "1 uncommitted change" : `${lines.length} uncommitted changes`;
}

async function getFileDivergence(sourceRoot: string, expDir: string): Promise<string> {
	const excludeArgs = DIFF_EXCLUDES.flatMap((ex) => ["--exclude", ex]);
	const result = await exec(["diff", "-rq", ...excludeArgs, sourceRoot, expDir]);

	// diff returns 1 when files differ, 0 when identical, 2 on error
	if (result.exitCode === 2) {
		return "unknown";
	}

	const lines = result.stdout.trim().split("\n").filter(Boolean);
	if (lines.length === 0) {
		return "identical to original";
	}

	return lines.length === 1 ? "1 modified vs original" : `${lines.length} modified vs original`;
}
