import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findDisposableDirs, reclaimDisposable } from "../src/commands/trash.ts";
import type { ExpConfig } from "../src/core/config.ts";
import { parseTargets } from "../src/utils/targets.ts";

describe("parseTargets", () => {
	test("single number", () => {
		expect(parseTargets(["3"])).toEqual([3]);
	});

	test("multiple numbers", () => {
		expect(parseTargets(["1", "3", "5"])).toEqual([1, 3, 5]);
	});

	test("range", () => {
		expect(parseTargets(["1-5"])).toEqual([1, 2, 3, 4, 5]);
	});

	test("reversed range", () => {
		expect(parseTargets(["5-1"])).toEqual([1, 2, 3, 4, 5]);
	});

	test("mixed numbers and ranges", () => {
		expect(parseTargets(["1", "3-5", "8"])).toEqual([1, 3, 4, 5, 8]);
	});

	test("deduplicates overlapping", () => {
		expect(parseTargets(["1-3", "2-4"])).toEqual([1, 2, 3, 4]);
	});

	test("deduplicates explicit + range", () => {
		expect(parseTargets(["3", "1-5"])).toEqual([1, 2, 3, 4, 5]);
	});

	test("returns null for non-numeric args", () => {
		expect(parseTargets(["redis"])).toBeNull();
	});

	test("returns null for mixed numeric and named args", () => {
		expect(parseTargets(["1", "redis"])).toBeNull();
	});

	test("single-element range", () => {
		expect(parseTargets(["3-3"])).toEqual([3]);
	});
});

// ── Shrink (trash --shrink): reclaim disposable dirs, keep the branch ──

const STAMP = `exp-shrink-test-${process.pid}`;
const ROOT = join("/tmp", STAMP);
const BASE = join(ROOT, ".exp-proj");
const BRANCH = join(BASE, "001-test");

const SET = new Set(["node_modules", ".next", ".turbo"]);

function makeConfig(): ExpConfig {
	return {
		root: null,
		terminal: "none",
		openEditor: null,
		clean: [".next", ".turbo"],
		branchPrefix: null,
		autoTerminal: false,
		verbose: false,
		json: false,
		cloneStrategy: "full",
		deferDirs: ["node_modules"],
		memoryBridge: false,
	};
}

/** A realistic branch: disposable dirs (incl. nested + decoy) plus code to keep. */
function makeBranch() {
	// Disposable — top-level + nested workspace node_modules + build output
	mkdirSync(join(BRANCH, "node_modules", "left-pad"), { recursive: true });
	writeFileSync(join(BRANCH, "node_modules", "left-pad", "index.js"), "x");
	mkdirSync(join(BRANCH, "apps", "web", "node_modules"), { recursive: true });
	mkdirSync(join(BRANCH, ".next"), { recursive: true });
	mkdirSync(join(BRANCH, ".turbo"), { recursive: true });
	// Decoy 1: node_modules INSIDE a matched node_modules — must be pruned, not double-counted
	mkdirSync(join(BRANCH, "node_modules", "inner", "node_modules"), { recursive: true });
	// Decoy 2: a dir named node_modules inside .git — .git is skipped entirely
	mkdirSync(join(BRANCH, ".git", "node_modules"), { recursive: true });
	// Code that MUST survive a shrink
	mkdirSync(join(BRANCH, "src"), { recursive: true });
	writeFileSync(join(BRANCH, "src", "index.ts"), "export const x = 1");
	writeFileSync(join(BRANCH, "package.json"), "{}");
}

function cleanup() {
	rmSync(ROOT, { recursive: true, force: true });
}

describe("findDisposableDirs", () => {
	beforeEach(() => {
		cleanup();
		makeBranch();
	});
	afterEach(cleanup);

	test("finds top-level + nested workspace node_modules and build dirs", () => {
		const found = findDisposableDirs(BRANCH, SET);
		expect(found.sort()).toEqual(
			[
				join(BRANCH, ".next"),
				join(BRANCH, ".turbo"),
				join(BRANCH, "apps", "web", "node_modules"),
				join(BRANCH, "node_modules"),
			].sort(),
		);
	});

	test("prunes at matches — does not descend into a matched node_modules", () => {
		const found = findDisposableDirs(BRANCH, SET);
		expect(found).not.toContain(join(BRANCH, "node_modules", "inner", "node_modules"));
	});

	test("skips .git entirely", () => {
		const found = findDisposableDirs(BRANCH, SET);
		expect(found).not.toContain(join(BRANCH, ".git", "node_modules"));
	});

	test("does not follow symlinks (pnpm-style) named like a disposable dir", () => {
		const linkBranch = join(BASE, "002-link");
		mkdirSync(join(linkBranch, "real"), { recursive: true });
		symlinkSync(join(linkBranch, "real"), join(linkBranch, ".next"));
		expect(findDisposableDirs(linkBranch, SET)).toEqual([]);
	});

	test("returns [] for a nonexistent branch (graceful, never throws)", () => {
		expect(findDisposableDirs(join(BASE, "nope"), SET)).toEqual([]);
	});
});

describe("reclaimDisposable", () => {
	beforeEach(() => {
		// Force the foreground rm path — no shell wrapper in the test env.
		// Empty string is falsy for isWrapperActive (assigning undefined would
		// coerce to the truthy string "undefined").
		process.env.EXP_CD_FILE = "";
		cleanup();
		makeBranch();
	});
	afterEach(cleanup);

	test("removes disposable dirs but leaves the branch and its code intact", async () => {
		const result = await reclaimDisposable([BRANCH], BASE, makeConfig());

		expect(result.reclaimed).toBe(4);

		// Disposable weight is gone
		expect(existsSync(join(BRANCH, "node_modules"))).toBe(false);
		expect(existsSync(join(BRANCH, "apps", "web", "node_modules"))).toBe(false);
		expect(existsSync(join(BRANCH, ".next"))).toBe(false);
		expect(existsSync(join(BRANCH, ".turbo"))).toBe(false);

		// Code and history survive — this is the whole point
		expect(existsSync(join(BRANCH, "src", "index.ts"))).toBe(true);
		expect(existsSync(join(BRANCH, "package.json"))).toBe(true);
		expect(existsSync(join(BRANCH, ".git"))).toBe(true);
		// The branch dir itself still exists
		expect(existsSync(BRANCH)).toBe(true);
	});

	test("foreground path leaves no staged orphans in .trash", async () => {
		await reclaimDisposable([BRANCH], BASE, makeConfig());
		const trash = join(BASE, ".trash");
		// Without a shell wrapper the rm runs in the foreground, so nothing
		// should be left staged behind.
		if (existsSync(trash)) {
			expect(readdirSync(trash)).toEqual([]);
		}
	});

	test("reports nothing to reclaim when a branch has no disposable dirs", async () => {
		const clean = join(BASE, "003-clean");
		mkdirSync(join(clean, "src"), { recursive: true });
		writeFileSync(join(clean, "src", "app.ts"), "ok");

		const result = await reclaimDisposable([clean], BASE, makeConfig());
		expect(result.reclaimed).toBe(0);
		expect(existsSync(join(clean, "src", "app.ts"))).toBe(true);
	});
});
