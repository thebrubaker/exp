import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ExpConfig } from "../core/config.ts";
import { getDivergedSize, getFileDivergence, getGitStatus } from "../core/divergence.ts";
import { getExpBase, readMetadata, slugify } from "../core/experiment.ts";
import { getProjectName, getProjectRoot } from "../core/project.ts";
import { c, dim } from "../utils/colors.ts";
import { exec } from "../utils/shell.ts";
import { timeAgo } from "../utils/time.ts";

type ForkStatus = "clean" | "modified" | "unpushed";

interface ExpEntry {
	dirName: string;
	expDir: string;
	description: string;
	created: string;
	status: string;
	forkStatus: ForkStatus;
}

interface ExpDetailEntry extends Omit<ExpEntry, "forkStatus"> {
	gitStatus: string;
	fileDivergence: string;
	divergedSize: string;
	size: string;
}

const NAME_CAP = 30;
const DESC_CAP = 40;

export async function cmdLs(args: string[], config: ExpConfig) {
	const all = args.includes("--all");
	const detail = args.includes("--detail");

	if (config.json) {
		if (all) {
			await printJsonGlobal(config);
		} else {
			await printJson(config);
		}
		return;
	}

	if (all) {
		await printGlobal(detail, config);
		return;
	}

	const root = getProjectRoot();
	const name = getProjectName(root);
	const base = getExpBase(root, config);

	if (!existsSync(base)) {
		dim(`No forks for ${name}. Run: exp new "my idea"`);
		return;
	}

	const entries = readdirSync(base, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.sort((a, b) => a.name.localeCompare(b.name));

	if (entries.length === 0) {
		dim(`No forks for ${name}. Run: exp new "my idea"`);
		return;
	}

	if (detail) {
		await printDetail(entries, base, root, name);
	} else {
		await printCompact(entries, base, root, name);
	}
}

/** Truncate a string to maxLen, appending ellipsis if needed */
export function truncate(str: string, maxLen: number): string {
	if (str.length <= maxLen) return str;
	return `${str.slice(0, maxLen - 1)}\u2026`;
}

/** Extract the slug portion from a fork dir name (e.g., "001-try-redis" -> "try-redis") */
export function extractSlug(dirName: string): string {
	return dirName.replace(/^\d+-/, "");
}

/** Check if description is effectively the same as the slug */
export function descriptionMatchesSlug(description: string, dirName: string): boolean {
	if (!description) return true;
	const slug = extractSlug(dirName);
	return slugify(description) === slug;
}

/** Detect fork status: clean, modified, or unpushed */
async function detectForkStatus(expDir: string): Promise<ForkStatus> {
	if (!existsSync(`${expDir}/.git`)) return "modified";

	// Check for uncommitted changes
	const porcelain = await exec(["git", "status", "--porcelain"], { cwd: expDir });
	const hasUncommitted = porcelain.success && porcelain.stdout.trim().length > 0;

	if (hasUncommitted) return "modified";

	// Check for unpushed commits
	const unpushed = await exec(["git", "log", "@{u}..HEAD", "--oneline"], { cwd: expDir });
	// If command succeeds and has output, there are unpushed commits
	if (unpushed.success && unpushed.stdout.trim().length > 0) return "unpushed";
	// If command fails (no upstream tracking), treat as modified
	if (!unpushed.success) return "modified";

	return "clean";
}

/** Render a colored status dot */
function statusDot(status: ForkStatus): string {
	switch (status) {
		case "clean":
			return c.green("\u25cf");
		case "modified":
			return c.yellow("\u25cf");
		case "unpushed":
			return c.red("\u25cf");
	}
}

/** Print the status legend */
function printLegend() {
	console.log(
		c.dim(
			`  ${c.green("\u25cf")} clean  ${c.yellow("\u25cf")} modified  ${c.red("\u25cf")} unpushed`,
		),
	);
	console.log();
}

async function printCompact(
	entries: { name: string }[],
	base: string,
	_sourceRoot: string,
	projectName: string,
) {
	// Gather fork statuses in parallel (fast: just git status + git log per fork)
	const statusPromises = entries.map(async (entry) => {
		const expDir = `${base}/${entry.name}`;
		const forkStatus = await detectForkStatus(expDir);
		return { name: entry.name, forkStatus };
	});
	const statuses = await Promise.all(statusPromises);
	const statusMap = new Map(statuses.map((s) => [s.name, s.forkStatus]));

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
			forkStatus: statusMap.get(entry.name) ?? "modified",
		};
	});

	// Determine if description column should be shown
	const allDescsMatchSlug = rows.every((r) => descriptionMatchesSlug(r.description, r.dirName));
	const showDesc = !allDescsMatchSlug;

	// Calculate column widths with caps
	const maxName = Math.min(NAME_CAP, Math.max(...rows.map((r) => r.dirName.length)));
	const maxDesc = showDesc
		? Math.min(DESC_CAP, Math.max(...rows.map((r) => r.description.length)))
		: 0;
	const maxTime = Math.max(...rows.map((r) => (r.created ? timeAgo(r.created).length : 1)));

	console.log();
	console.log(`${c.bold(`Forks for ${c.cyan(projectName)}`)}`);
	console.log();

	for (const row of rows) {
		const dot = statusDot(row.forkStatus);
		const nameCol = c.bold(truncate(row.dirName, NAME_CAP).padEnd(maxName));
		const timeCol = c.dim((row.created ? timeAgo(row.created) : "?").padStart(maxTime));

		if (showDesc) {
			const descCol = c.dim(truncate(row.description, DESC_CAP).padEnd(maxDesc));
			console.log(`  ${dot} ${nameCol}  ${descCol}  ${timeCol}`);
		} else {
			console.log(`  ${dot} ${nameCol}  ${timeCol}`);
		}
	}

	console.log();
	printLegend();
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

		const [sizeResult, gitResult, diffResult, divergedSize] = await Promise.all([
			exec(["du", "-sh", expDir]),
			getGitStatus(expDir),
			getFileDivergence(sourceRoot, expDir),
			getDivergedSize(sourceRoot, expDir),
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
			divergedSize,
		} satisfies ExpDetailEntry;
	});

	const details = await Promise.all(detailPromises);

	console.log();
	console.log(`${c.bold(`Forks for ${c.cyan(projectName)}`)}`);
	console.log();

	for (const d of details) {
		const time = d.created ? timeAgo(d.created) : "?";

		console.log(`  ${c.bold(d.dirName)} ${c.dim("·")} ${d.description}`);
		console.log(
			`    ${c.dim(`Created ${time} · ${d.size} apparent · ${d.divergedSize} diverged`)}`,
		);
		console.log(`    ${c.dim(`Git: ${d.gitStatus}`)}`);
		console.log(`    ${c.dim(`Files: ${d.fileDivergence}`)}`);
		console.log();
	}
}

