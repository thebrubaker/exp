import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const COMMAND_FILE = join(import.meta.dir, "../commands/side-quest.md");

describe("side-quest command file", () => {
	const content = readFileSync(COMMAND_FILE, "utf-8");

	test("file exists and is readable", () => {
		expect(content.length).toBeGreaterThan(0);
	});

	test("contains $ARGUMENTS placeholder", () => {
		expect(content).toContain("$ARGUMENTS");
	});

	test("references exp new command", () => {
		expect(content).toContain("exp new");
	});

	test("suppresses terminal with EXP_TERMINAL=none", () => {
		expect(content).toContain("EXP_TERMINAL=none");
	});

	test("has frontmatter with description", () => {
		expect(content).toMatch(/^---\n/);
		expect(content).toContain("description:");
	});

	test("mentions key exp commands for follow-up", () => {
		expect(content).toContain("exp ls");
		expect(content).toContain("exp diff");
		expect(content).toContain("exp trash");
	});
});
