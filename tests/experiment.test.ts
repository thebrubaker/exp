import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { slugify, nextNum, resolveExp, readMetadata, type ExpMetadata } from "../src/core/experiment.ts";

const TMP = "/tmp/exp-test-experiment";

beforeEach(() => {
	rmSync(TMP, { recursive: true, force: true });
	mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
	rmSync(TMP, { recursive: true, force: true });
});

describe("slugify", () => {
	test("lowercases and replaces spaces", () => {
		expect(slugify("Try Redis Sessions")).toBe("try-redis-sessions");
	});

	test("replaces special characters", () => {
		expect(slugify("test@#$%thing")).toBe("test-thing");
	});

	test("collapses multiple hyphens", () => {
		expect(slugify("a  b  c")).toBe("a-b-c");
	});

	test("strips leading and trailing hyphens", () => {
		expect(slugify("  hello  ")).toBe("hello");
	});

	test("handles empty string", () => {
		expect(slugify("")).toBe("");
	});
});

describe("nextNum", () => {
	test("returns 001 for empty directory", () => {
		expect(nextNum(TMP)).toBe("001");
	});

	test("returns 001 for non-existent directory", () => {
		expect(nextNum(`${TMP}/nope`)).toBe("001");
	});

	test("increments from existing experiments", () => {
		mkdirSync(join(TMP, "001-first"));
		mkdirSync(join(TMP, "002-second"));
		expect(nextNum(TMP)).toBe("003");
	});

	test("handles gaps", () => {
		mkdirSync(join(TMP, "001-first"));
		mkdirSync(join(TMP, "005-fifth"));
		expect(nextNum(TMP)).toBe("006");
	});

	test("ignores non-numbered directories", () => {
		mkdirSync(join(TMP, "_backup-20250212"));
		mkdirSync(join(TMP, "003-thing"));
		expect(nextNum(TMP)).toBe("004");
	});
});

describe("resolveExp", () => {
	beforeEach(() => {
		mkdirSync(join(TMP, "001-try-redis"));
		mkdirSync(join(TMP, "002-dark-mode"));
		mkdirSync(join(TMP, "003-refactor-auth"));
	});

	test("resolves by number", () => {
		expect(resolveExp("1", TMP)).toBe(join(TMP, "001-try-redis"));
		expect(resolveExp("2", TMP)).toBe(join(TMP, "002-dark-mode"));
	});

	test("resolves by full name", () => {
		expect(resolveExp("002-dark-mode", TMP)).toBe(join(TMP, "002-dark-mode"));
	});

	test("resolves by partial match", () => {
		expect(resolveExp("redis", TMP)).toBe(join(TMP, "001-try-redis"));
		expect(resolveExp("auth", TMP)).toBe(join(TMP, "003-refactor-auth"));
	});

	test("returns null for no match", () => {
		expect(resolveExp("nope", TMP)).toBeNull();
	});

	test("returns null for non-existent base", () => {
		expect(resolveExp("1", `${TMP}/nope`)).toBeNull();
	});
});

describe("readMetadata", () => {
	test("reads valid metadata", () => {
		const meta: ExpMetadata = {
			name: "001-test",
			description: "test experiment",
			source: "/tmp/project",
			created: "2025-02-12T00:00:00Z",
			number: 1,
		};
		const dir = join(TMP, "001-test");
		mkdirSync(dir);
		writeFileSync(join(dir, ".exp"), JSON.stringify(meta));
		expect(readMetadata(dir)).toEqual(meta);
	});

	test("returns null for missing metadata", () => {
		const dir = join(TMP, "no-meta");
		mkdirSync(dir);
		expect(readMetadata(dir)).toBeNull();
	});

	test("returns null for invalid JSON", () => {
		const dir = join(TMP, "bad-json");
		mkdirSync(dir);
		writeFileSync(join(dir, ".exp"), "not json");
		expect(readMetadata(dir)).toBeNull();
	});
});
