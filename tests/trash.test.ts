import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	extractFlagValue,
	filterByAge,
	findDisposableDirs,
	reclaimDisposable,
} from "../src/commands/trash.ts";
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

// ── Age-based selection (--older-than) ──

describe("extractFlagValue", () => {
	test("--flag value form: pulls value, strips both from rest", () => {
		const r = extractFlagValue(["--older-than", "20", "1", "3-5"], "--older-than");
		expect(r.found).toBe(true);
		expect(r.value).toBe("20");
		expect(r.rest).toEqual(["1", "3-5"]); // value did NOT leak into positionals
	});

	test("--flag=value form", () => {
		const r = extractFlagValue(["--older-than=3w", "--shrink"], "--older-than");
		expect(r.found).toBe(true);
		expect(r.value).toBe("3w");
		expect(r.rest).toEqual(["--shrink"]);
	});

	test("flag present but value missing (next token is a flag)", () => {
		const r = extractFlagValue(["--older-than", "--force"], "--older-than");
		expect(r.found).toBe(true);
		expect(r.value).toBeNull();
		expect(r.rest).toEqual(["--force"]);
	});

	test("flag absent", () => {
		const r = extractFlagValue(["1", "--shrink"], "--older-than");
		expect(r.found).toBe(false);
		expect(r.value).toBeNull();
		expect(r.rest).toEqual(["1", "--shrink"]);
	});
});

describe("filterByAge", () => {
	const STAMP = `exp-age-test-${process.pid}`;
	const ROOT = join("/tmp", STAMP);
	const AGE_BASE = join(ROOT, ".exp-proj");

	const DAY = 86_400_000;

	/** Create a branch dir with a .exp metadata file whose created is `daysOld` ago. */
	function ageBranch(name: string, daysOld: number | null) {
		const dir = join(AGE_BASE, name);
		mkdirSync(dir, { recursive: true });
		if (daysOld === null) {
			// metadata present but no/garbage created → unknown age
			writeFileSync(join(dir, ".exp"), JSON.stringify({ name }));
		} else {
			const created = new Date(Date.now() - daysOld * DAY).toISOString();
			writeFileSync(join(dir, ".exp"), JSON.stringify({ name, created }));
		}
		return dir;
	}

	beforeEach(() => rmSync(ROOT, { recursive: true, force: true }));
	afterEach(() => rmSync(ROOT, { recursive: true, force: true }));

	test("keeps branches at/over the threshold, drops younger ones", () => {
		const old = ageBranch("001-old", 30);
		const edge = ageBranch("002-edge", 20);
		ageBranch("003-young", 5);

		const { kept, skippedUnknown } = filterByAge([old, edge, join(AGE_BASE, "003-young")], 20);
		expect(kept.map((k) => k.expName).sort()).toEqual(["001-old", "002-edge"]);
		expect(skippedUnknown).toEqual([]);
	});

	test("never sweeps unknown-age branches — reports them as skipped", () => {
		const old = ageBranch("001-old", 40);
		const unknown = ageBranch("002-unknown", null);

		const { kept, skippedUnknown } = filterByAge([old, unknown], 10);
		expect(kept.map((k) => k.expName)).toEqual(["001-old"]);
		expect(skippedUnknown).toEqual(["002-unknown"]);
	});

	test("empty kept set when nothing meets the threshold", () => {
		const young = ageBranch("001-young", 2);
		const { kept } = filterByAge([young], 30);
		expect(kept).toEqual([]);
	});
});
