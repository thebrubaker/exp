import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { getProjectRoot } from "../core/project.ts";
import { dim, ok } from "../utils/colors.ts";

export function cmdCleanExport() {
	const root = getProjectRoot();
	let removed = 0;

	const entries = readdirSync(root);
	for (const entry of entries) {
		if (
			(entry.startsWith("claude-export-") && entry.endsWith(".md")) ||
			(entry.startsWith("claude-session-") && entry.endsWith(".md"))
		) {
			const fullPath = join(root, entry);
			if (existsSync(fullPath)) {
				rmSync(fullPath);
				ok(`Removed ${entry} from original`);
				removed++;
			}
		}
	}

	if (removed === 0) {
		dim("No export files found in project root");
	}
}
