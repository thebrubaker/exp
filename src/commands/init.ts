import { existsSync } from "node:fs";
import { confirm, input, select } from "@inquirer/prompts";
import type { ExpConfig } from "../core/config.ts";
import { CONFIG_PATH, readRawConfig, writeConfig } from "../core/config.ts";
import { c, dim, info, ok, warn } from "../utils/colors.ts";
import {
	detectShell,
	getRcFile,
	installShellIntegration,
	isShellIntegrationInstalled,
} from "../utils/shell-integration.ts";
import { exec, execCheck } from "../utils/shell.ts";
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

function printPitch() {
	console.log(c.bold("  exp — instant project forking\n"));

	console.log("  You know the feeling. You're deep in a feature, everything's");
	console.log('  working, and then you think: "what if I tried a completely');
	console.log('  different approach?"\n');

	console.log("  With git, that means stash, branch, context-switch, lose your");
	console.log("  flow. With exp, you just fork:\n");

	console.log(c.dim("  ┌─────────────────────────────────────────────────┐"));
	console.log(
		`${c.dim("  │")}  ${c.cyan('$ exp new "try redis sessions"')}               ${c.dim("│")}`,
	);
	console.log(
		`${c.dim("  │")}  ${c.green("✓")} 001-try-redis-sessions cloned in 48ms       ${c.dim("│")}`,
	);
	console.log(`${c.dim("  │")}    branch: joel/try-redis-sessions              ${c.dim("│")}`);
	console.log(`${c.dim("  │")}    cd /Users/you/.exp-myapp/001-try-redis-...   ${c.dim("│")}`);
	console.log(`${c.dim("  │")}                                                ${c.dim("│")}`);
	console.log(
		`${c.dim("  │")}  ${c.dim("Full project clone. node_modules, .env, .git.")} ${c.dim("│")}`,
	);
	console.log(
		`${c.dim("  │")}  ${c.dim("Near-zero disk. Ready to go.")}                   ${c.dim("│")}`,
	);
	console.log(c.dim("  └─────────────────────────────────────────────────┘"));
	console.log();

	info(c.bold("For you"));
	console.log("  You're on a branch with unstaged changes. You need to update");
	console.log("  turbo. That's annoying — you don't want to lose your context.");
	console.log(`  ${c.cyan('exp new "turbo upgrade"')} — cd into the fork, you're ready.`);
	console.log("  Your original project? Untouched. Merge via git when done.");
	console.log();

	info(c.bold("For AI agents"));
	console.log("  Claude Code agents working in parallel need isolated workspaces.");
	console.log("  Each agent gets a full APFS clone — zero conflicts, zero");
	console.log("  orchestration overhead. Each commits to its own branch.");
	console.log("  The orchestrator merges via git, not file juggling.");
	console.log();

	dim("  How: macOS APFS clonefile(2) — copy-on-write at the filesystem level.");
	dim("  The clone shares all blocks with the original until files diverge.");
	dim("  A 2GB project clones in ~50ms using ~0 extra disk.");
	console.log();
}

