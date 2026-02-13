import { FFIType, dlopen } from "bun:ffi";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { dim } from "../utils/colors.ts";
import { exec } from "../utils/shell.ts";

export type CloneMethod = "clonefile" | "apfs" | "copy";

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
