import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { seedClaudeMd } from "../src/core/claude.ts";
import { resolveExp, writeMetadata } from "../src/core/experiment.ts";

const TMP = "/tmp/exp-test-clone-from";

beforeEach(() => {
	rmSync(TMP, { recursive: true, force: true });
	mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
	rmSync(TMP, { recursive: true, force: true });
});

describe("--from arg parsing", () => {
	test("extracts --from value from args", () => {
		const args = ["try", "variant", "--from", "1"];
		let fromId: string | null = null;
		const filteredArgs: string[] = [];
		for (let i = 0; i < args.length; i++) {
			if (args[i] === "--from") {
				fromId = args[i + 1] ?? null;
				i++;
			} else {
				filteredArgs.push(args[i]);
			}
		}
		expect(fromId).toBe("1");
		expect(filteredArgs).toEqual(["try", "variant"]);
	});

	test("handles --from at the beginning", () => {
		const args = ["--from", "redis", "try", "variant"];
		let fromId: string | null = null;
		const filteredArgs: string[] = [];
		for (let i = 0; i < args.length; i++) {
			if (args[i] === "--from") {
				fromId = args[i + 1] ?? null;
				i++;
			} else {
				filteredArgs.push(args[i]);
			}
		}
		expect(fromId).toBe("redis");
		expect(filteredArgs).toEqual(["try", "variant"]);
	});

	test("handles --from with no value", () => {
		const args = ["try", "variant", "--from"];
		let fromId: string | null = null;
		const filteredArgs: string[] = [];
		for (let i = 0; i < args.length; i++) {
			if (args[i] === "--from") {
				fromId = args[i + 1] ?? null;
				i++;
			} else {
				filteredArgs.push(args[i]);
			}
		}
		expect(fromId).toBeNull();
		expect(filteredArgs).toEqual(["try", "variant"]);
	});

	test("handles args without --from", () => {
		const args = ["try", "variant"];
		let fromId: string | null = null;
		const filteredArgs: string[] = [];
		for (let i = 0; i < args.length; i++) {
			if (args[i] === "--from") {
				fromId = args[i + 1] ?? null;
				i++;
			} else {
				filteredArgs.push(args[i]);
			}
		}
		expect(fromId).toBeNull();
		expect(filteredArgs).toEqual(["try", "variant"]);
	});
});

describe("source resolution with --from", () => {
	beforeEach(() => {
		mkdirSync(join(TMP, "001-try-redis"));
		mkdirSync(join(TMP, "002-dark-mode"));
	});

	test("resolves experiment by number", () => {
		const resolved = resolveExp("1", TMP);
		expect(resolved).toBe(join(TMP, "001-try-redis"));
	});

	test("resolves experiment by partial name", () => {
		const resolved = resolveExp("redis", TMP);
		expect(resolved).toBe(join(TMP, "001-try-redis"));
	});

	test("returns null for non-existent experiment", () => {
		const resolved = resolveExp("nope", TMP);
		expect(resolved).toBeNull();
	});
});

describe("metadata records correct source", () => {
	test("metadata source is project root when no --from", () => {
		const expDir = join(TMP, "001-test");
		mkdirSync(expDir);
		const projectRoot = "/Users/joel/Code/my-app";
		writeMetadata(expDir, {
			name: "001-test",
			description: "test",
			source: projectRoot,
			created: new Date().toISOString(),
			number: 1,
		});
		const meta = JSON.parse(readFileSync(join(expDir, ".exp"), "utf-8"));
		expect(meta.source).toBe(projectRoot);
	});

	test("metadata source is experiment path when --from used", () => {
		const sourceExpDir = join(TMP, "001-try-redis");
		mkdirSync(sourceExpDir);
		const expDir = join(TMP, "002-variant");
		mkdirSync(expDir);
		writeMetadata(expDir, {
			name: "002-variant",
			description: "variant",
			source: sourceExpDir,
			created: new Date().toISOString(),
			number: 2,
		});
		const meta = JSON.parse(readFileSync(join(expDir, ".exp"), "utf-8"));
		expect(meta.source).toBe(sourceExpDir);
	});
});

describe("CLAUDE.md lineage info", () => {
	test("includes fork info when fromExp is provided", () => {
		seedClaudeMd(TMP, "try variant", "my-app", "/Users/joel/Code/my-app", "002", "001-try-redis");
		const content = readFileSync(join(TMP, "CLAUDE.md"), "utf-8");
		expect(content).toContain("Forked from `001-try-redis`");
	});

	test("does not include fork info without fromExp", () => {
		seedClaudeMd(TMP, "try variant", "my-app", "/Users/joel/Code/my-app", "002");
		const content = readFileSync(join(TMP, "CLAUDE.md"), "utf-8");
		expect(content).not.toContain("Forked from `");
	});
});
