import { basename } from "node:path";
import type { ExpConfig } from "../core/config.ts";
import { detectContext } from "../core/context.ts";
import { getExpBase, resolveExp } from "../core/experiment.ts";
import { healBridge } from "../core/memory-bridge.ts";
import { getProjectRoot } from "../core/project.ts";
import { err, ok, warn } from "../utils/colors.ts";
import { detectTerminal, openTerminalAt } from "../utils/terminal.ts";

export async function cmdOpen(query: string | undefined, config: ExpConfig) {
	if (!query) {
		err("Usage: exp open <id>");
		process.exit(1);
	}

	const ctx = detectContext();
	const root = ctx.isClone ? ctx.originalRoot : getProjectRoot();
	const base = getExpBase(root, config);
	const expDir = resolveExp(query, base);

	if (!expDir) {
		err(`Not found: ${query}`);
		process.exit(1);
	}

	// About to open a session in the branch — repair the memory bridge if
	// its target was pruned since creation (a dangling link hard-fails
	// Claude's writes). Best-effort: never blocks the open.
	if (config.memoryBridge) {
		const heal = healBridge(expDir);
		if (heal.status === "error") {
			warn(
				`Memory bridge heal failed: ${heal.reason} — Claude memory written here may not reach the parent`,
			);
		}
	}

	const terminalType = detectTerminal(config.terminal);
	await openTerminalAt(expDir, basename(expDir), terminalType);
	ok("Opened");
}
