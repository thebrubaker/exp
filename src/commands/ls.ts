import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ExpConfig } from "../core/config.ts";
import { getDivergedSize, getFileDivergence, getGitStatus } from "../core/divergence.ts";
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
	divergedSize: string;
}

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

async function printCompact(
	entries: { name: string }[],
	base: string,
	sourceRoot: string,
	projectName: string,
) {
	// Gather diverged sizes in parallel
	const sizePromises = entries.map(async (entry) => {
		const expDir = `${base}/${entry.name}`;
		const size = await getDivergedSize(sourceRoot, expDir);
		return { name: entry.name, size };
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
	console.log(`${c.bold(`Forks for ${c.cyan(projectName)}`)}`);
	console.log();

	for (const row of rows) {
		const nameCol = c.bold(row.dirName.padEnd(maxName));
		const descCol = c.dim(row.description.padEnd(maxDesc));
		const timeCol = c.dim((row.created ? timeAgo(row.created) : "?").padStart(maxTime));
		const sizeCol = c.dim(`${row.size} extra`.padStart(12));

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
			const sourceRoot = join(scanPath, projectName);

			const forks = readdirSync(base, { withFileTypes: true })
				.filter((e) => e.isDirectory() && !e.name.startsWith("."))
				.sort((a, b) => a.name.localeCompare(b.name));

			if (forks.length === 0) continue;

			found = true;

			console.log();
			console.log(`${c.bold(c.cyan(projectName))} ${c.dim(`(${forks.length} forks)`)}`);

			for (const f of forks) {
				const expDir = join(base, f.name);
				const meta = readMetadata(expDir);
				const desc = meta?.description ?? "";
				const time = meta?.created ? timeAgo(meta.created) : "?";
				console.log(`  ${c.bold(f.name)}  ${c.dim(desc)}  ${c.dim(time)}`);
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
