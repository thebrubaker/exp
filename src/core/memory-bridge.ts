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
 *
 * Brittleness: this rule is reverse-engineered, not part of any documented
 * Claude API. If Claude changes how it derives slugs, our function silently
 * falls out of sync. `bridgeMemory` catches the resulting filesystem
 * inconsistencies and surfaces them as warnings rather than letting the
 * branch creation fail.
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

export type BridgeStatus = "linked" | "exists" | "skipped" | "error";

export interface BridgeResult {
	status: BridgeStatus;
	/** Human-readable reason — populated for "skipped" and "error". */
	reason?: string;
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
 * Side effects (only when status is "linked"):
 *   - Ensures `~/.claude/projects/<original-slug>/memory/` exists.
 *   - Ensures `~/.claude/projects/<branch-slug>/` exists.
 *   - Creates `~/.claude/projects/<branch-slug>/memory` as a symlink
 *     pointing at the original's memory dir.
 *
 * **Never throws.** All filesystem errors are caught and returned as
 * `{ status: "error", reason }` so a broken bridge doesn't break branch
 * creation — the user gets a working branch and a warning.
 *
 * Status values:
 *   "linked"  — symlink created
 *   "exists"  — correct symlink already in place; no-op
 *   "skipped" — pre-existing content at the branch memory path; left alone
 *               to avoid clobbering whatever's there
 *   "error"   — an unexpected filesystem error (permission, IO, etc.).
 *               The branch creation is unaffected; memory written inside
 *               the branch will live under its own slug as if no bridge.
 */
export function bridgeMemory(branchDir: string, originalRoot: string): BridgeResult {
	try {
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
				if (target === parentMem) return { status: "exists" };
				return {
					status: "skipped",
					reason: `branch memory symlinked elsewhere (${target})`,
				};
			}
			if (entry.isDirectory()) {
				const contents = readdirSync(branchMem);
				if (contents.length === 0) {
					try {
						rmdirSync(branchMem);
					} catch (err) {
						return {
							status: "error",
							reason: `couldn't remove empty branch memory dir: ${errMsg(err)}`,
						};
					}
				} else {
					return {
						status: "skipped",
						reason: `branch memory dir already has ${contents.length} file(s)`,
					};
				}
			}
		}

		symlinkSync(parentMem, branchMem);
		return { status: "linked" };
	} catch (err) {
		return { status: "error", reason: errMsg(err) };
	}
}

function errMsg(err: unknown): string {
	if (err instanceof Error) return err.message;
	return String(err);
}
