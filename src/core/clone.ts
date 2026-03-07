import { FFIType, dlopen } from "bun:ffi";
import { existsSync, mkdirSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { join, relative } from "node:path";
import { dim } from "../utils/colors.ts";
import { exec } from "../utils/shell.ts";

export type CloneMethod = "clonefile" | "apfs" | "copy" | "symlink";

// macOS clonefile(2) — clones an entire directory tree in a single syscall.
// This is the "instant" clone: one atomic operation, zero data copied,
// near-zero disk until files diverge. cp -cR walks the tree per-file instead.
let clonefileFn: ((src: Buffer, dst: Buffer, flags: number) => number) | null = null;

try {
	const lib = dlopen("libSystem.B.dylib", {
		clonefile: {
			args: [FFIType.ptr, FFIType.ptr, FFIType.int],
			returns: FFIType.int,
		},
	});
	clonefileFn = (src: Buffer, dst: Buffer, flags: number) => lib.symbols.clonefile(src, dst, flags);
} catch {
	// Not on macOS or libSystem not available — fine, we'll fall back
}

function tryClonefile(source: string, destination: string): boolean {
	if (!clonefileFn) return false;
	try {
		const srcBuf = Buffer.from(`${source}\0`);
		const dstBuf = Buffer.from(`${destination}\0`);
		return clonefileFn(srcBuf, dstBuf, 0) === 0;
	} catch {
		return false;
	}
}

export async function cloneProject(source: string, destination: string): Promise<CloneMethod> {
	// 1. Try clonefile(2) syscall — instant, single atomic operation
	if (tryClonefile(source, destination)) {
		return "clonefile";
	}

	// 2. Fallback: cp -cR — per-file clonefile (still CoW, but slower)
	const apfs = await exec(["/bin/cp", "-cR", source, destination]);
	if (apfs.success) return "apfs";

	// 3. Fallback: regular copy (non-APFS / Linux)
	const copy = await exec(["/bin/cp", "-R", source, destination]);
	if (!copy.success) {
		throw new Error(`Failed to clone: ${copy.stderr}`);
	}
	return "copy";
}

export function cleanPostClone(expDir: string, dirs: string[]) {
	for (const d of dirs) {
		const target = join(expDir, d);
		if (existsSync(target)) {
			rmSync(target, { recursive: true, force: true });
			dim(`  Cleaned ${d}`);
		}
	}
}

// Dirs cloned atomically (never walked into, never symlinked)
const NO_DESCEND = new Set([".git", ".next", ".turbo"]);
// How deep to look for symlink targets in subdirectories
const SYMLINK_SEARCH_DEPTH = 3;

export interface SymlinkCloneResult {
	method: "symlink";
	symlinkedPaths: string[];
}

/**
 * Symlink clone: walk source tree, clonefile each entry, but symlink
 * matching dirs back to source instead of copying them.
 * Returns the list of absolute source paths that were symlinked.
 */
export function symlinkCloneProject(
	source: string,
	destination: string,
	symlinkDirs: string[],
): SymlinkCloneResult {
	const symlinkSet = new Set(symlinkDirs);
	const symlinkedPaths: string[] = [];
	mkdirSync(destination, { recursive: true });
	walkAndClone(source, destination, symlinkSet, 0, symlinkedPaths);
	return { method: "symlink", symlinkedPaths };
}

function walkAndClone(
	srcDir: string,
	dstDir: string,
	symlinkDirs: Set<string>,
	depth: number,
	symlinkedPaths: string[],
): void {
	const entries = readdirSync(srcDir, { withFileTypes: true });

	for (const entry of entries) {
		const name = entry.name;
		const srcPath = join(srcDir, name);
		const dstPath = join(dstDir, name);

		if (entry.isDirectory() && symlinkDirs.has(name)) {
			symlinkSync(srcPath, dstPath);
			symlinkedPaths.push(srcPath);
			continue;
		}

		if (entry.isDirectory() && NO_DESCEND.has(name)) {
			if (!tryClonefile(srcPath, dstPath)) {
				throw new Error(`Failed to clonefile ${srcPath}`);
			}
			continue;
		}

		if (entry.isDirectory() && depth < SYMLINK_SEARCH_DEPTH) {
			if (subtreeHasSymlinkTarget(srcPath, symlinkDirs, SYMLINK_SEARCH_DEPTH - depth - 1)) {
				mkdirSync(dstPath, { recursive: true });
				walkAndClone(srcPath, dstPath, symlinkDirs, depth + 1, symlinkedPaths);
				continue;
			}
		}

		if (!tryClonefile(srcPath, dstPath)) {
			throw new Error(`Failed to clonefile ${srcPath}`);
		}
	}
}

function subtreeHasSymlinkTarget(
	dir: string,
	symlinkDirs: Set<string>,
	remainingDepth: number,
): boolean {
	if (remainingDepth <= 0) return false;
	try {
		const entries = readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.isDirectory()) {
				if (symlinkDirs.has(entry.name)) return true;
				if (
					subtreeHasSymlinkTarget(join(dir, entry.name), symlinkDirs, remainingDepth - 1)
				)
					return true;
			}
		}
	} catch {
		// Permission error etc — treat as no targets
	}
	return false;
}
