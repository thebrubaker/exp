import { existsSync } from "node:fs";
import { confirm, input, select } from "@inquirer/prompts";
import type { ExpConfig } from "../core/config.ts";
import { CONFIG_PATH, readRawConfig, writeConfig } from "../core/config.ts";
import { c, dim, info, ok, warn } from "../utils/colors.ts";
import { execCheck } from "../utils/shell.ts";
import type { TerminalType } from "../utils/terminal.ts";
import { detectTerminal } from "../utils/terminal.ts";

const TERMINAL_LABELS: Record<TerminalType, string> = {
	ghostty: "Ghostty",
	iterm: "iTerm",
	warp: "Warp",
	tmux: "tmux",
	terminal: "Terminal.app",
	none: "None (just print the path)",
};

interface DetectedEditor {
	cmd: string;
	label: string;
}

const KNOWN_EDITORS: DetectedEditor[] = [
	{ cmd: "cursor", label: "Cursor" },
	{ cmd: "code", label: "VS Code" },
	{ cmd: "zed", label: "Zed" },
];

async function detectEditors(): Promise<DetectedEditor[]> {
	const results = await Promise.all(
		KNOWN_EDITORS.map(async (editor) => {
			const found = await execCheck(["which", editor.cmd]);
			return found ? editor : null;
		}),
	);
	return results.filter((e): e is DetectedEditor => e !== null);
}

function detectCleanTargets(): string[] {
	const cwd = process.cwd();
	const targets: string[] = [];

	const hasNextConfig =
		existsSync(`${cwd}/next.config.js`) ||
		existsSync(`${cwd}/next.config.mjs`) ||
		existsSync(`${cwd}/next.config.ts`);

	if (hasNextConfig) {
		targets.push(".next", ".turbo");
	} else if (existsSync(`${cwd}/tsconfig.json`)) {
		targets.push(".turbo");
	}

	return targets;
}

export async function cmdInit(_config: ExpConfig) {
	const hasExisting = existsSync(CONFIG_PATH);
	const existing = hasExisting ? readRawConfig() : {};

	console.log();

	// ── Existing config ──
	if (hasExisting && Object.keys(existing).length > 0) {
		warn("Existing config found:");
		for (const [key, value] of Object.entries(existing)) {
			dim(`  ${key} = ${value}`);
		}
		console.log();

		const reconfigure = await confirm({
			message: "Reconfigure?",
			default: true,
		});
		if (!reconfigure) {
			dim("Keeping existing config.");
			return;
		}
		console.log();
	}

	// ── Education ──
	info(`${c.bold("exp")} clones your entire project instantly via APFS copy-on-write.`);
	dim(
		"  Unlike git worktrees, you get node_modules, .env, everything. Near-zero disk cost until files diverge.",
	);
	console.log();

	// ── Terminal preference ──
	const detected = detectTerminal();
	const detectedLabel = TERMINAL_LABELS[detected];

	const terminalChoices: { name: string; value: TerminalType }[] = [
		{
			name: `${detectedLabel} ${c.dim("(detected)")}`,
			value: detected,
		},
	];

	// Add other options (skip the detected one to avoid duplicates)
	const allTerminals: TerminalType[] = ["ghostty", "iterm", "warp", "tmux", "terminal", "none"];
	for (const t of allTerminals) {
		if (t !== detected) {
			terminalChoices.push({ name: TERMINAL_LABELS[t], value: t });
		}
	}

	const terminal = await select<TerminalType>({
		message: `Open new ${detectedLabel} windows for experiments?`,
		choices: terminalChoices,
	});

	// ── Editor integration ──
	const detectedEditors = await detectEditors();

	let openEditor: string | null = null;

	if (detectedEditors.length > 0) {
		const editorChoices: { name: string; value: string }[] = detectedEditors.map((e) => ({
			name: e.label,
			value: e.cmd,
		}));
		editorChoices.push({ name: "None", value: "none" });

		const editorChoice = await select<string>({
			message: "Auto-open experiments in an editor?",
			choices: editorChoices,
		});

		openEditor = editorChoice === "none" ? null : editorChoice;
	} else {
		dim("  No editors detected (checked: cursor, code, zed)");
	}

	// ── Clean targets ──
	const suggestedClean = detectCleanTargets();
	let cleanTargets: string[] = suggestedClean;

	if (suggestedClean.length > 0) {
		const useDefaults = await confirm({
			message: `After cloning, auto-remove build caches? ${c.dim(`(${suggestedClean.join(" ")})`)}`,
			default: true,
		});

		if (!useDefaults) {
			const customClean = await input({
				message: "Directories to clean (space-separated, or empty for none):",
			});
			cleanTargets = customClean
				.split(" ")
				.map((s) => s.trim())
				.filter(Boolean);
		}
	} else {
		const wantClean = await confirm({
			message: `After cloning, auto-remove build caches? ${c.dim("(e.g. .next .turbo)")}`,
			default: false,
		});

		if (wantClean) {
			const customClean = await input({
				message: "Directories to clean (space-separated):",
				default: ".next .turbo",
			});
			cleanTargets = customClean
				.split(" ")
				.map((s) => s.trim())
				.filter(Boolean);
		} else {
			cleanTargets = [];
		}
	}

	// ── Write config ──
	const values: Record<string, string> = {};

	values.terminal = terminal;

	if (openEditor) {
		values.open_editor = openEditor;
	}

	if (cleanTargets.length > 0) {
		values.clean = cleanTargets.join(" ");
	}

	writeConfig(values);

	// ── Summary ──
	console.log();
	ok(`Config written to ${c.cyan(CONFIG_PATH)}`);
	console.log();
	for (const [key, value] of Object.entries(values)) {
		dim(`  ${key} = ${value}`);
	}

	// ── Next steps ──
	console.log();
	info(`Ready! Try: ${c.cyan('exp new "my first experiment"')}`);
	console.log();
}
