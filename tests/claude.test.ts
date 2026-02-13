import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { seedClaudeMd } from "../src/core/claude.ts";

const TMP = "/tmp/exp-test-claude";

beforeEach(() => {
	rmSync(TMP, { recursive: true, force: true });
	mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
	rmSync(TMP, { recursive: true, force: true });
});

describe("seedClaudeMd", () => {
	test("creates CLAUDE.md when it does not exist", () => {
		seedClaudeMd(TMP, "try redis", "my-app", "/Users/joel/Code/my-app", "001");

		const content = readFileSync(join(TMP, "CLAUDE.md"), "utf-8");
		expect(content).toContain("<!-- exp:start -->");
		expect(content).toContain("<!-- exp:end -->");
		expect(content).toContain("try redis");
		expect(content).toContain("my-app");
	});

	test("prepends to existing CLAUDE.md", () => {
		writeFileSync(join(TMP, "CLAUDE.md"), "# Existing Content\n\nHello world.");

		seedClaudeMd(TMP, "dark mode", "my-app", "/Users/joel/Code/my-app", "002");

		const content = readFileSync(join(TMP, "CLAUDE.md"), "utf-8");
		expect(content).toContain("<!-- exp:start -->");
		expect(content).toContain("dark mode");
		expect(content).toContain("# Existing Content");
		// Markers should be before existing content
		const markerIdx = content.indexOf("<!-- exp:start -->");
		const existingIdx = content.indexOf("# Existing Content");
		expect(markerIdx).toBeLessThan(existingIdx);
	});

	test("includes diff and trash commands", () => {
		seedClaudeMd(TMP, "test", "my-app", "/root", "003");

		const content = readFileSync(join(TMP, "CLAUDE.md"), "utf-8");
		expect(content).toContain("exp diff 003");
		expect(content).toContain("exp trash 003");
	});
});
