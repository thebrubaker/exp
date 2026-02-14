#!/usr/bin/env bun

import { cmdCd } from "./commands/cd.ts";
import { cmdCleanExport } from "./commands/clean-export.ts";
import { cmdDiff } from "./commands/diff.ts";
import { cmdHome } from "./commands/home.ts";
import { cmdInit } from "./commands/init.ts";
import { cmdLs } from "./commands/ls.ts";
import { cmdNew } from "./commands/new.ts";
import { cmdNuke } from "./commands/nuke.ts";
import { cmdOpen } from "./commands/open.ts";
import { cmdStatus } from "./commands/status.ts";
import { cmdTrash } from "./commands/trash.ts";
import { loadConfig } from "./core/config.ts";
import { err } from "./utils/colors.ts";

const VERSION = "0.3.3";

function printHelp() {
	console.log(`
  exp — instant project forking via APFS clonefile

  WORKFLOW
    /export                       <- optional: save Claude session to file
    exp new "try redis caching"   <- instant clone, terminal opens
    exp clean-export              <- remove export from original (clone keeps it)

  COMMANDS
    exp init                  Set up preferences (terminal, editor, clean targets)
    exp new "description"     Clone project + open terminal
    exp new "desc" --from <id>  Clone from existing fork
    exp ls [--detail]         List forks (--detail for git status + divergence)
    exp open <id>             Open terminal in fork
    exp diff <id>             What changed vs original (git-native when available)
    exp home                  Print original project path (use: cd $(exp home))
    exp trash <id> [--force]  Delete fork (--force/-y skips confirmation)
    exp nuke [--force]        Delete ALL forks (--force/-y skips confirmation)
    exp cd <id>               Print path (use: cd $(exp cd 3))
    exp status                Project info
    exp clean-export          Remove /export files from original after cloning

  IDs
    Number (1), full name (001-try-redis), or partial match (redis).

  CONFIG
    ~/.config/exp      Config file (key=value, one per line)
    EXP_* env vars     Override config file values

    Keys / env vars:
      root             EXP_ROOT           Override fork storage location
      terminal         EXP_TERMINAL       auto | ghostty | iterm | terminal | warp | tmux | none
      open_editor      EXP_OPEN_EDITOR    code | cursor | zed
      clean            EXP_CLEAN          Dirs to nuke after clone (default: .next .turbo)

  FLAGS
    --json               Machine-readable JSON output (for AI/scripts)
    --verbose            Show timing, paths, and method details

  HOW IT WORKS
    macOS clonefile(2) syscall: atomic copy-on-write clone of entire directory.
    .env, .git, node_modules, exports — everything comes along, near-zero disk.
`);
}

async function main() {
	const rawArgs = process.argv.slice(2);
	const verbose =
		rawArgs.includes("--verbose") || rawArgs.includes("--debug") || process.env.EXP_DEBUG === "1";
	const json = rawArgs.includes("--json");
	const args = rawArgs.filter((a) => a !== "--verbose" && a !== "--debug" && a !== "--json");
	const cmd = args[0] ?? "help";
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
				cmdCd(rest[0], config);
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
			case "clean-export":
			case "ce":
				cmdCleanExport();
				break;
			case "help":
			case "--help":
			case "-h":
				printHelp();
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
