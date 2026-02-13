#!/usr/bin/env bun

import { loadConfig } from "./core/config.ts";
import { cmdNew } from "./commands/new.ts";
import { cmdLs } from "./commands/ls.ts";
import { cmdDiff } from "./commands/diff.ts";
import { cmdPromote } from "./commands/promote.ts";
import { cmdTrash } from "./commands/trash.ts";
import { cmdOpen } from "./commands/open.ts";
import { cmdCd } from "./commands/cd.ts";
import { cmdStatus } from "./commands/status.ts";
import { cmdNuke } from "./commands/nuke.ts";
import { cmdCleanExport } from "./commands/clean-export.ts";
import { err } from "./utils/colors.ts";

const VERSION = "0.1.0";

function printHelp() {
	console.log(`
  exp — instant experiment forking via APFS clonefile

  WORKFLOW
    /export                       <- optional: save Claude session to file
    exp new "try redis caching"   <- instant clone, terminal opens
    exp clean-export              <- remove export from original (clone keeps it)

  COMMANDS
    exp new "description"     Clone project + open terminal
    exp ls                    List experiments
    exp open <id>             Open terminal in experiment
    exp diff <id>             What changed vs original
    exp promote <id>          Experiment replaces original (with backup)
    exp trash <id>            Delete experiment
    exp nuke                  Delete ALL experiments
    exp cd <id>               Print path (use: cd $(exp cd 3))
    exp status                Project info
    exp clean-export          Remove /export files from original after cloning

  IDs
    Number (1), full name (001-try-redis), or partial match (redis).

  CONFIG (env vars)
    EXP_ROOT           Override experiment storage location
    EXP_TERMINAL       auto | ghostty | iterm | terminal | warp | tmux | none
    EXP_OPEN_EDITOR    code | cursor | zed
    EXP_CLEAN          Dirs to nuke after clone, e.g. ".next .turbo dist"

  HOW IT WORKS
    macOS APFS clonefile (cp -cR): instant copy-on-write clone.
    800MB node_modules -> cloned in <1s, near-zero disk.
    .env, .git, node_modules, exports — everything comes along.
`);
}

async function main() {
	const args = process.argv.slice(2);
	const cmd = args[0] ?? "help";
	const rest = args.slice(1);
	const config = loadConfig();

	try {
		switch (cmd) {
			case "new":
			case "n":
				await cmdNew(rest, config);
				break;
			case "ls":
			case "list":
			case "l":
				await cmdLs(config);
				break;
			case "diff":
			case "d":
				await cmdDiff(rest[0], config);
				break;
			case "promote":
			case "p":
				await cmdPromote(rest[0], config);
				break;
			case "trash":
			case "rm":
			case "t":
				await cmdTrash(rest[0], config);
				break;
			case "open":
			case "o":
				await cmdOpen(rest[0], config);
				break;
			case "cd":
				cmdCd(rest[0], config);
				break;
			case "status":
			case "st":
				await cmdStatus(config);
				break;
			case "nuke":
				await cmdNuke(config);
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
