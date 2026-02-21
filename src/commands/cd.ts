import type { ExpConfig } from "../core/config.ts";
import { getExpBase, resolveExp } from "../core/experiment.ts";
import { getProjectRoot } from "../core/project.ts";
import { err } from "../utils/colors.ts";

export function cmdCd(query: string | undefined, config: ExpConfig) {
	if (!query) {
		err("Usage: cd $(exp cd <id>)");
		process.exit(1);
	}

	const root = getProjectRoot();
	const base = getExpBase(root, config);
	const expDir = resolveExp(query, base);

	if (!expDir) {
		err(`Not found: ${query}`);
		process.exit(1);
	}

	// Print with newline so it doesn't look broken in terminal
	console.log(expDir);
}
