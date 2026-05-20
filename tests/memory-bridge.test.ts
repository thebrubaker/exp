import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	readlinkSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	bridgeMemory,
	claudeMemoryDir,
	claudeProjectDir,
	claudeProjectSlug,
} from "../src/core/memory-bridge.ts";

// Tests use the real ~/.claude/projects/ dir with unique test-scoped slugs.
// homedir() reads from passwd, not HOME env, so faking is impractical.
const STAMP = `exp-bridge-test-${process.pid}`;
const PARENT_FAKE = `/tmp/${STAMP}/parent`;
const BRANCH_FAKE = `/tmp/${STAMP}/.exp-parent/001-test`;
const ELSEWHERE = `/tmp/${STAMP}/elsewhere`;

const projectsRoot = join(homedir(), ".claude", "projects");

function cleanup() {
	for (const path of [claudeProjectDir(PARENT_FAKE), claudeProjectDir(BRANCH_FAKE)]) {
		rmSync(path, { recursive: true, force: true });
	}
	rmSync(`/tmp/${STAMP}`, { recursive: true, force: true });
}

beforeEach(() => {
	cleanup();
});

afterEach(() => {
	cleanup();
});

describe("claudeProjectSlug", () => {
	// Empirically verified against ~/.claude/projects/ entries.
	test("plain project path", () => {
		expect(claudeProjectSlug("/Users/joel/Code/inkwell")).toBe("-Users-joel-Code-inkwell");
	});

	test("path containing a dot-directory", () => {
		expect(claudeProjectSlug("/Users/joel/.claude/skills")).toBe("-Users-joel--claude-skills");
	});

	test("exp branch path (dot + slash combo)", () => {
		expect(claudeProjectSlug("/Users/joel/Code/.exp-inkwell/022-prefixed-tailwind")).toBe(
			"-Users-joel-Code--exp-inkwell-022-prefixed-tailwind",
		);
	});

	test("root path", () => {
		expect(claudeProjectSlug("/")).toBe("-");
	});
});

describe("claudeMemoryDir / claudeProjectDir", () => {
	test("constructs paths under ~/.claude/projects", () => {
		expect(claudeProjectDir("/Users/joel/Code/inkwell")).toBe(
			join(projectsRoot, "-Users-joel-Code-inkwell"),
		);
		expect(claudeMemoryDir("/Users/joel/Code/inkwell")).toBe(
			join(projectsRoot, "-Users-joel-Code-inkwell", "memory"),
		);
	});
});

describe("bridgeMemory", () => {
	test("creates a symlink from branch memory to parent memory", () => {
		const result = bridgeMemory(BRANCH_FAKE, PARENT_FAKE);
		expect(result).toBe("linked");

		const branchMem = claudeMemoryDir(BRANCH_FAKE);
		const parentMem = claudeMemoryDir(PARENT_FAKE);

		expect(existsSync(branchMem)).toBe(true);
		expect(lstatSync(branchMem).isSymbolicLink()).toBe(true);
		expect(readlinkSync(branchMem)).toBe(parentMem);
	});

	test("creates parent memory dir if missing", () => {
		const parentMem = claudeMemoryDir(PARENT_FAKE);
		expect(existsSync(parentMem)).toBe(false);
		bridgeMemory(BRANCH_FAKE, PARENT_FAKE);
		expect(existsSync(parentMem)).toBe(true);
	});

	test("returns 'exists' when correct symlink already in place (idempotent)", () => {
		expect(bridgeMemory(BRANCH_FAKE, PARENT_FAKE)).toBe("linked");
		expect(bridgeMemory(BRANCH_FAKE, PARENT_FAKE)).toBe("exists");
	});

	test("returns 'skipped' when branch memory is a real dir with content", () => {
		const branchMem = claudeMemoryDir(BRANCH_FAKE);
		mkdirSync(branchMem, { recursive: true });
		writeFileSync(join(branchMem, "orphan.md"), "I'm already here");

		const result = bridgeMemory(BRANCH_FAKE, PARENT_FAKE);
		expect(result).toBe("skipped");

		// The file should still be there — untouched
		expect(existsSync(join(branchMem, "orphan.md"))).toBe(true);
		expect(lstatSync(branchMem).isSymbolicLink()).toBe(false);
	});

	test("takes over an empty branch memory dir by linking it", () => {
		const branchMem = claudeMemoryDir(BRANCH_FAKE);
		mkdirSync(branchMem, { recursive: true });

		const result = bridgeMemory(BRANCH_FAKE, PARENT_FAKE);
		expect(result).toBe("linked");
		expect(lstatSync(branchMem).isSymbolicLink()).toBe(true);
	});

	test("returns 'skipped' when branch memory is a symlink to the wrong place", () => {
		const branchMem = claudeMemoryDir(BRANCH_FAKE);
		const branchProj = claudeProjectDir(BRANCH_FAKE);
		mkdirSync(branchProj, { recursive: true });
		mkdirSync(ELSEWHERE, { recursive: true });

		symlinkSync(ELSEWHERE, branchMem);

		const result = bridgeMemory(BRANCH_FAKE, PARENT_FAKE);
		expect(result).toBe("skipped");
		expect(readlinkSync(branchMem)).toBe(ELSEWHERE); // unchanged
	});
});
