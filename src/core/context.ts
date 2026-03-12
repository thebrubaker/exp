import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExpMetadata } from "./experiment.ts";

export interface CloneContext {
	isClone: true;
	expDir: string;
	expName: string;
	originalRoot: string;
	description: string;
	number: number;
}

export interface ProjectContext {
	isClone: false;
}

export type Context = CloneContext | ProjectContext;

/**
 * Walk up from cwd (or `from`) looking for a `.exp` metadata file.
 * If found, return branch context. Otherwise, return project context.
 */
export function detectContext(from?: string): Context {
	let dir = from ?? process.cwd();

	while (true) {
		const metaPath = join(dir, ".exp");
		if (existsSync(metaPath)) {
			try {
				const raw = readFileSync(metaPath, "utf-8");
				const meta: ExpMetadata = JSON.parse(raw);
				return {
					isClone: true,
					expDir: dir,
					expName: meta.name,
					originalRoot: meta.source,
					description: meta.description,
					number: meta.number,
				};
			} catch {
				// Malformed .exp file — treat as not a branch
				return { isClone: false };
			}
		}

		const parent = dirname(dir);
		if (parent === dir) break; // reached filesystem root
		dir = parent;
	}

	return { isClone: false };
}
