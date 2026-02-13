import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { seedClaudeMd, stripExpMarkers } from "../src/core/claude.ts";

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

	test("includes promote and trash commands", () => {
		seedClaudeMd(TMP, "test", "my-app", "/root", "003");

		const content = readFileSync(join(TMP, "CLAUDE.md"), "utf-8");
		expect(content).toContain("exp promote 003");
		expect(content).toContain("exp trash 003");
	});
});

describe("stripExpMarkers", () => {
	test("removes markers and content between them", () => {
		const content = `<!-- exp:start -->
## Side quest: test
Some context here
<!-- exp:end -->

# Real Content

More stuff here.`;

		const filePath = join(TMP, "CLAUDE.md");
		writeFileSync(filePath, content);
		stripExpMarkers(filePath);

		const result = readFileSync(filePath, "utf-8");
		expect(result).not.toContain("exp:start");
		expect(result).not.toContain("exp:end");
		expect(result).not.toContain("Side quest");
		expect(result).toContain("# Real Content");
		expect(result).toContain("More stuff here.");
	});

	test("preserves file when no markers present", () => {
		const content = "# My Project\n\nNo markers here.";
		const filePath = join(TMP, "CLAUDE.md");
		writeFileSync(filePath, content);
		stripExpMarkers(filePath);

		const result = readFileSync(filePath, "utf-8");
		expect(result).toContain("# My Project");
		expect(result).toContain("No markers here.");
	});

	test("handles non-existent file gracefully", () => {
		stripExpMarkers(join(TMP, "nope.md"));
		// Should not throw
	});
});
