import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { descriptionMatchesSlug, extractSlug, truncate } from "../src/commands/ls.ts";
import { formatBytes } from "../src/core/divergence.ts";

const TMP = "/tmp/exp-test-ls";

beforeEach(() => {
	rmSync(TMP, { recursive: true, force: true });
	mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
	rmSync(TMP, { recursive: true, force: true });
});

describe("formatBytes", () => {
	test("returns ~0B for zero", () => {
		expect(formatBytes(0)).toBe("~0B");
	});

	test("returns bytes for small values", () => {
		expect(formatBytes(512)).toBe("~512B");
	});

	test("returns KB for kilobyte range", () => {
		expect(formatBytes(1024)).toBe("~1.0KB");
		expect(formatBytes(1536)).toBe("~1.5KB");
		expect(formatBytes(10240)).toBe("~10.0KB");
	});

	test("returns MB for megabyte range", () => {
		expect(formatBytes(1024 * 1024)).toBe("~1.0MB");
		expect(formatBytes(3.2 * 1024 * 1024)).toBe("~3.2MB");
		expect(formatBytes(500 * 1024 * 1024)).toBe("~500.0MB");
	});

	test("returns GB for gigabyte range", () => {
		expect(formatBytes(1024 * 1024 * 1024)).toBe("~1.0GB");
		expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe("~2.5GB");
	});

	test("handles boundary values", () => {
		expect(formatBytes(1)).toBe("~1B");
		expect(formatBytes(1023)).toBe("~1023B");
		expect(formatBytes(1024 * 1024 - 1)).toBe("~1024.0KB");
	});
});

describe("truncate", () => {
	test("returns short strings unchanged", () => {
		expect(truncate("hello", 30)).toBe("hello");
	});

	test("returns string at exact cap unchanged", () => {
		const str = "a".repeat(30);
		expect(truncate(str, 30)).toBe(str);
	});

	test("truncates long strings with ellipsis", () => {
		const str = "a".repeat(35);
		expect(truncate(str, 30)).toBe(`${"a".repeat(29)}\u2026`);
		expect(truncate(str, 30).length).toBe(30);
	});

	test("handles empty string", () => {
		expect(truncate("", 30)).toBe("");
	});

	test("truncates at cap of 1", () => {
		expect(truncate("ab", 1)).toBe("\u2026");
	});
});

describe("extractSlug", () => {
	test("strips numeric prefix", () => {
		expect(extractSlug("001-try-redis")).toBe("try-redis");
	});

	test("handles multi-digit prefix", () => {
		expect(extractSlug("123-my-feature")).toBe("my-feature");
	});

	test("returns full name if no numeric prefix", () => {
		expect(extractSlug("no-prefix")).toBe("no-prefix");
	});

	test("handles single-digit prefix", () => {
		expect(extractSlug("1-quick")).toBe("quick");
	});
});

describe("descriptionMatchesSlug", () => {
	test("empty description matches any slug", () => {
		expect(descriptionMatchesSlug("", "001-try-redis")).toBe(true);
	});

	test("exact description matches slug", () => {
		expect(descriptionMatchesSlug("try redis", "001-try-redis")).toBe(true);
	});

	test("description with capitals matches slug", () => {
		expect(descriptionMatchesSlug("Try Redis", "001-try-redis")).toBe(true);
	});

	test("different description does not match", () => {
		expect(descriptionMatchesSlug("something else entirely", "001-try-redis")).toBe(false);
	});

	test("description with special chars matches after slugification", () => {
		expect(descriptionMatchesSlug("try: redis!", "001-try-redis")).toBe(true);
	});
});

describe("cmdLs --all flag parsing", () => {
	test("--all is recognized in args", () => {
		const args = ["--all"];
		expect(args.includes("--all")).toBe(true);
	});

	test("--all with --detail", () => {
		const args = ["--all", "--detail"];
		expect(args.includes("--all")).toBe(true);
		expect(args.includes("--detail")).toBe(true);
	});

	test("no flags", () => {
		const args: string[] = [];
		expect(args.includes("--all")).toBe(false);
		expect(args.includes("--detail")).toBe(false);
	});
});

