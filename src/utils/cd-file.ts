import { writeFileSync } from "node:fs";

/**
 * Write a directory path to EXP_CD_FILE so the shell wrapper can cd there.
 * Returns true if the wrapper is active (file was written).
 */
export function writeCdTarget(dir: string): boolean {
	const cdFile = process.env.EXP_CD_FILE;
	if (!cdFile) return false;

	writeFileSync(cdFile, dir, "utf-8");
	return true;
}
