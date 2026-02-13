import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getProjectRoot, getProjectName } from "../src/core/project.ts";

const TMP = "/tmp/exp-test-project";

beforeEach(() => {
	rmSync(TMP, { recursive: true, force: true });
	mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
	rmSync(TMP, { recursive: true, force: true });
});

describe("getProjectRoot", () => {
	test("finds .git directory", () => {
		const projectDir = join(TMP, "my-project");
		mkdirSync(join(projectDir, ".git"), { recursive: true });
		mkdirSync(join(projectDir, "src", "deep"), { recursive: true });

		expect(getProjectRoot(join(projectDir, "src", "deep"))).toBe(projectDir);
	});

	test("finds package.json", () => {
		const projectDir = join(TMP, "node-project");
		mkdirSync(projectDir, { recursive: true });
		writeFileSync(join(projectDir, "package.json"), "{}");

		expect(getProjectRoot(projectDir)).toBe(projectDir);
	});

	test("finds Cargo.toml", () => {
		const projectDir = join(TMP, "rust-project");
		mkdirSync(projectDir, { recursive: true });
		writeFileSync(join(projectDir, "Cargo.toml"), "");

		expect(getProjectRoot(projectDir)).toBe(projectDir);
	});

	test("finds .exp-root marker", () => {
		const projectDir = join(TMP, "custom-project");
		mkdirSync(projectDir, { recursive: true });
		writeFileSync(join(projectDir, ".exp-root"), "");

		expect(getProjectRoot(projectDir)).toBe(projectDir);
	});

	test("returns input dir when no marker found", () => {
		const dir = join(TMP, "no-markers");
		mkdirSync(dir, { recursive: true });

		expect(getProjectRoot(dir)).toBe(dir);
	});
});

describe("getProjectName", () => {
	test("returns basename of project root", () => {
		const projectDir = join(TMP, "cool-project");
		mkdirSync(join(projectDir, ".git"), { recursive: true });

		expect(getProjectName(projectDir)).toBe("cool-project");
	});
});
