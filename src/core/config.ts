import type { TerminalType } from "../utils/terminal.ts";

export interface ExpConfig {
	root: string | null;
	terminal: TerminalType | "auto";
	openEditor: string | null;
	clean: string[];
}

export function loadConfig(): ExpConfig {
	const env = process.env;
	return {
		root: env.EXP_ROOT || null,
		terminal: (env.EXP_TERMINAL as TerminalType | "auto") || "auto",
		openEditor: env.EXP_OPEN_EDITOR || null,
		clean: env.EXP_CLEAN ? env.EXP_CLEAN.split(" ").filter(Boolean) : [],
	};
}
