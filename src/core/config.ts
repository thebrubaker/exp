import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { TerminalType } from "../utils/terminal.ts";

export type CloneStrategy = "full" | "fast";

export interface ExpConfig {
	root: string | null;
	terminal: TerminalType | "auto";
	openEditor: string | null;
	clean: string[];
	branchPrefix: string | null;
	autoTerminal: boolean;
	verbose: boolean;
	json: boolean;
	cloneStrategy: CloneStrategy;
	deferDirs: string[];
}

const DEFAULT_CLEAN = [".next", ".turbo"];
const DEFAULT_DEFER_DIRS = ["node_modules"];

export const CONFIG_PATH = join(process.env.HOME ?? "~", ".config", "exp");

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

	const cloneStrategyRaw = env.EXP_CLONE_STRATEGY || file.clone_strategy || "full";
	const cloneStrategy: CloneStrategy = cloneStrategyRaw === "fast" ? "fast" : "full";

	const deferDirs = env.EXP_DEFER_DIRS
		? env.EXP_DEFER_DIRS.split(" ").filter(Boolean)
		: file.defer_dirs
			? file.defer_dirs.split(" ").filter(Boolean)
			: DEFAULT_DEFER_DIRS;

	return {
		root: env.EXP_ROOT || file.root || null,
		terminal: (env.EXP_TERMINAL || file.terminal || "auto") as TerminalType | "auto",
		openEditor: env.EXP_OPEN_EDITOR || file.open_editor || null,
		clean,
		branchPrefix: env.EXP_BRANCH_PREFIX || file.branch_prefix || null,
		autoTerminal: (env.EXP_AUTO_TERMINAL || file.auto_terminal || "false") === "true",
		verbose: false,
		json: false,
		cloneStrategy,
		deferDirs,
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

/**
 * Read raw config file values (for displaying existing config).
 */
export function readRawConfig(): Record<string, string> {
	return readConfigFile();
}

/**
 * Write config values to ~/.config/exp.
 * Merges with existing config so unknown keys aren't lost.
 * Ensures the parent directory exists.
 */
export function writeConfig(values: Record<string, string>): void {
	const dir = dirname(CONFIG_PATH);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}

	// Merge: existing values as base, new values override
	const existing = readConfigFile();
	const merged = { ...existing, ...values };

	const lines = ["# exp configuration — https://github.com/thebrubaker/exp", ""];

	for (const [key, value] of Object.entries(merged)) {
		lines.push(`${key}=${value}`);
	}

	lines.push(""); // trailing newline
	writeFileSync(CONFIG_PATH, lines.join("\n"), "utf-8");
}
