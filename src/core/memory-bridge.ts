import {
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readlinkSync,
	rmdirSync,
	symlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Compute Claude Code's per-project state slug for a filesystem path.
 *
 * Claude derives the slug by replacing both `/` and `.` with `-`, leaving
 * other characters intact. The slug namespaces per-project state under
 * `~/.claude/projects/<slug>/`.
 *
 * Examples (verified empirically against ~/.claude/projects/):
 *   /Users/joel/Code/inkwell           → -Users-joel-Code-inkwell
 *   /Users/joel/.claude/skills         → -Users-joel--claude-skills
 *   /Users/joel/Code/.exp-inkwell/022  → -Users-joel-Code--exp-inkwell-022
 */
export function claudeProjectSlug(absPath: string): string {
	return absPath.replace(/[/.]/g, "-");
}

/**
 * Absolute path to Claude's per-project state directory.
 */
export function claudeProjectDir(projectRoot: string): string {
	return join(homedir(), ".claude", "projects", claudeProjectSlug(projectRoot));
}

/**
 * Absolute path to Claude's auto-memory directory for a given project root.
 */
export function claudeMemoryDir(projectRoot: string): string {
	return join(claudeProjectDir(projectRoot), "memory");
}

/**
 * Bridge Claude's auto-memory from a branch back to the original project.
 *
 * Approach: Claude resolves its memory dir from cwd
 * (`~/.claude/projects/<slug-of-cwd>/memory/`) and does NOT honor
 * `autoMemoryDirectory` from project-local settings (only user-level
 * `~/.claude/settings.json`, by design). We work below Claude by
 * symlinking the branch's would-be memory directory to the original
 * project's memory directory — Claude writes "to its own slug" and the
 * bytes land at the parent.
 *
 * Side effects:
 *   - Ensures `~/.claude/projects/<original-slug>/memory/` exists.
 *   - Ensures `~/.claude/projects/<branch-slug>/` exists.
 *   - Creates `~/.claude/projects/<branch-slug>/memory` as a symlink
 *     pointing at the original's memory dir.
 *
 * Returns:
 *   "linked"  — symlink created
 *   "exists"  — correct symlink already in place; no-op
 *   "skipped" — branch's memory entry exists as a real directory or as a
 *               symlink to somewhere else. Left untouched to avoid data loss.
 */
export function bridgeMemory(
	branchDir: string,
	originalRoot: string,
): "linked" | "exists" | "skipped" {
	const parentMem = claudeMemoryDir(originalRoot);
	const branchProjDir = claudeProjectDir(branchDir);
	const branchMem = join(branchProjDir, "memory");

	if (!existsSync(parentMem)) {
		mkdirSync(parentMem, { recursive: true });
	}
	if (!existsSync(branchProjDir)) {
		mkdirSync(branchProjDir, { recursive: true });
	}

	// Inspect existing entry at branchMem, if any. Use lstat to see the
	// symlink itself, not what it points at.
	let entry: ReturnType<typeof lstatSync> | null = null;
	try {
		entry = lstatSync(branchMem);
	} catch {
		// ENOENT — entry doesn't exist, we'll create it below.
	}

	if (entry) {
		if (entry.isSymbolicLink()) {
			const target = readlinkSync(branchMem);
			if (target === parentMem) return "exists";
			return "skipped"; // symlink points somewhere else — don't clobber
		}
		if (entry.isDirectory()) {
			// Real directory: if it's empty we could safely take it over, but
			// even empty might indicate the user organized something. Skip
			// rather than guess. Migration is a separate concern.
			const contents = readdirSync(branchMem);
			if (contents.length === 0) {
				// Safe: remove the empty dir and symlink in its place.
				try {
					rmdirSync(branchMem);
				} catch {
					return "skipped";
				}
			} else {
				return "skipped";
			}
		}
	}

	symlinkSync(parentMem, branchMem);
	return "linked";
}
