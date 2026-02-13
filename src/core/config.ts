import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { TerminalType } from "../utils/terminal.ts";

export interface ExpConfig {
	root: string | null;
	terminal: TerminalType | "auto";
	openEditor: string | null;
	clean: string[];
}

const DEFAULT_CLEAN = [".next", ".turbo"];

const CONFIG_PATH = join(process.env.HOME ?? "~", ".config", "exp");

/**
 * Load config from:
 * 1. Built-in defaults
 * 2. ~/.config/exp (key=value, one per line)
 * 3. EXP_* env vars (highest priority)
 */
export function loadConfig(): ExpConfig {
	const file = readConfigFile();
	const env = process.env;

	const clean = env.EXP_CLEAN
		? env.EXP_CLEAN.split(" ").filter(Boolean)
		: file.clean
			? file.clean.split(" ").filter(Boolean)
			: DEFAULT_CLEAN;

	return {
		root: env.EXP_ROOT || file.root || null,
		terminal: (env.EXP_TERMINAL || file.terminal || "auto") as TerminalType | "auto",
		openEditor: env.EXP_OPEN_EDITOR || file.open_editor || null,
		clean,
	};
}

function readConfigFile(): Record<string, string> {
	if (!existsSync(CONFIG_PATH)) return {};
	try {
		const content = readFileSync(CONFIG_PATH, "utf-8");
		const result: Record<string, string> = {};
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const eq = trimmed.indexOf("=");
			if (eq === -1) continue;
			const key = trimmed.slice(0, eq).trim().toLowerCase();
			const value = trimmed.slice(eq + 1).trim();
			result[key] = value;
		}
		return result;
	} catch {
		return {};
	}
}