export async function cmdInit(_config: ExpConfig) {
	const hasExisting = existsSync(CONFIG_PATH);
	const existing = hasExisting ? readRawConfig() : {};
	const isReconfigure = hasExisting && Object.keys(existing).length > 0;

	console.log();

	// ── Existing config check ──
	if (isReconfigure) {
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

	// ── The Pitch (first time only) ──
	if (!isReconfigure) {
		printPitch();
	}

	// ── Now configure ──
	console.log(
		c.bold(isReconfigure ? "  Update your preferences.\n" : "  Let's set up your preferences.\n"),
	);

	// ── Post-fork behavior ──
	const existingAutoTerminal = existing.auto_terminal === "true";
	const postForkAction = await select<"cd" | "terminal">({
		message: "After forking, what should happen?",
		default: existingAutoTerminal ? "terminal" : "cd",
		choices: [
			{
				name: `cd into the fork ${c.dim("(recommended)")}`,
				value: "cd" as const,
			},
			{
				name: "open a new terminal window",
				value: "terminal" as const,
			},
		],
	});

	const autoTerminal = postForkAction === "terminal";

	// ── Terminal type ──
	const detected = detectTerminal();
	const detectedLabel = TERMINAL_LABELS[detected];

	const terminalChoices: { name: string; value: TerminalType }[] = [
		{
			name: `${detectedLabel} ${c.dim("(detected)")}`,
			value: detected,
		},
	];

	const allTerminals: TerminalType[] = ["ghostty", "iterm", "warp", "tmux", "terminal", "none"];
	for (const t of allTerminals) {
		if (t !== detected) {
			terminalChoices.push({ name: TERMINAL_LABELS[t], value: t });
		}
	}

	const existingTerminal = (existing.terminal as TerminalType) || detected;
	const terminal = await select<TerminalType>({
		message: autoTerminal
			? "Which terminal to open?"
			: `Which terminal for ${c.cyan("--terminal")} flag?`,
		default: existingTerminal,
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
			message: "Auto-open forks in an editor?",
			default: existing.open_editor || "none",
			choices: editorChoices,
		});

		openEditor = editorChoice === "none" ? null : editorChoice;
	} else {
		dim("  No editors detected (checked: cursor, code, zed)");
	}

	// ── Clean targets ──
	const suggestedClean = detectCleanTargets();
	const existingClean = existing.clean?.split(" ").filter(Boolean);
	let cleanTargets: string[] = existingClean ?? suggestedClean;

	if (suggestedClean.length > 0 || existingClean) {
		const defaults = existingClean ?? suggestedClean;
		const useDefaults = await confirm({
			message: `After cloning, auto-remove build caches? ${c.dim(`(${defaults.join(" ")})`)}`,
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
		} else {
			cleanTargets = defaults;
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

	// ── Branch prefix ──
	let detectedPrefix = "exp";
	const gitNameResult = await exec(["git", "config", "user.name"]);
	if (gitNameResult.success && gitNameResult.stdout.trim()) {
		const firstName = gitNameResult.stdout.trim().split(/\s+/)[0].toLowerCase();
		if (firstName) detectedPrefix = firstName;
	}

	const branchPrefix = await input({
		message: `Branch prefix? ${c.dim("(branches: <prefix>/<slug>)")}`,
		default: existing.branch_prefix || detectedPrefix,
	});

	// ── Write config ──
	const values: Record<string, string> = {};

	values.terminal = terminal;
	values.auto_terminal = String(autoTerminal);

	if (openEditor) {
		values.open_editor = openEditor;
	}

	if (cleanTargets.length > 0) {
		values.clean = cleanTargets.join(" ");
	}

	values.branch_prefix = branchPrefix;

	writeConfig(values);

	// ── Shell integration ──
	const shell = detectShell();
	if (isShellIntegrationInstalled(shell)) {
		ok(`Shell integration already installed ${c.dim(`(${getRcFile(shell)})`)}`);
	} else {
		console.log();
		const shouldInstall = await confirm({
			message: `Enable direct cd support? ${c.dim(`(adds to ${getRcFile(shell)})`)}`,
			default: true,
		});

		if (shouldInstall) {
			const { rcFile } = installShellIntegration(shell);
			ok(`Shell integration added to ${rcFile}`);
			dim(`  Restart your shell or run: source ${rcFile}`);
		} else {
			dim("  You can enable it later: exp shell-init --help");
		}
	}

	// ── Strong ending ──
	console.log();
	ok("You're set up!");
	console.log();
	info("Quick reference:");
	console.log(`  ${c.cyan('exp new "description"')}    Fork the project`);
	console.log(`  ${c.cyan("exp ls")}                   See your forks`);
	console.log(`  ${c.cyan("exp cd <id>")}              Change to fork directory`);
	console.log(`  ${c.cyan("exp diff <id>")}            What changed`);
	console.log(`  ${c.cyan("exp trash <id>")}           Clean up when done`);
	console.log();
	dim("  Forks are isolated project copies with their own git branch.");
	dim("  Commit, push, merge via PR — then trash the clone.");
	console.log();
}
