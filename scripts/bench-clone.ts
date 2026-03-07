#!/usr/bin/env bun
/**
 * bench-clone.ts
 *
 * Benchmarks clone strategies against the turbo monorepo fixture.
 * Measures wall-clock time and actual disk cost (df before/after).
 *
 * Usage:
 *   bun scripts/bench-clone.ts
 *   bun scripts/bench-clone.ts --fixture /path/to/custom/project
 */

import { FFIType, dlopen } from "bun:ffi";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readlinkSync,
	rmSync,
	symlinkSync,
} from "node:fs";
import { join } from "node:path";

// ── clonefile(2) FFI ─────────────────────────────────────────────────────────

const lib = dlopen("libSystem.B.dylib", {
	clonefile: { args: [FFIType.ptr, FFIType.ptr, FFIType.int], returns: FFIType.int },
});

function clonefile(src: string, dst: string): boolean {
	try {
		const s = Buffer.from(`${src}\0`);
		const d = Buffer.from(`${dst}\0`);
		return lib.symbols.clonefile(s, d, 0) === 0;
	} catch {
		return false;
	}
}

// ── Clone strategies ─────────────────────────────────────────────────────────

interface CloneStats {
	files: number;
	dirs: number;
	symlinks: number;
	skipped: string[];
}

/**
 * Shallow root scan: list root entries, skip excluded, clonefile each remaining
 * entry as an atomic subtree. O(root entries) syscalls instead of O(all files).
 */
function rootScanClone(src: string, dst: string, exclude: Set<string>, stats: CloneStats) {
	mkdirSync(dst, { recursive: true });
	for (const entry of readdirSync(src)) {
		if (exclude.has(entry)) {
			if (!stats.skipped.includes(entry)) stats.skipped.push(entry);
			continue;
		}
		const srcPath = join(src, entry);
		const dstPath = join(dst, entry);
		const stat = lstatSync(srcPath);
		if (stat.isSymbolicLink()) {
			symlinkSync(readlinkSync(srcPath), dstPath);
			stats.symlinks++;
		} else if (stat.isDirectory()) {
			clonefile(srcPath, dstPath); // atomic — entire subtree in one syscall
			stats.dirs++;
		} else {
			clonefile(srcPath, dstPath);
			stats.files++;
		}
	}
}

/**
 * Check if a directory's subtree contains any excluded names.
 * - exclude: names to skip from the clone (e.g., node_modules)
 * - noDescend: names to never recurse INTO when checking (e.g., .git, .next, .turbo)
 *   These are clonefileed atomically — they'll never contain excluded names.
 */
function subtreeHasExcluded(
	dir: string,
	exclude: Set<string>,
	noDescend: Set<string>,
	maxDepth: number,
	depth = 0,
): boolean {
	if (depth >= maxDepth) return false;
	for (const entry of readdirSync(dir)) {
		if (exclude.has(entry)) return true;
		if (noDescend.has(entry)) continue;
		const p = join(dir, entry);
		try {
			if (
				lstatSync(p).isDirectory() &&
				subtreeHasExcluded(p, exclude, noDescend, maxDepth, depth + 1)
			)
				return true;
		} catch {
			/* ignore */
		}
	}
	return false;
}

