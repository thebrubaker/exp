#!/usr/bin/env bun

import { existsSync, readdirSync } from "node:fs";
import { cmdCd } from "./commands/cd.ts";
import { cmdCleanExport } from "./commands/clean-export.ts";
import { cmdClone } from "./commands/clone.ts";
import { cmdDiff } from "./commands/diff.ts";
import { cmdDone } from "./commands/done.ts";
import { cmdHome } from "./commands/home.ts";
import { cmdInit } from "./commands/init.ts";
import { cmdLs } from "./commands/ls.ts";
import { cmdNew } from "./commands/new.ts";
import { cmdNuke } from "./commands/nuke.ts";
import { cmdOpen } from "./commands/open.ts";
import { cmdShellInit } from "./commands/shell-init.ts";
import { cmdStatus } from "./commands/status.ts";
import { cmdTrash } from "./commands/trash.ts";
import type { ExpConfig } from "./core/config.ts";
import { CONFIG_PATH, loadConfig } from "./core/config.ts";
import { getExpBase } from "./core/experiment.ts";
import { getProjectRoot } from "./core/project.ts";
import { c, dim, err, info } from "./utils/colors.ts";

const VERSION = "0.9.0";

function printHelp() {
	console.log(`
  exp — instant project branching via APFS clonefile

  WORKFLOW
    /export                       <- optional: save Claude session to file
    exp new "try redis caching"   <- instant branch, cd into it
    exp clean-export              <- remove export from original (branch keeps it)

  COMMANDS
    exp init                  Set up preferences (terminal, editor, clean targets)
    exp new "description"     Create a new branch (prints cd path by default)
    exp new "desc" --from <id>  Branch from existing branch
    exp new "desc" --branch <name>  Use exact branch name
    exp ls [--detail]         List branches (--detail for git status + divergence)
    exp open <id>             Open terminal in branch
    exp done [id] [--undo]    Mark branch as done (safe to trash later)
    exp diff <id>             What changed vs original (git-native when available)
    exp trash <id> [--force]  Delete branch (--force/-y skips confirmation)
    exp trash 1 3-5 8         Trash multiple branches (numbers and ranges)
    exp trash --done          Trash all done branches
    exp nuke                  Delete ALL branches (interactive only — requires human)
    exp cp <src> [dest]       APFS clonefile copy of any directory
    exp cd <id>               Change to branch directory (with shell-init)
    exp home                  Change to original project (with shell-init)
    exp status                Project info
    exp clean-export          Remove /export files from original after branching
    exp shell-init [shell]    Print shell integration (zsh/bash/fish)

  IDs
    Number (1), full name (001-try-redis), or partial match (redis).

  CONFIG
    ~/.config/exp      Config file (key=value, one per line)
    EXP_* env vars     Override config file values

    Keys / env vars:
      root             EXP_ROOT           Override branch storage location
      terminal         EXP_TERMINAL       auto | ghostty | iterm | terminal | warp | tmux | none
      open_editor      EXP_OPEN_EDITOR    code | cursor | zed
      clean            EXP_CLEAN          Dirs to nuke after branching (default: .next .turbo)
      branch_prefix    EXP_BRANCH_PREFIX  Branch prefix (default: git first name or "exp")
      auto_terminal    EXP_AUTO_TERMINAL  Auto-open terminal on branch (default: false)

  FLAGS
    --json               Machine-readable JSON output (for AI/scripts)
    --verbose            Show timing, paths, and method details
    --terminal           Open a new terminal window in branch
    --no-terminal        Suppress terminal (overrides auto_terminal)

  SHELL INTEGRATION
    Add to your shell config for direct cd support:
      eval "$(exp shell-init)"          # zsh (~/.zshrc)
      eval "$(exp shell-init bash)"     # bash (~/.bashrc)
      exp shell-init fish | source      # fish (~/.config/fish/config.fish)

    With this, \`exp cd 11\` and \`exp new "foo"\` change your directory automatically.

  HOW IT WORKS
    macOS clonefile(2) syscall: atomic copy-on-write clone of entire project.
    .env, .git, node_modules, exports — everything comes along, near-zero disk.
`);
}

function printContextHint(config: ExpConfig) {
	if (!process.stdout.isTTY) return;

	const hasConfig = existsSync(CONFIG_PATH);

	if (!hasConfig) {
		dim(`  First time? Run: ${c.cyan("exp init")}`);
		console.log();
		return;
	}

	// Show branch count for current project if we're in one
	try {
		const root = getProjectRoot();
		const base = getExpBase(root, config);
		if (existsSync(base)) {
			const branches = readdirSync(base).filter((f) => /^\d{3}-/.test(f));
			if (branches.length > 0) {
				const s = branches.length === 1 ? "" : "es";
				info(`${branches.length} active branch${s} — run: ${c.cyan("exp ls")}`);
			} else {
				dim(`  No branches yet — run: ${c.cyan('exp new "description"')}`);
			}
			console.log();
		}
	} catch {
		// Not in a project directory — that's fine, skip the hint
	}
}

async function main() {
	const rawArgs = process.argv.slice(2);
	const verbose =
		rawArgs.includes("--verbose") || rawArgs.includes("--debug") || process.env.EXP_DEBUG === "1";
	const json = rawArgs.includes("--json");
	const args = rawArgs.filter((a) => a !== "--verbose" && a !== "--debug" && a !== "--json");
	const cmd = args[0] ?? "";
	const rest = args.slice(1);
	const config = loadConfig();
	config.verbose = verbose;
	config.json = json;

	try {
		switch (cmd) {
			case "new":
			case "n":
				await cmdNew(rest, config);
				break;
			case "ls":
			case "list":
			case "l":
				await cmdLs(rest, config);
				break;
			case "init":
				await cmdInit(config);
				break;
			case "done":
				await cmdDone(rest, config);
				break;
			case "diff":
			case "d":
				await cmdDiff(rest[0], config);
				break;
			case "trash":
			case "rm":
			case "t":
				await cmdTrash(rest, config);
				break;
			case "open":
			case "o":
				await cmdOpen(rest[0], config);
				break;
			case "cd":
				await cmdCd(rest[0], config);
				break;
			case "home":
			case "h":
				cmdHome(config);
				break;
			case "status":
			case "st":
				await cmdStatus(config);
				break;
			case "nuke":
				await cmdNuke(rest, config);
				break;
			case "cp":
				await cmdClone(rest, config);
				break;
			case "clean-export":
			case "ce":
				cmdCleanExport();
				break;
			case "shell-init":
				cmdShellInit(rest);
				break;
			case "help":
			case "--help":
			case "-h":
				printHelp();
				break;
			case "":
				printHelp();
				printContextHint(config);
				break;
			case "--version":
			case "-v":
				console.log(`exp ${VERSION}`);
				break;
			default:
				err(`Unknown command: ${cmd}`);
				printHelp();
				process.exit(1);
		}
	} catch (error) {
		if (error instanceof Error) {
			err(error.message);
		} else {
			err(String(error));
		}
		process.exit(1);
	}
}

main();