async function printGlobal(detail: boolean, config: ExpConfig) {
	// Scan common locations for .exp-* directories
	const scanPaths = [
		process.env.HOME ? `${process.env.HOME}/Code` : null,
		process.env.HOME ? `${process.env.HOME}/Projects` : null,
		process.env.HOME ? `${process.env.HOME}/Developer` : null,
		process.env.HOME ? `${process.env.HOME}/src` : null,
	].filter(Boolean) as string[];

	// Also check config for custom root
	if (config.root) {
		scanPaths.push(config.root);
	}

	let found = false;

	for (const scanPath of scanPaths) {
		if (!existsSync(scanPath)) continue;

		const entries = readdirSync(scanPath, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isDirectory() || !entry.name.startsWith(".exp-")) continue;

			const projectName = entry.name.replace(/^\.exp-/, "");
			const base = join(scanPath, entry.name);

			const forks = readdirSync(base, { withFileTypes: true })
				.filter((e) => e.isDirectory() && !e.name.startsWith("."))
				.sort((a, b) => a.name.localeCompare(b.name));

			if (forks.length === 0) continue;

			found = true;

			// Build row data for this project
			const rows = forks.map((f) => {
				const expDir = join(base, f.name);
				const meta = readMetadata(expDir);
				return {
					dirName: f.name,
					description: meta?.description ?? "",
					created: meta?.created ?? "",
				};
			});

			// Determine if description column should be shown
			const allDescsMatchSlug = rows.every((r) => descriptionMatchesSlug(r.description, r.dirName));
			const showDesc = !allDescsMatchSlug;

			// Calculate column widths with caps
			const maxName = Math.min(NAME_CAP, Math.max(...rows.map((r) => r.dirName.length)));
			const maxDesc = showDesc
				? Math.min(DESC_CAP, Math.max(...rows.map((r) => r.description.length)))
				: 0;
			const maxTime = Math.max(...rows.map((r) => (r.created ? timeAgo(r.created).length : 1)));

			console.log();
			console.log(`${c.bold(c.cyan(projectName))} ${c.dim(`(${forks.length} forks)`)}`);

			for (const row of rows) {
				const nameCol = c.bold(truncate(row.dirName, NAME_CAP).padEnd(maxName));
				const timeCol = c.dim((row.created ? timeAgo(row.created) : "?").padStart(maxTime));

				if (showDesc) {
					const descCol = c.dim(truncate(row.description, DESC_CAP).padEnd(maxDesc));
					console.log(`  ${nameCol}  ${descCol}  ${timeCol}`);
				} else {
					console.log(`  ${nameCol}  ${timeCol}`);
				}
			}
		}
	}

	if (!found) {
		dim("No forks found. Scanned: ~/Code, ~/Projects, ~/Developer, ~/src");
	}

	console.log();
}

