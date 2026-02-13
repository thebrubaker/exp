import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { filterExcludedLines, rewritePaths } from "../src/commands/diff.ts";
import { exec } from "../src/utils/shell.ts";

const TMP = "/tmp/exp-test-diff";

beforeEach(() => {
	rmSync(TMP, { recursive: true, force: true });
	mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
	rmSync(TMP, { recursive: true, force: true });
});

describe("filterExcludedLines", () => {
	const excludes = [".git", "node_modules", ".next", "dist"];

	test("keeps lines without excluded paths", () => {
		const lines = [
			" src/index.ts  | 12 +++---",
			" src/config.ts |  3 ++-",
			" 2 files changed, 8 insertions(+), 7 deletions(-)",
		];
		expect(filterExcludedLines(lines, excludes)).toEqual(lines);
	});

	test("filters lines containing excluded path segments", () => {
		const lines = [
			" /tmp/project/src/index.ts  | 12 +++---",
			" /tmp/project/node_modules/chalk/index.js | 1 +",
			" /tmp/project/.git/config | 2 +-",
			" /tmp/project/.next/cache/data.json | 5 +++",
			" /tmp/project/dist/exp.js | 100 ++++",
		];
		const filtered = filterExcludedLines(lines, excludes);
		expect(filtered).toEqual([" /tmp/project/src/index.ts  | 12 +++---"]);
	});

	test("handles empty lines array", () => {
		expect(filterExcludedLines([], excludes)).toEqual([]);
	});

	test("handles empty excludes array", () => {
		const lines = [" src/index.ts | 1 +", " node_modules/pkg/index.js | 1 +"];
		expect(filterExcludedLines(lines, [])).toEqual(lines);
	});

	test("does not filter partial matches within file names", () => {
		const lines = [
			" src/distribution.ts | 3 +++", // contains "dist" but not as segment
			" src/builder.ts | 2 ++", // contains "build" but not as segment
		];
		// "dist" excluded but "distribution.ts" should not match since
		// we check for /dist/ or /dist (space), not substring
		expect(filterExcludedLines(lines, ["dist", "build"])).toEqual(lines);
	});
});

describe("rewritePaths", () => {
	test("replaces root path with [source]", () => {
		const line = " /Users/joel/Code/my-project/src/index.ts | 12 +++---";
		const result = rewritePaths(line, "/Users/joel/Code/my-project", "/tmp/exp/001-test");
		expect(result).toBe(" [source]/src/index.ts | 12 +++---");
	});

	test("replaces exp path with [exp]", () => {
		const line = " /tmp/exp/001-test/src/index.ts | 12 +++---";
		const result = rewritePaths(line, "/Users/joel/Code/my-project", "/tmp/exp/001-test");
		expect(result).toBe(" [exp]/src/index.ts | 12 +++---");
	});

	test("handles lines with no paths to replace", () => {
		const line = " 2 files changed, 8 insertions(+), 7 deletions(-)";
		const result = rewritePaths(line, "/Users/joel/Code/my-project", "/tmp/exp/001-test");
		expect(result).toBe(line);
	});
});

describe("git diff integration", () => {
	const sourceDir = join(TMP, "source");
	const expDir = join(TMP, "001-test-exp");

	beforeEach(async () => {
		// Set up source as a git repo
		mkdirSync(join(sourceDir, "src"), { recursive: true });
		writeFileSync(join(sourceDir, "src", "index.ts"), 'console.log("hello");\n');
		writeFileSync(join(sourceDir, "README.md"), "# Project\n");
		await exec(["git", "init"], { cwd: sourceDir });
		await exec(["git", "add", "."], { cwd: sourceDir });
		await exec(
			["git", "-c", "user.name=Test", "-c", "user.email=t@t.com", "commit", "-m", "init"],
			{
				cwd: sourceDir,
			},
		);

		// Set up experiment as a git repo with changes
		mkdirSync(join(expDir, "src"), { recursive: true });
		writeFileSync(join(expDir, "src", "index.ts"), 'console.log("hello world");\n');
		writeFileSync(join(expDir, "README.md"), "# Project\n");
		writeFileSync(join(expDir, "src", "config.ts"), "export const PORT = 3000;\n");
		await exec(["git", "init"], { cwd: expDir });
		await exec(["git", "checkout", "-b", "exp/test-feature"], { cwd: expDir });
		await exec(["git", "add", "."], { cwd: expDir });
		await exec(
			["git", "-c", "user.name=Test", "-c", "user.email=t@t.com", "commit", "-m", "changes"],
			{
				cwd: expDir,
			},
		);
	});

	test("git diff --no-index detects file differences", async () => {
		const result = await exec(["git", "diff", "--no-index", "--stat", sourceDir, expDir]);

		// Should have output (exit code 1 means differences found)
		const output = result.stdout || result.stderr;
		expect(output).toContain("index.ts");
		expect(output).toContain("config.ts");
	});

	test("git branch --show-current reports experiment branch", async () => {
		const result = await exec(["git", "-C", expDir, "branch", "--show-current"]);
		expect(result.stdout.trim()).toBe("exp/test-feature");
	});

	test("git status --porcelain counts uncommitted changes", async () => {
		// Add an uncommitted change
		writeFileSync(join(expDir, "src", "new-file.ts"), "// new\n");

		const result = await exec(["git", "-C", expDir, "status", "--porcelain"]);
		const lines = result.stdout.trim().split("\n").filter(Boolean);
		expect(lines.length).toBe(1);
	});

	test("git diff --no-index with filtering removes noise", async () => {
		// Add node_modules noise to experiment
		mkdirSync(join(expDir, "node_modules", "pkg"), { recursive: true });
		writeFileSync(join(expDir, "node_modules", "pkg", "index.js"), "module.exports = {};\n");

		const result = await exec(["git", "diff", "--no-index", "--stat", sourceDir, expDir]);

		const output = result.stdout || result.stderr;
		const lines = output.trim().split("\n");
		const filtered = filterExcludedLines(lines, ["node_modules", ".git", ".next"]);

		// Filtered output should not contain node_modules
		for (const line of filtered) {
			expect(line).not.toContain("node_modules");
		}
	});
});

describe("fs diff fallback", () => {
	const sourceDir = join(TMP, "source-nongit");
	const expDir = join(TMP, "001-exp-nongit");

	beforeEach(() => {
		// Set up source without git
		mkdirSync(join(sourceDir, "src"), { recursive: true });
		writeFileSync(join(sourceDir, "src", "index.ts"), 'console.log("hello");\n');

		// Set up experiment without git, with changes
		mkdirSync(join(expDir, "src"), { recursive: true });
		writeFileSync(join(expDir, "src", "index.ts"), 'console.log("hello world");\n');
		writeFileSync(join(expDir, "src", "config.ts"), "export const PORT = 3000;\n");
	});

	test("diff -rq detects file differences", async () => {
		const result = await exec(["diff", "-rq", sourceDir, expDir]);
		const output = result.stdout || result.stderr;
		expect(output).toContain("index.ts");
		expect(output).toContain("config.ts");
	});

	test("diff -rq with excludes filters noise", async () => {
		// Add node_modules noise
		mkdirSync(join(expDir, "node_modules", "pkg"), { recursive: true });
		writeFileSync(join(expDir, "node_modules", "pkg", "index.js"), "module.exports = {};\n");

		const excludeArgs = ["node_modules", ".git"].flatMap((e) => ["--exclude", e]);
		const result = await exec(["diff", "-rq", sourceDir, expDir, ...excludeArgs]);
		const output = result.stdout || result.stderr;
		expect(output).not.toContain("node_modules");
	});
});