function smartClone(
	src: string,
	dst: string,
	exclude: Set<string>,
	noDescend: Set<string>,
	stats: CloneStats,
	maxDepth = Number.POSITIVE_INFINITY,
) {
	mkdirSync(dst, { recursive: true });
	for (const entry of readdirSync(src)) {
		if (exclude.has(entry)) {
			if (!stats.skipped.includes(entry)) stats.skipped.push(entry);
			continue;
		}
		const srcPath = join(src, entry);
		const dstPath = join(dst, entry);
		const stat = lstatSync(srcPath);
		if (stat.isSymbolicLink()) {
			symlinkSync(readlinkSync(srcPath), dstPath);
			stats.symlinks++;
		} else if (stat.isDirectory()) {
			if (noDescend.has(entry) || !subtreeHasExcluded(srcPath, exclude, noDescend, maxDepth)) {
				// Known-safe or clean subtree — atomic clonefile
				clonefile(srcPath, dstPath);
				stats.dirs++;
			} else {
				// Contains excluded names — must recurse
				stats.dirs++;
				smartClone(srcPath, dstPath, exclude, noDescend, stats, maxDepth);
			}
		} else {
			clonefile(srcPath, dstPath);
			stats.files++;
		}
	}
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function countInodes(dir: string): Promise<number> {
	const proc = Bun.spawn(["find", dir], { stdout: "pipe", stderr: "pipe" });
	const text = await new Response(proc.stdout).text();
	return text.trim().split("\n").filter(Boolean).length;
}

async function apparentSize(dir: string): Promise<string> {
	const proc = Bun.spawn(["du", "-sh", dir], { stdout: "pipe", stderr: "pipe" });
	const text = await new Response(proc.stdout).text();
	return text.split("\t")[0].trim();
}

async function dfFreeKB(): Promise<number> {
	const proc = Bun.spawn(["df", "-k", "/"], { stdout: "pipe", stderr: "pipe" });
	const text = await new Response(proc.stdout).text();
	const cols = text.trim().split("\n")[1].trim().split(/\s+/);
	return Number.parseInt(cols[3], 10);
}

function kbToHuman(kb: number): string {
	if (Math.abs(kb) < 1024) return `${kb} KB`;
	if (Math.abs(kb) < 1024 * 1024) return `${(kb / 1024).toFixed(1)} MB`;
	return `${(kb / 1024 / 1024).toFixed(2)} GB`;
}

function detectPackageManager(dir: string): string[] | null {
	if (existsSync(join(dir, "bun.lockb")) || existsSync(join(dir, "bun.lock")))
		return ["bun", "install"];
	if (existsSync(join(dir, "pnpm-lock.yaml"))) return ["pnpm", "install"];
	if (existsSync(join(dir, "yarn.lock"))) return ["yarn", "install"];
	if (existsSync(join(dir, "package-lock.json"))) return ["npm", "install"];
	return null;
}

async function runInstall(dir: string, cmd: string[]): Promise<number> {
	const t0 = performance.now();
	const proc = Bun.spawn(cmd, { cwd: dir, stdout: "pipe", stderr: "pipe" });
	await proc.exited;
	return performance.now() - t0;
}

// ── node_modules symlink helpers ─────────────────────────────────────────────

const EXCLUDE = new Set(["node_modules"]);
const NO_DESCEND = new Set([".git", ".next", ".turbo"]);

/** Find all node_modules paths in source (never descends into node_modules or noDescend dirs) */
function findNodeModules(dir: string, maxDepth: number, depth = 0): string[] {
	const results: string[] = [];
	if (depth >= maxDepth) return results;
	for (const entry of readdirSync(dir)) {
		if (NO_DESCEND.has(entry)) continue;
		const p = join(dir, entry);
		if (entry === "node_modules") {
			results.push(p);
			continue; // never enter node_modules
		}
		try {
			if (lstatSync(p).isDirectory()) {
				results.push(...findNodeModules(p, maxDepth, depth + 1));
			}
		} catch {
			/* ignore */
		}
	}
	return results;
}

/** Symlink each node_modules location from source into clone */
function symlinkNodeModules(src: string, dst: string, nmPaths: string[]) {
	for (const nmPath of nmPaths) {
		const rel = nmPath.slice(src.length); // e.g., /node_modules or /apps/web/node_modules
		const dstNm = join(dst, rel);
		symlinkSync(nmPath, dstNm);
	}
}

// ── Benchmark runner ─────────────────────────────────────────────────────────

interface Strategy {
	name: string;
	needsInstall?: boolean;
	run: (src: string, dst: string) => Promise<CloneStats | null>;
}

const strategies: Strategy[] = [
	{
		name: "clonefile(2) whole tree  [baseline]",
		needsInstall: false,
		async run(src, dst) {
			const ok = clonefile(src, dst);
			return ok ? { files: 0, dirs: 0, symlinks: 0, skipped: [] } : null;
		},
	},
	{
		name: "smart-clone (depth 5, noDescend) + symlink nm",
		needsInstall: false,
		async run(src, dst) {
			const stats: CloneStats = { files: 0, dirs: 0, symlinks: 0, skipped: [] };
			const nmPaths = findNodeModules(src, 5);
			smartClone(src, dst, EXCLUDE, NO_DESCEND, stats, 5);
			symlinkNodeModules(src, dst, nmPaths);
			stats.symlinks += nmPaths.length;
			return stats;
		},
	},
	{
		name: "smart-clone (depth 5, noDescend) + install",
		needsInstall: true,
		async run(src, dst) {
			const stats: CloneStats = { files: 0, dirs: 0, symlinks: 0, skipped: [] };
			smartClone(src, dst, EXCLUDE, NO_DESCEND, stats, 5);
			return stats;
		},
	},
	{
		name: "root-scan, exclude node_modules + install",
		needsInstall: true,
		async run(src, dst) {
			const stats: CloneStats = { files: 0, dirs: 0, symlinks: 0, skipped: [] };
			rootScanClone(src, dst, new Set(["node_modules"]), stats);
			return stats;
		},
	},
];

// ── Main ─────────────────────────────────────────────────────────────────────

const fixtureArg = Bun.argv.indexOf("--fixture");
const FIXTURE =
	fixtureArg !== -1
		? Bun.argv[fixtureArg + 1]
		: join(import.meta.dir, "../tests/fixtures/turbo-mono");
const OUT_BASE = "/tmp/exp-bench";

if (!existsSync(FIXTURE)) {
	console.error(`Fixture not found: ${FIXTURE}`);
	console.error("Run: bun scripts/fixture-setup.ts");
	process.exit(1);
}

// Print fixture stats
console.log(`\nFixture: ${FIXTURE}`);
const nmDir = join(FIXTURE, "node_modules");
const turboDir = join(FIXTURE, ".turbo");
if (existsSync(nmDir)) {
	const [inodes, size] = await Promise.all([countInodes(nmDir), apparentSize(nmDir)]);
	console.log(`  node_modules: ${size} apparent, ${inodes.toLocaleString()} inodes`);
}
if (existsSync(turboDir)) {
	const [inodes, size] = await Promise.all([countInodes(turboDir), apparentSize(turboDir)]);
	console.log(`  .turbo:       ${size} apparent, ${inodes.toLocaleString()} inodes`);
}

rmSync(OUT_BASE, { recursive: true, force: true });
mkdirSync(OUT_BASE, { recursive: true });

const installCmd = detectPackageManager(FIXTURE);
console.log(`  package manager: ${installCmd ? installCmd[0] : "unknown (no lockfile found)"}\n`);

console.log("── Results ──────────────────────────────────────────────────────\n");

const results: Array<{
	name: string;
	cloneMs: number;
	installMs: number;
	diskCostKB: number;
	stats: CloneStats | null;
}> = [];

for (const strategy of strategies) {
	const dst = join(OUT_BASE, strategy.name.replace(/[^a-z0-9]+/gi, "-"));
	rmSync(dst, { recursive: true, force: true });

	const before = await dfFreeKB();
	const t0 = performance.now();
	const stats = await strategy.run(FIXTURE, dst);
	const cloneMs = performance.now() - t0;

	let installMs = 0;
	if (strategy.needsInstall && installCmd) {
		installMs = await runInstall(dst, installCmd);
	}

	const after = await dfFreeKB();
	const diskCostKB = before - after;

	results.push({ name: strategy.name, cloneMs, installMs, diskCostKB, stats });

	const fmt = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms.toFixed(0)}ms`);
	console.log(`  ${strategy.name}`);
	if (installMs > 0) {
		console.log(
			`    clone: ${fmt(cloneMs)}   install: ${fmt(installMs)}   total: ${fmt(cloneMs + installMs)}`,
		);
	} else {
		console.log(`    clone: ${fmt(cloneMs)}`);
	}
	console.log(`    disk:  ${kbToHuman(diskCostKB)}`);
	if (stats?.skipped.length) {
		console.log(`    skip:  ${stats.skipped.join(", ")}`);
	}
	if (stats && stats.symlinks > 0) {
		console.log(`    symlinks: ${stats.symlinks} node_modules locations`);
	}
	console.log();

	rmSync(dst, { recursive: true, force: true });
}

// Summary table
console.log("── Summary (time to usable clone) ───────────────────────────────\n");
const baselineMs = results[0].cloneMs + results[0].installMs;
for (const r of results) {
	const total = r.cloneMs + r.installMs;
	const totalStr = (total / 1000).toFixed(2).padStart(6);
	const speedup = total < baselineMs ? ` (${(baselineMs / total).toFixed(1)}x faster)` : "";
	const diskStr = kbToHuman(r.diskCostKB).padStart(10);
	const breakdown =
		r.installMs > 0
			? `  [${(r.cloneMs / 1000).toFixed(2)}s clone + ${(r.installMs / 1000).toFixed(2)}s install]`
			: "";
	console.log(`  ${totalStr}s  ${diskStr}  ${r.name}${speedup}${breakdown}`);
}
console.log();
