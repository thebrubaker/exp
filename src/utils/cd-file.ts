import { appendFileSync, writeFileSync } from "node:fs";

/**
 * Write a directory path to EXP_CD_FILE so the shell wrapper can cd there.
 * Returns true if the wrapper is active (file was written).
 */
export function writeCdTarget(dir: string): boolean {
	const cdFile = process.env.EXP_CD_FILE;
	if (!cdFile) return false;

	writeFileSync(cdFile, `cd:${dir}\n`, "utf-8");
	return true;
}

/**
 * Append a deferred clone instruction to EXP_CD_FILE.
 * The shell wrapper will spawn `cp -cR src dst` in the background.
 */
export function writeDeferredClone(src: string, dst: string): boolean {
	const cdFile = process.env.EXP_CD_FILE;
	if (!cdFile) return false;

	appendFileSync(cdFile, `defer:${src}:${dst}\n`, "utf-8");
	return true;
}