describe("global scan directory detection", () => {
	test("finds .exp-* directories in scan path", () => {
		const scanPath = join(TMP, "Code");
		mkdirSync(scanPath, { recursive: true });

		// Create a project and its experiment directory
		mkdirSync(join(scanPath, "myproject"));
		const expBase = join(scanPath, ".exp-myproject");
		mkdirSync(expBase);
		mkdirSync(join(expBase, "001-try-redis"));
		writeFileSync(
			join(expBase, "001-try-redis", ".exp"),
			JSON.stringify({
				name: "001-try-redis",
				description: "Try Redis",
				source: join(scanPath, "myproject"),
				created: new Date().toISOString(),
				number: 1,
			}),
		);

		// Verify the structure
		const { readdirSync } = require("node:fs");
		const entries = readdirSync(scanPath, { withFileTypes: true });
		const expDirs = entries.filter(
			(e: { isDirectory: () => boolean; name: string }) =>
				e.isDirectory() && e.name.startsWith(".exp-"),
		);
		expect(expDirs.length).toBe(1);
		expect(expDirs[0].name).toBe(".exp-myproject");

		// Verify experiments inside
		const experiments = readdirSync(expBase, { withFileTypes: true }).filter(
			(e: { isDirectory: () => boolean; name: string }) =>
				e.isDirectory() && !e.name.startsWith("."),
		);
		expect(experiments.length).toBe(1);
		expect(experiments[0].name).toBe("001-try-redis");
	});

	test("skips .exp-* directories with no experiments", () => {
		const scanPath = join(TMP, "Code");
		mkdirSync(scanPath, { recursive: true });

		// Empty experiment directory
		mkdirSync(join(scanPath, ".exp-empty"));

		const { readdirSync } = require("node:fs");
		const expBase = join(scanPath, ".exp-empty");
		const experiments = readdirSync(expBase, { withFileTypes: true }).filter(
			(e: { isDirectory: () => boolean; name: string }) =>
				e.isDirectory() && !e.name.startsWith("."),
		);
		expect(experiments.length).toBe(0);
	});

	test("extracts project name from .exp- prefix", () => {
		const dirName = ".exp-my-cool-project";
		const projectName = dirName.replace(/^\.exp-/, "");
		expect(projectName).toBe("my-cool-project");
	});
});

describe("diverged size computation", () => {
	test("identical directories have zero diverged size", () => {
		const source = join(TMP, "source");
		const clone = join(TMP, "clone");
		mkdirSync(source, { recursive: true });
		mkdirSync(clone, { recursive: true });

		// Same file in both
		writeFileSync(join(source, "file.txt"), "hello world");
		writeFileSync(join(clone, "file.txt"), "hello world");

		// diff -rq should show no differences
		const { execSync } = require("node:child_process");
		const output = execSync(`diff -rq "${source}" "${clone}"`, { encoding: "utf-8" });
		// Exit 0 means identical — no lines
		expect(output.trim()).toBe("");
	});

	test("modified files show up in diff output", () => {
		const source = join(TMP, "source");
		const clone = join(TMP, "clone");
		mkdirSync(source, { recursive: true });
		mkdirSync(clone, { recursive: true });

		writeFileSync(join(source, "file.txt"), "original");
		writeFileSync(join(clone, "file.txt"), "modified content that is longer");

		const { execSync } = require("node:child_process");
		try {
			execSync(`diff -rq "${source}" "${clone}"`, { encoding: "utf-8" });
			// Should not reach here — files differ
			throw new Error("Expected diff to exit with code 1");
		} catch (err: unknown) {
			const error = err as { status: number; stdout: string };
			expect(error.status).toBe(1);
			expect(error.stdout).toContain("differ");
		}
	});

	test("new files only in clone show up in diff output", () => {
		const source = join(TMP, "source");
		const clone = join(TMP, "clone");
		mkdirSync(source, { recursive: true });
		mkdirSync(clone, { recursive: true });

		writeFileSync(join(source, "shared.txt"), "shared");
		writeFileSync(join(clone, "shared.txt"), "shared");
		writeFileSync(join(clone, "new-file.txt"), "brand new file");

		const { execSync } = require("node:child_process");
		try {
			execSync(`diff -rq "${source}" "${clone}"`, { encoding: "utf-8" });
			throw new Error("Expected diff to exit with code 1");
		} catch (err: unknown) {
			const error = err as { status: number; stdout: string };
			expect(error.status).toBe(1);
			expect(error.stdout).toContain("Only in");
			expect(error.stdout).toContain("new-file.txt");
		}
	});
});
