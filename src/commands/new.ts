import { existsSync } from "node:fs";
import { basename } from "node:path";
import { seedClaudeMd } from "../core/claude.ts";
import { cleanPostClone, cloneProject } from "../core/clone.ts";
import type { ExpConfig } from "../core/config.ts";
import { detectContext } from "../core/context.ts";
import { ensureExpBase, nextNum, resolveExp, slugify, writeMetadata } from "../core/experiment.ts";
import { getProjectName, getProjectRoot } from "../core/project.ts";
import { c, dim, info, ok, warn } from "../utils/colors.ts";
import { exec, execCheck } from "../utils/shell.ts";
import { startSpinner } from "../utils/spinner.ts";
import { detectTerminal, openTerminalAt } from "../utils/terminal.ts";

function fmt(ms: number): string {
	if (ms < 1000) return `${Math.round(ms)}ms`;
	return `${(ms / 1000).toFixed(1)}s`;
}

export async function cmdNew(args: string[], config: ExpConfig) {
	const t0 = performance.now();
	const verbose = config.verbose;

	// Parse flags: --from, --terminal, --no-terminal
	let fromId: string | null = null;
	let terminalOverride: boolean | null = null; // null = auto-detect
	const filteredArgs: string[] = [];
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--from") {
			fromId = args[i + 1] ?? null;
			i++; // skip next arg
		} else if (args[i] === "--terminal") {
			terminalOverride = true;
		} else if (args[i] === "--no-terminal") {
			terminalOverride = false;
		} else {
			filteredArgs.push(args[i]);
		}
	}
	const description = filteredArgs.join(" ") || "experiment";

	// Auto-detect: are we inside an experiment?
	const ctx = detectContext();

	// Determine the real project root
	let root: string;
	let name: string;
	if (ctx.isExperiment) {
		root = ctx.originalRoot;
		name = getProjectName(root);
	} else {
		root = getProjectRoot();
		name = getProjectName(root);
	}

	const slug = slugify(description);
	const base = ensureExpBase(root, config);
	const num = nextNum(base);
	const expName = `${num}-${slug}`;
	const expDir = `${base}/${expName}`;

	// Resolve clone source
	let cloneSource = root;
	let cloneSourceLabel = name;
	let fromExpName: string | undefined;
	if (fromId) {
		// Explicit --from flag
		const resolved = resolveExp(fromId, base);
		if (!resolved) {
			throw new Error(`Experiment not found: ${fromId}`);
		}
		cloneSource = resolved;
		fromExpName = basename(resolved);
		cloneSourceLabel = fromExpName;
	} else if (ctx.isExperiment) {
		// Auto-detected: we're inside an experiment, fork from it
		cloneSource = ctx.expDir;
		fromExpName = ctx.expName;
		cloneSourceLabel = fromExpName;
	}

	const spinner = startSpinner(`Cloning ${c.cyan(cloneSourceLabel)} → ${c.magenta(expName)}`);

	const tClone = performance.now();
	const method = await cloneProject(cloneSource, expDir);
	const cloneMs = performance.now() - tClone;

	const methodLabel =
		method === "clonefile"
			? "clonefile(2)"
			: method === "apfs"
				? "APFS copy-on-write"
				: "regular copy";

	spinner.update("Writing metadata...");
	writeMetadata(expDir, {
		name: expName,
		description,
		source: cloneSource,
		created: new Date().toISOString(),
		number: Number.parseInt(num, 10),
	});

	spinner.update("Seeding CLAUDE.md...");
	seedClaudeMd(expDir, description, name, root, num, fromExpName);

	// Create git branch for PR workflow
	let branchName: string | null = null;
	if (existsSync(`${expDir}/.git`)) {
		branchName = `exp/${slug}`;
		spinner.update(`Creating branch ${branchName}...`);
		const branchResult = await exec(["git", "-C", expDir, "checkout", "-b", branchName]);
		if (!branchResult.success) {
			warn(`Could not create branch ${branchName}: ${branchResult.stderr.trim()}`);
			branchName = null;
		}
	}

	let cleanMs = 0;
	if (config.clean.length > 0) {
		spinner.update(`Cleaning ${config.clean.join(", ")}...`);
		const tClean = performance.now();
		cleanPostClone(expDir, config.clean);
		cleanMs = performance.now() - tClean;
	}

	// Determine terminal behavior:
	// 1. --terminal / --no-terminal flags (explicit override)
	// 2. TTY detection (non-interactive = suppress terminal)
	// 3. Config / auto-detect (normal behavior)
	const isInteractive = process.stdin.isTTY ?? false;
	let shouldOpenTerminal: boolean;

	if (terminalOverride !== null) {
		shouldOpenTerminal = terminalOverride;
	} else {
		shouldOpenTerminal = isInteractive;
	}

	const terminalType = shouldOpenTerminal ? detectTerminal(config.terminal) : "none";
	let terminalMs = 0;
	if (terminalType !== "none") {
		spinner.update("Opening terminal...");
		const tTerm = performance.now();
		await openTerminalAt(expDir, expName, terminalType);
		terminalMs = performance.now() - tTerm;
	}

	spinner.stop();

	// Open editor (silent)
	if (config.openEditor) {
		const hasEditor = await execCheck(["which", config.openEditor]);
		if (hasEditor) {
			await exec([config.openEditor, expDir]);
		}
	}

	const totalMs = performance.now() - t0;

	// ── Output ──

	if (verbose) {
		info(`Cloning ${c.cyan(cloneSourceLabel)} → ${c.magenta(expName)}`);

		let cloneDetail = `Cloned via ${methodLabel} in ${c.cyan(fmt(cloneMs))}`;
		if (config.clean.length > 0) {
			cloneDetail += ` (cleaned ${config.clean.join(", ")} in ${fmt(cleanMs)})`;
		}
		ok(cloneDetail);
		dim(`  source: ${cloneSource}`);
		dim(`  exp:    ${expDir}`);
		if (ctx.isExperiment && !fromId) {
			dim(`  (auto-detected: forking from experiment ${ctx.expName})`);
		}

		if (branchName) {
			ok(`Branch: ${c.cyan(branchName)}`);
		}

		const hasNextConfig =
			existsSync(`${root}/next.config.js`) ||
			existsSync(`${root}/next.config.mjs`) ||
			existsSync(`${root}/next.config.ts`);
		if (existsSync(`${root}/package.json`) || hasNextConfig) {
			warn("If dev server is running, the experiment may need a different port");
			dim("  e.g. PORT=3001 pnpm dev");
		}

		if (terminalType !== "none") {
			ok(`Terminal open (${fmt(terminalMs)})`);
		} else {
			ok(`Ready: cd '${expDir}'`);
		}

		console.log();
		dim(`  total: ${fmt(totalMs)}`);
		dim(`  exp diff ${num} · exp trash ${num}`);
	} else {
		ok(`${c.bold(expName)} ${c.dim(`cloned in ${fmt(totalMs)}`)}`);

		if (branchName) {
			dim(`  branch: ${branchName}`);
		}

		if (terminalType === "none") {
			dim(`  cd ${expDir}`);
		}

		console.log();
		dim(`  exp diff ${num} · exp trash ${num}`);
	}
}
