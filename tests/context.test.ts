import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectContext } from "../src/core/context.ts";

let tmpBase: string;

beforeEach(() => {
	tmpBase = join(tmpdir(), `exp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(tmpBase, { recursive: true });
});

afterEach(() => {
	rmSync(tmpBase, { recursive: true, force: true });
});

function writeExpMeta(dir: string, meta: Record<string, unknown>) {
	writeFileSync(join(dir, ".exp"), JSON.stringify(meta));
}

const sampleMeta = {
	name: "001-try-redis",
	description: "try redis caching",
	source: "/Users/joel/Code/my-project",
	created: "2025-02-12T15:30:00.000Z",
	number: 1,
};

describe("detectContext", () => {
	test("finds .exp in current directory", () => {
		writeExpMeta(tmpBase, sampleMeta);

		const ctx = detectContext(tmpBase);
		expect(ctx.isFork).toBe(true);
		if (!ctx.isFork) return;

		expect(ctx.expDir).toBe(tmpBase);
		expect(ctx.expName).toBe("001-try-redis");
		expect(ctx.originalRoot).toBe("/Users/joel/Code/my-project");
		expect(ctx.description).toBe("try redis caching");
		expect(ctx.number).toBe(1);
	});

	test("finds .exp in parent directory", () => {
		writeExpMeta(tmpBase, sampleMeta);

		const subDir = join(tmpBase, "src", "components");
		mkdirSync(subDir, { recursive: true });

		const ctx = detectContext(subDir);
		expect(ctx.isFork).toBe(true);
		if (!ctx.isFork) return;

		expect(ctx.expDir).toBe(tmpBase);
		expect(ctx.expName).toBe("001-try-redis");
	});

	test("returns ProjectContext when no .exp found", () => {
		// tmpBase exists but has no .exp file
		const ctx = detectContext(tmpBase);
		expect(ctx.isFork).toBe(false);
	});

	test("parses all metadata fields correctly", () => {
		const meta = {
			name: "042-new-auth",
			description: "rewrite authentication layer",
			source: "/Users/joel/Code/big-project",
			created: "2025-06-01T10:00:00.000Z",
			number: 42,
			status: "active",
		};
		writeExpMeta(tmpBase, meta);

		const ctx = detectContext(tmpBase);
		expect(ctx.isFork).toBe(true);
		if (!ctx.isFork) return;

		expect(ctx.expName).toBe("042-new-auth");
		expect(ctx.originalRoot).toBe("/Users/joel/Code/big-project");
		expect(ctx.description).toBe("rewrite authentication layer");
		expect(ctx.number).toBe(42);
	});

	test("returns ProjectContext for malformed .exp file", () => {
		writeFileSync(join(tmpBase, ".exp"), "not valid json {{{");

		const ctx = detectContext(tmpBase);
		expect(ctx.isFork).toBe(false);
	});

	test("returns ProjectContext for empty .exp file", () => {
		writeFileSync(join(tmpBase, ".exp"), "");

		const ctx = detectContext(tmpBase);
		expect(ctx.isFork).toBe(false);
	});

	test("finds .exp multiple levels up", () => {
		writeExpMeta(tmpBase, sampleMeta);

		const deepDir = join(tmpBase, "a", "b", "c", "d");
		mkdirSync(deepDir, { recursive: true });

		const ctx = detectContext(deepDir);
		expect(ctx.isFork).toBe(true);
		if (!ctx.isFork) return;

		expect(ctx.expDir).toBe(tmpBase);
	});
});
