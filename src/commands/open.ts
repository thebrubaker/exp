import { basename } from "node:path";
import type { ExpConfig } from "../core/config.ts";
import { getExpBase, resolveExp } from "../core/experiment.ts";
import { getProjectRoot } from "../core/project.ts";
import { err, ok } from "../utils/colors.ts";
import { detectTerminal, openTerminalAt } from "../utils/terminal.ts";

export async function cmdOpen(query: string | undefined, config: ExpConfig) {
	if (!query) {
		err("Usage: exp open <id>");
		process.exit(1);
	}

	const root = getProjectRoot();
	const base = getExpBase(root, config);
	const expDir = resolveExp(query, base);

	if (!expDir) {
		err(`Not found: ${query}`);
		process.exit(1);
	}

	const terminalType = detectTerminal(config.terminal);
	await openTerminalAt(expDir, basename(expDir), terminalType);
	ok("Opened");
}
