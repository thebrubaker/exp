import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { exec } from "../utils/shell.ts";
import { dim } from "../utils/colors.ts";

export type CloneMethod = "apfs" | "copy";

export async function cloneProject(
	source: string,
	destination: string,
): Promise<CloneMethod> {
	// Try APFS clonefile first
	const apfs = await exec(["/bin/cp", "-cR", source, destination]);
	if (apfs.success) return "apfs";

	// Fallback to regular copy
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
