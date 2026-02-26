import { existsSync } from "node:fs";
import { exec } from "../utils/shell.ts";

export const DIFF_EXCLUDES = [
	"node_modules",
	".git",
	".exp",
	".next",
	".turbo",
	"dist",
	".DS_Store",
];

export async function getDivergedSize(sourceRoot: string, expDir: string): Promise<string> {
	// Run diff -rq to find files that differ
	const excludeArgs = DIFF_EXCLUDES.flatMap((ex) => ["--exclude", ex]);
	const result = await exec(["diff", "-rq", ...excludeArgs, sourceRoot, expDir]);

	// diff returns 1 when files differ, 0 when identical, 2 on error
	if (result.exitCode === 2 || !result.stdout.trim()) {
		return "~0B";
	}

	const lines = result.stdout.trim().split("\n").filter(Boolean);
	let totalBytes = 0;

	for (const line of lines) {
		// Lines look like:
		// "Files /source/foo.ts and /exp/foo.ts differ"
		// "Only in /exp/: newfile.ts"
		// "Only in /exp/subdir: file.ts"

		// For "differ" lines, get the fork file size
		const differMatch = line.match(/^Files .+ and (.+) differ$/);
		if (differMatch) {
			const filePath = differMatch[1];
			try {
				const stat = Bun.file(filePath);
				totalBytes += stat.size;
			} catch {
				// Skip if can't stat
			}
			continue;
		}

		// For "Only in <exp>" lines, get the file size
		// Format: "Only in /exp/path: filename"
		const onlyInMatch = line.match(/^Only in (.+): (.+)$/);
		if (onlyInMatch) {
			const dir = onlyInMatch[1];
			const fileName = onlyInMatch[2];
			// Only count files in the fork, not files only in source
			if (dir.startsWith(expDir) || dir === expDir) {
				const filePath = `${dir}/${fileName}`;
				try {
					const stat = Bun.file(filePath);
					totalBytes += stat.size;
				} catch {
					// Might be a directory — skip
				}
			}
		}
	}

	return formatBytes(totalBytes);
}

export function formatBytes(bytes: number): string {
	if (bytes === 0) return "~0B";
	if (bytes < 1024) return `~${bytes}B`;
	if (bytes < 1024 * 1024) return `~${(bytes / 1024).toFixed(1)}KB`;
	if (bytes < 1024 * 1024 * 1024) return `~${(bytes / (1024 * 1024)).toFixed(1)}MB`;
	return `~${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

export async function getGitStatus(expDir: string): Promise<string> {
	if (!existsSync(`${expDir}/.git`)) {
		return "no git";
	}

	const result = await exec(["git", "status", "--porcelain"], {
		cwd: expDir,
	});

	if (!result.success) {
		return "unknown";
	}

	const lines = result.stdout.trim().split("\n").filter(Boolean);
	if (lines.length === 0) {
		return "clean";
	}

	return lines.length === 1 ? "1 uncommitted change" : `${lines.length} uncommitted changes`;
}

export async function getFileDivergence(sourceRoot: string, expDir: string): Promise<string> {
	const excludeArgs = DIFF_EXCLUDES.flatMap((ex) => ["--exclude", ex]);
	const result = await exec(["diff", "-rq", ...excludeArgs, sourceRoot, expDir]);

	// diff returns 1 when files differ, 0 when identical, 2 on error
	if (result.exitCode === 2) {
		return "unknown";
	}

	const lines = result.stdout.trim().split("\n").filter(Boolean);
	if (lines.length === 0) {
		return "identical to original";
	}

	return lines.length === 1 ? "1 modified vs original" : `${lines.length} modified vs original`;
}
