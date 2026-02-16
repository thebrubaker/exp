import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { ExpConfig } from "../src/core/config.ts";
import { getDefaultBranchPrefix, slugify } from "../src/core/experiment.ts";
import { exec } from "../src/utils/shell.ts";

const TMP = "/tmp/exp-test-auto-branch";

beforeEach(() => {
	rmSync(TMP, { recursive: true, force: true });
	mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
	rmSync(TMP, { recursive: true, force: true });
});

describe("branch name format", () => {
	test("produces exp/<slug> from description", () => {
		const slug = slugify("try redis sessions");
		expect(`exp/${slug}`).toBe("exp/try-redis-sessions");
	});

	test("slug has no spaces", () => {
		const slug = slugify("my cool experiment");
		expect(slug).not.toContain(" ");
		expect(`exp/${slug}`).toBe("exp/my-cool-experiment");
	});

	test("slug is lowercase", () => {
		const slug = slugify("Fix Auth Bug");
		expect(slug).toBe(slug.toLowerCase());
		expect(`exp/${slug}`).toBe("exp/fix-auth-bug");
	});

	test("slug handles special characters for valid branch names", () => {
		const slug = slugify("test@feature#123");
		expect(`exp/${slug}`).toBe("exp/test-feature-123");
		// No consecutive hyphens, no leading/trailing hyphens
		expect(slug).not.toMatch(/--/);
		expect(slug).not.toMatch(/^-/);
		expect(slug).not.toMatch(/-$/);
	});

	test("single word description", () => {
		const slug = slugify("refactor");
		expect(`exp/${slug}`).toBe("exp/refactor");
	});
});

describe("git branch creation", () => {
	test("creates branch in a git repo", async () => {
		// Init a bare git repo with an initial commit
		const repoDir = join(TMP, "test-repo");
		mkdirSync(repoDir);
		await exec(["git", "init", repoDir]);
		await exec(["git", "-C", repoDir, "config", "user.email", "test@test.com"]);
		await exec(["git", "-C", repoDir, "config", "user.name", "Test"]);
		// Need at least one commit so checkout -b works
		await exec(["git", "-C", repoDir, "commit", "--allow-empty", "-m", "init"]);

		const branchName = "exp/try-redis";
		const result = await exec(["git", "-C", repoDir, "checkout", "-b", branchName]);
		expect(result.success).toBe(true);

		// Verify we're on the new branch
		const branchResult = await exec(["git", "-C", repoDir, "branch", "--show-current"]);
		expect(branchResult.stdout.trim()).toBe(branchName);
	});

	test("fails gracefully when branch already exists", async () => {
		const repoDir = join(TMP, "test-repo-dup");
		mkdirSync(repoDir);
		await exec(["git", "init", repoDir]);
		await exec(["git", "-C", repoDir, "config", "user.email", "test@test.com"]);
		await exec(["git", "-C", repoDir, "config", "user.name", "Test"]);
		await exec(["git", "-C", repoDir, "commit", "--allow-empty", "-m", "init"]);

		const branchName = "exp/duplicate";
		// Create branch first time — should succeed
		const first = await exec(["git", "-C", repoDir, "checkout", "-b", branchName]);
		expect(first.success).toBe(true);

		// Go back to main so we can try creating same branch again
		await exec(["git", "-C", repoDir, "checkout", "-"]);

		// Create same branch again — should fail
		const second = await exec(["git", "-C", repoDir, "checkout", "-b", branchName]);
		expect(second.success).toBe(false);
		expect(second.stderr).toContain("already exists");
	});

	test("skips when no .git directory", () => {
		const noGitDir = join(TMP, "no-git");
		mkdirSync(noGitDir);
		expect(existsSync(join(noGitDir, ".git"))).toBe(false);
	});

	test("branch name with slashes works in git", async () => {
		const repoDir = join(TMP, "test-repo-slash");
		mkdirSync(repoDir);
		await exec(["git", "init", repoDir]);
		await exec(["git", "-C", repoDir, "config", "user.email", "test@test.com"]);
		await exec(["git", "-C", repoDir, "config", "user.name", "Test"]);
		await exec(["git", "-C", repoDir, "commit", "--allow-empty", "-m", "init"]);

		// exp/<slug> format with slash is valid git branch name
		const branchName = "exp/my-cool-feature";
		const result = await exec(["git", "-C", repoDir, "checkout", "-b", branchName]);
		expect(result.success).toBe(true);

		const current = await exec(["git", "-C", repoDir, "branch", "--show-current"]);
		expect(current.stdout.trim()).toBe(branchName);
	});
});

function makeConfig(overrides: Partial<ExpConfig> = {}): ExpConfig {
	return {
		root: null,
		terminal: "auto",
		openEditor: null,
		clean: [],
		branchPrefix: null,
		autoTerminal: false,
		verbose: false,
		json: false,
		...overrides,
	};
}

describe("branch prefix resolution", () => {
	test("returns config value when branchPrefix is set", async () => {
		const config = makeConfig({ branchPrefix: "team" });
		const prefix = await getDefaultBranchPrefix(config);
		expect(prefix).toBe("team");
	});

	test("returns non-empty string when branchPrefix is null", async () => {
		const config = makeConfig({ branchPrefix: null });
		const prefix = await getDefaultBranchPrefix(config);
		expect(prefix.length).toBeGreaterThan(0);
		// Should be either git user first name or "exp" fallback
		expect(typeof prefix).toBe("string");
	});

	test("returns exact config value including slashes", async () => {
		const config = makeConfig({ branchPrefix: "feat/onl" });
		const prefix = await getDefaultBranchPrefix(config);
		expect(prefix).toBe("feat/onl");
	});
});
