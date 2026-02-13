import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { confirm } from "@inquirer/prompts";
import { cloneProject } from "../core/clone.ts";
import type { ExpConfig } from "../core/config.ts";
import { getExpBase, resolveExp, slugify } from "../core/experiment.ts";
import { getProjectRoot } from "../core/project.ts";
import { c, dim, err, ok, warn } from "../utils/colors.ts";
import { startSpinner } from "../utils/spinner.ts";
import { timeAgo } from "../utils/time.ts";

interface SnapMetadata {
	name: string;
	description: string;
	created: string;
	source: string;
}

function readSnapMeta(snapDir: string): SnapMetadata | null {
	const metaPath = join(snapDir, ".snap");
	if (!existsSync(metaPath)) return null;
	try {
		return JSON.parse(readFileSync(metaPath, "utf-8"));
	} catch {
		return null;
	}
}

function writeSnapMeta(snapDir: string, meta: SnapMetadata) {
	Bun.write(join(snapDir, ".snap"), JSON.stringify(meta));
}

function getSnapshotsDir(base: string, expName: string): string {
	return join(base, ".snapshots", expName);
}

function resolveSnap(snapshotsDir: string, query: string): string | null {
	if (!existsSync(snapshotsDir)) return null;

	// Direct match
	const direct = join(snapshotsDir, query);
	if (existsSync(direct)) return direct;

	// Partial match
	const entries = readdirSync(snapshotsDir, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.map((e) => e.name)
		.sort();

	const partial = entries.find((e) => e.includes(query));
	if (partial) return join(snapshotsDir, partial);

	return null;
}

// ── Subcommands ──

async function snapCreate(expDir: string, base: string, description: string) {
	const expName = basename(expDir);
	const slug = slugify(description);
	const snapshotsDir = getSnapshotsDir(base, expName);

	if (!existsSync(snapshotsDir)) {
		mkdirSync(snapshotsDir, { recursive: true });
	}

	// Ensure unique name
	let snapName = slug;
	if (existsSync(join(snapshotsDir, snapName))) {
		const ts = Date.now();
		snapName = `${slug}-${ts}`;
	}

	const snapDir = join(snapshotsDir, snapName);

	const spinner = startSpinner(`Snapping ${c.magenta(expName)} → ${c.cyan(snapName)}`);

	await cloneProject(expDir, snapDir);

	writeSnapMeta(snapDir, {
		name: snapName,
		description,
		created: new Date().toISOString(),
		source: expDir,
	});

	spinner.stop();

	ok(`Snapshot ${c.bold(snapName)} created`);
	dim(`  exp snap list ${expName} · exp snap restore ${expName} ${snapName}`);
}

async function snapList(expDir: string, base: string) {
	const expName = basename(expDir);
	const snapshotsDir = getSnapshotsDir(base, expName);

	if (!existsSync(snapshotsDir)) {
		dim(`No snapshots for ${c.cyan(expName)}. Run: exp snap ${expName} "description"`);
		return;
	}

	const entries = readdirSync(snapshotsDir, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.sort((a, b) => a.name.localeCompare(b.name));

	if (entries.length === 0) {
		dim(`No snapshots for ${c.cyan(expName)}. Run: exp snap ${expName} "description"`);
		return;
	}

	console.log();
	console.log(`${c.bold(`Snapshots for ${c.magenta(expName)}`)}`);
	console.log();

	// Build rows
	const rows = entries.map((entry) => {
		const snapDir = join(snapshotsDir, entry.name);
		const meta = readSnapMeta(snapDir);
		return {
			name: entry.name,
			description: meta?.description ?? "",
			created: meta?.created ?? "",
		};
	});

	const maxName = Math.max(...rows.map((r) => r.name.length));
	const maxDesc = Math.max(...rows.map((r) => r.description.length));

	for (const row of rows) {
		const nameCol = c.bold(row.name.padEnd(maxName));
		const descCol = c.dim(row.description.padEnd(maxDesc));
		const timeCol = c.dim(row.created ? timeAgo(row.created) : "?");
		console.log(`  ${nameCol}  ${descCol}  ${timeCol}`);
	}

	console.log();
}

async function snapRestore(expDir: string, base: string, snapQuery: string) {
	const expName = basename(expDir);
	const snapshotsDir = getSnapshotsDir(base, expName);
	const snapDir = resolveSnap(snapshotsDir, snapQuery);

	if (!snapDir) {
		err(`Snapshot not found: ${snapQuery}`);
		dim(`  Run: exp snap list ${expName}`);
		process.exit(1);
	}

	const snapName = basename(snapDir);
	const snapMeta = readSnapMeta(snapDir);
	const desc = snapMeta?.description ?? snapName;

	warn(`Restore ${c.magenta(expName)} from snapshot ${c.cyan(snapName)}?`);
	dim(`  "${desc}"`);
	dim("  A backup snapshot will be created first.");

	const yes = await confirm({ message: "Continue?" });
	if (!yes) {
		dim("Cancelled.");
		return;
	}

	// Auto-backup before restore
	const ts = Date.now();
	const backupName = `pre-restore-${ts}`;
	const backupDir = join(snapshotsDir, backupName);

	const spinner = startSpinner("Creating backup snapshot...");

	await cloneProject(expDir, backupDir);

	writeSnapMeta(backupDir, {
		name: backupName,
		description: `Auto-backup before restoring ${snapName}`,
		created: new Date().toISOString(),
		source: expDir,
	});

	// Remove current experiment content and clone snapshot back
	spinner.update(`Restoring from ${c.cyan(snapName)}...`);

	rmSync(expDir, { recursive: true, force: true });
	await cloneProject(snapDir, expDir);

	spinner.stop();

	ok(`Restored ${c.bold(expName)} from ${c.cyan(snapName)}`);
	dim(`  Backup saved as ${c.dim(backupName)}`);
}

// ── Entry point ──

export async function cmdSnap(args: string[], config: ExpConfig) {
	const root = getProjectRoot();
	const base = getExpBase(root, config);

	// exp snap list <id>
	if (args[0] === "list") {
		const query = args[1];
		if (!query) {
			err("Usage: exp snap list <id>");
			process.exit(1);
		}
		const expDir = resolveExp(query, base);
		if (!expDir) {
			err(`Not found: ${query}`);
			process.exit(1);
		}
		await snapList(expDir, base);
		return;
	}

	// exp snap restore <id> <snap>
	if (args[0] === "restore") {
		const query = args[1];
		const snapQuery = args[2];
		if (!query || !snapQuery) {
			err("Usage: exp snap restore <id> <snap>");
			process.exit(1);
		}
		const expDir = resolveExp(query, base);
		if (!expDir) {
			err(`Not found: ${query}`);
			process.exit(1);
		}
		await snapRestore(expDir, base, snapQuery);
		return;
	}

	// exp snap <id> "description"
	const query = args[0];
	const description = args.slice(1).join(" ");

	if (!query || !description) {
		err('Usage: exp snap <id> "description"');
		dim("       exp snap list <id>");
		dim("       exp snap restore <id> <snap>");
		process.exit(1);
	}

	const expDir = resolveExp(query, base);
	if (!expDir) {
		err(`Not found: ${query}`);
		process.exit(1);
	}

	await snapCreate(expDir, base, description);
}