async function printJson(config: ExpConfig) {
	const root = getProjectRoot();
	const name = getProjectName(root);
	const base = getExpBase(root, config);

	if (!existsSync(base)) {
		console.log(JSON.stringify({ project: name, forks: [] }));
		return;
	}

	const entries = readdirSync(base, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.sort((a, b) => a.name.localeCompare(b.name));

	const forks = entries.map((entry) => {
		const expDir = `${base}/${entry.name}`;
		const meta = readMetadata(expDir);
		return {
			name: entry.name,
			path: expDir,
			description: meta?.description ?? "",
			number: meta?.number ?? 0,
			status: meta?.status ?? "active",
			created: meta?.created ?? "",
		};
	});

	console.log(JSON.stringify({ project: name, root, forks }));
}

async function printJsonGlobal(config: ExpConfig) {
	const scanPaths = [
		process.env.HOME ? `${process.env.HOME}/Code` : null,
		process.env.HOME ? `${process.env.HOME}/Projects` : null,
		process.env.HOME ? `${process.env.HOME}/Developer` : null,
		process.env.HOME ? `${process.env.HOME}/src` : null,
	].filter(Boolean) as string[];

	if (config.root) {
		scanPaths.push(config.root);
	}

	const projects: Array<{
		project: string;
		root: string;
		forks: Array<Record<string, unknown>>;
	}> = [];

	for (const scanPath of scanPaths) {
		if (!existsSync(scanPath)) continue;

		const entries = readdirSync(scanPath, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isDirectory() || !entry.name.startsWith(".exp-")) continue;

			const projectName = entry.name.replace(/^\.exp-/, "");
			const base = join(scanPath, entry.name);

			const forks = readdirSync(base, { withFileTypes: true })
				.filter((e) => e.isDirectory() && !e.name.startsWith("."))
				.sort((a, b) => a.name.localeCompare(b.name))
				.map((e) => {
					const expDir = join(base, e.name);
					const meta = readMetadata(expDir);
					return {
						name: e.name,
						path: expDir,
						description: meta?.description ?? "",
						number: meta?.number ?? 0,
						status: meta?.status ?? "active",
						created: meta?.created ?? "",
					};
				});

			if (forks.length > 0) {
				projects.push({
					project: projectName,
					root: join(scanPath, projectName),
					forks,
				});
			}
		}
	}

	console.log(JSON.stringify({ projects }));
}
