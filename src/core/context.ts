import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExpMetadata } from "./experiment.ts";

export interface ExperimentContext {
	isExperiment: true;
	expDir: string;
	expName: string;
	originalRoot: string;
	description: string;
	number: number;
}

export interface ProjectContext {
	isExperiment: false;
}

export type Context = ExperimentContext | ProjectContext;

/**
 * Walk up from cwd (or `from`) looking for a `.exp` metadata file.
 * If found, return experiment context. Otherwise, return project context.
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
					isExperiment: true,
					expDir: dir,
					expName: meta.name,
					originalRoot: meta.source,
					description: meta.description,
					number: meta.number,
				};
			} catch {
				// Malformed .exp file — treat as not an experiment
				return { isExperiment: false };
			}
		}

		const parent = dirname(dir);
		if (parent === dir) break; // reached filesystem root
		dir = parent;
	}

	return { isExperiment: false };
}
