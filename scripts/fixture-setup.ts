#!/usr/bin/env bun
/**
 * fixture-setup.ts
 *
 * Creates the bench fixture: a pnpm turbo monorepo with installed deps and
 * build output (.turbo, .next). Run once before bench-clone.ts.
 *
 * Usage:
 *   bun scripts/fixture-setup.ts           # create fixture
 *   bun scripts/fixture-setup.ts --reset   # delete and recreate
 */

import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const FIXTURE_DIR = join(import.meta.dir, "../tests/fixtures/turbo-mono");
const reset = Bun.argv.includes("--reset");

async function run(cmd: string[], cwd?: string) {
	console.log(`  $ ${cmd.join(" ")}`);
	const proc = Bun.spawn(cmd, {
		cwd,
		stdout: "inherit",
		stderr: "inherit",
	});
	const code = await proc.exited;
	if (code !== 0) throw new Error(`Command failed (exit ${code}): ${cmd.join(" ")}`);
}

async function count(dir: string): Promise<number> {
	const proc = Bun.spawn(["find", dir], { stdout: "pipe", stderr: "pipe" });
	const text = await new Response(proc.stdout).text();
	return text.trim().split("\n").filter(Boolean).length;
}

async function size(dir: string): Promise<string> {
	const proc = Bun.spawn(["du", "-sh", dir], { stdout: "pipe", stderr: "pipe" });
	const text = await new Response(proc.stdout).text();
	return text.split("\t")[0];
}

if (reset && existsSync(FIXTURE_DIR)) {
	console.log("Resetting fixture...");
	rmSync(FIXTURE_DIR, { recursive: true, force: true });
}

if (existsSync(FIXTURE_DIR)) {
	console.log(`Fixture already exists at ${FIXTURE_DIR}`);
	console.log("Run with --reset to recreate.\n");

	// Still print stats
	const nmDir = join(FIXTURE_DIR, "node_modules");
	const turboDir = join(FIXTURE_DIR, ".turbo");
	if (existsSync(nmDir)) {
		const [nmInodes, nmSize] = await Promise.all([count(nmDir), size(nmDir)]);
		console.log(`node_modules: ${nmSize} apparent, ${nmInodes.toLocaleString()} inodes`);
	}
	if (existsSync(turboDir)) {
		const [tInodes, tSize] = await Promise.all([count(turboDir), size(turboDir)]);
		console.log(`.turbo:       ${tSize} apparent, ${tInodes.toLocaleString()} inodes`);
	}
	process.exit(0);
}

console.log("Setting up turbo monorepo fixture...\n");

// create-turbo scaffolds a basic pnpm workspace
await run([
	"pnpm",
	"dlx",
	"create-turbo@latest",
	FIXTURE_DIR,
	"--package-manager",
	"pnpm",
	"--skip-install",
]);

// Install deps (populates node_modules)
console.log("\nInstalling dependencies...");
await run(["pnpm", "install"], FIXTURE_DIR);

// Run build to populate .turbo cache
console.log("\nRunning turbo build (populates .turbo cache)...");
await run(["pnpm", "turbo", "build"], FIXTURE_DIR);

console.log("\nFixture ready. Stats:\n");

const nmDir = join(FIXTURE_DIR, "node_modules");
const turboDir = join(FIXTURE_DIR, ".turbo");
const nextDir = join(FIXTURE_DIR, "apps/web/.next");

const dirs = [
	{ label: "node_modules", dir: nmDir },
	{ label: ".turbo", dir: turboDir },
	{ label: "apps/web/.next", dir: nextDir },
];

for (const { label, dir } of dirs) {
	if (!existsSync(dir)) continue;
	const [inodes, apparent] = await Promise.all([count(dir), size(dir)]);
	console.log(
		`  ${label.padEnd(20)} ${apparent.padStart(6)} apparent   ${inodes.toLocaleString().padStart(8)} inodes`,
	);
}

console.log("\nRun benchmarks: bun scripts/bench-clone.ts");
