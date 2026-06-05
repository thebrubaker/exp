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
	healBridge,
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
		expect(result.status).toBe("linked");

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
		expect(bridgeMemory(BRANCH_FAKE, PARENT_FAKE).status).toBe("linked");
		expect(bridgeMemory(BRANCH_FAKE, PARENT_FAKE).status).toBe("exists");
	});

	test("returns 'skipped' with reason when branch memory has content", () => {
		const branchMem = claudeMemoryDir(BRANCH_FAKE);
		mkdirSync(branchMem, { recursive: true });
		writeFileSync(join(branchMem, "orphan.md"), "I'm already here");

		const result = bridgeMemory(BRANCH_FAKE, PARENT_FAKE);
		expect(result.status).toBe("skipped");
		expect(result.reason).toMatch(/already has/);

		// The file should still be there — untouched
		expect(existsSync(join(branchMem, "orphan.md"))).toBe(true);
		expect(lstatSync(branchMem).isSymbolicLink()).toBe(false);
	});

	test("takes over an empty branch memory dir by linking it", () => {
		const branchMem = claudeMemoryDir(BRANCH_FAKE);
		mkdirSync(branchMem, { recursive: true });

		const result = bridgeMemory(BRANCH_FAKE, PARENT_FAKE);
		expect(result.status).toBe("linked");
		expect(lstatSync(branchMem).isSymbolicLink()).toBe(true);
	});

	test("returns 'skipped' with reason when branch memory is a symlink elsewhere", () => {
		const branchMem = claudeMemoryDir(BRANCH_FAKE);
		const branchProj = claudeProjectDir(BRANCH_FAKE);
		mkdirSync(branchProj, { recursive: true });
		mkdirSync(ELSEWHERE, { recursive: true });

		symlinkSync(ELSEWHERE, branchMem);

		const result = bridgeMemory(BRANCH_FAKE, PARENT_FAKE);
		expect(result.status).toBe("skipped");
		expect(result.reason).toMatch(/symlinked elsewhere/);
		expect(readlinkSync(branchMem)).toBe(ELSEWHERE); // unchanged
	});

	test("never throws — returns 'error' on unexpected filesystem failure", () => {
		// Put a regular file where the branch's project dir should be. The
		// bridge will try to create a symlink "inside" that file and the
		// kernel returns ENOTDIR. We expect a structured "error" result
		// rather than an exception bubbling up to the caller.
		const branchProj = claudeProjectDir(BRANCH_FAKE);
		const parentOfBranchProj = join(homedir(), ".claude", "projects");
		mkdirSync(parentOfBranchProj, { recursive: true });
		writeFileSync(branchProj, "i am a file, not a directory");

		const result = bridgeMemory(BRANCH_FAKE, PARENT_FAKE);
		expect(result.status).toBe("error");
		expect(typeof result.reason).toBe("string");
		expect(result.reason!.length).toBeGreaterThan(0);

		// Clean up the stray file (cleanup() uses rmSync recursive force which handles this)
	});
});

describe("healBridge", () => {
	test("recreates the target when the bridge symlink is dangling", () => {
		// Set the bridge up, then prune the parent's bucket out from under it
		// — the exact scenario where Claude's writes would hard-fail (ENOENT).
		expect(bridgeMemory(BRANCH_FAKE, PARENT_FAKE).status).toBe("linked");
		const parentMem = claudeMemoryDir(PARENT_FAKE);
		rmSync(claudeProjectDir(PARENT_FAKE), { recursive: true, force: true });
		expect(existsSync(parentMem)).toBe(false);

		const result = healBridge(BRANCH_FAKE);
		expect(result.status).toBe("healed");
		expect(result.target).toBe(parentMem);
		expect(existsSync(parentMem)).toBe(true);

		// The symlink itself is untouched — still points where it did
		const branchMem = claudeMemoryDir(BRANCH_FAKE);
		expect(lstatSync(branchMem).isSymbolicLink()).toBe(true);
		expect(readlinkSync(branchMem)).toBe(parentMem);
	});

	test("is a no-op when the symlink target already exists", () => {
		expect(bridgeMemory(BRANCH_FAKE, PARENT_FAKE).status).toBe("linked");
		expect(healBridge(BRANCH_FAKE).status).toBe("ok");
	});

	test("heals at the link's real destination when redirected elsewhere", () => {
		// A link pointing somewhere other than the computed parent should
		// still be repaired at wherever it actually points.
		const branchMem = claudeMemoryDir(BRANCH_FAKE);
		mkdirSync(claudeProjectDir(BRANCH_FAKE), { recursive: true });
		const elsewhereMem = join(ELSEWHERE, "memory");
		symlinkSync(elsewhereMem, branchMem);
		expect(existsSync(elsewhereMem)).toBe(false);

		const result = healBridge(BRANCH_FAKE);
		expect(result.status).toBe("healed");
		expect(result.target).toBe(elsewhereMem);
		expect(existsSync(elsewhereMem)).toBe(true);
	});

	test("returns 'absent' when the branch memory is a real dir (not bridged)", () => {
		const branchMem = claudeMemoryDir(BRANCH_FAKE);
		mkdirSync(branchMem, { recursive: true });
		expect(healBridge(BRANCH_FAKE).status).toBe("absent");
	});

	test("returns 'absent' when there is nothing at the branch memory path", () => {
		expect(healBridge(BRANCH_FAKE).status).toBe("absent");
	});

	test("never throws — returns 'error' when the target can't be created", () => {
		// Point the link at a path whose parent is a regular file. mkdir of
		// the target then fails with ENOTDIR — we expect a structured error,
		// not an exception.
		const branchMem = claudeMemoryDir(BRANCH_FAKE);
		mkdirSync(claudeProjectDir(BRANCH_FAKE), { recursive: true });
		const blocker = join(`/tmp/${STAMP}`, "blocker");
		mkdirSync(`/tmp/${STAMP}`, { recursive: true });
		writeFileSync(blocker, "i am a file, not a directory");
		symlinkSync(join(blocker, "memory"), branchMem);

		const result = healBridge(BRANCH_FAKE);
		expect(result.status).toBe("error");
		expect(typeof result.reason).toBe("string");
		expect(result.reason!.length).toBeGreaterThan(0);
	});
});
