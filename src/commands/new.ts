import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { seedClaudeMd } from "../core/claude.ts";
import { cleanPostClone, cloneProject, fastCloneProject } from "../core/clone.ts";
import type { CloneStrategy, ExpConfig } from "../core/config.ts";
import { detectContext } from "../core/context.ts";
import {
	ensureExpBase,
	getDefaultBranchPrefix,
	nextNum,
	resolveExp,
	slugify,
	writeMetadata,
} from "../core/experiment.ts";
import { getProjectName, getProjectRoot } from "../core/project.ts";
import { writeCdTarget, writeDeferredClone } from "../utils/cd-file.ts";
import { c, dim, info, ok, warn } from "../utils/colors.ts";
import { fmt } from "../utils/format.ts";
import { exec, execCheck } from "../utils/shell.ts";
import { startSpinner } from "../utils/spinner.ts";
import { detectTerminal, openTerminalAt } from "../utils/terminal.ts";

export async function cmdNew(args: string[], config: ExpConfig) {
	const t0 = performance.now();
	const verbose = config.verbose;

	// Parse flags: --from, --terminal, --no-terminal, --branch, --strategy
	let fromId: string | null = null;
	let terminalOverride: boolean | null = null; // null = auto-detect
	let branchOverride: string | null = null;
	let strategyOverride: CloneStrategy | undefined = undefined; // undefined = use config
	const filteredArgs: string[] = [];
	if (args.includes("--help") || args.includes("-h")) {
		console.log(`
  exp new "description"           Create a new branch
  exp new "desc" --from <id>      Branch from existing branch instead of project root
  exp new "desc" --branch <name>  Use exact branch name (skip auto-prefix)
  exp new "desc" --terminal       Open a new terminal window in branch
  exp new "desc" --no-terminal    Suppress terminal (overrides auto_terminal config)
  exp new "desc" --strategy <s>   Clone strategy: full (default) or fast
`);
		return;
	}
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--from") {
			fromId = args[i + 1] ?? null;
			i++; // skip next arg
		} else if (args[i] === "--branch" || args[i] === "-b") {
			branchOverride = args[i + 1] ?? null;
			i++;
		} else if (args[i] === "--strategy") {
			const val = args[i + 1];
			if (val === "fast" || val === "full") {
				strategyOverride = val;
			} else {
				warn(`Unknown strategy "${val}", using default`);
			}
			i++;
		} else if (args[i] === "--terminal") {
			terminalOverride = true;
		} else if (args[i] === "--no-terminal") {
			terminalOverride = false;
		} else {
			filteredArgs.push(args[i]);
		}
	}
	const description = filteredArgs.join(" ") || "branch";

	// Auto-detect branch name: if description looks like a branch name
	// (single token, no spaces, contains a slash or hyphen), use it directly
	if (!branchOverride && filteredArgs.length === 1 && /^[^\s]+[-/][^\s]+$/.test(description)) {
		branchOverride = description;
	}

	// Auto-detect: are we inside a branch?
	const ctx = detectContext();

	// Determine the real project root
	let root: string;
	let name: string;
	if (ctx.isClone) {
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

	// Resolve source for cloning
	let cloneSource = root;
	let cloneSourceLabel = name;
	let fromExpName: string | undefined;
	if (fromId) {
		// Explicit --from flag
		const resolved = resolveExp(fromId, base);
		if (!resolved) {
			throw new Error(`Branch not found: ${fromId}`);
		}
		cloneSource = resolved;
		fromExpName = basename(resolved);
		cloneSourceLabel = fromExpName;
	} else if (ctx.isClone) {
		// Auto-detected: we're inside a branch, branch from it
		cloneSource = ctx.expDir;
		fromExpName = ctx.expName;
		cloneSourceLabel = fromExpName;
	}

	const strategy: CloneStrategy = strategyOverride ?? config.cloneStrategy;

	const spinner = startSpinner(`Cloning ${c.cyan(cloneSourceLabel)} → ${c.magenta(expName)}`);

	const tClone = performance.now();
	let method: string;
	let deferredPaths: string[] = [];

	if (strategy === "fast") {
		spinner.update(`Cloning (deferring ${config.deferDirs.join(", ")})...`);
		const result = fastCloneProject(cloneSource, expDir, config.deferDirs);
		method = result.method;
		deferredPaths = result.deferredPaths;
	} else {
		method = await cloneProject(cloneSource, expDir);
	}
	const cloneMs = performance.now() - tClone;

	const methodLabel =
		method === "clonefile"
			? "clonefile(2)"
			: method === "apfs"
				? "APFS copy-on-write"
				: method === "fast"
					? "fast"
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

	// Add .exp to branch's .gitignore so metadata doesn't get committed
	spinner.update("Configuring gitignore...");
	const gitignorePath = `${expDir}/.gitignore`;
	if (existsSync(gitignorePath)) {
		const content = readFileSync(gitignorePath, "utf-8");
		if (!content.split("\n").some((line) => line.trim() === ".exp")) {
			appendFileSync(gitignorePath, "\n# exp metadata\n.exp\n");
		}
	} else {
		writeFileSync(gitignorePath, "# exp metadata\n.exp\n");
	}

	// Create git branch for PR workflow
	let branchName: string | null = null;
	let branchReused = false;
	if (existsSync(`${expDir}/.git`)) {
		if (branchOverride) {
			branchName = branchOverride;
		} else {
			const prefix = await getDefaultBranchPrefix(config);
			branchName = `${prefix}/${slug}`;
		}
		spinner.update(`Creating branch ${branchName}...`);
		const branchResult = await exec(["git", "-C", expDir, "checkout", "-b", branchName]);
		if (!branchResult.success) {
			// Branch may already exist — try switching to it instead
			const switchResult = await exec(["git", "-C", expDir, "checkout", branchName]);
			if (switchResult.success) {
				branchReused = true;
			} else {
				warn(`Could not create branch ${branchName}: ${branchResult.stderr.trim()}`);
				branchName = null;
			}
		}

		// Mark CLAUDE.md as assume-unchanged so exp seeding doesn't show in git status
		if (existsSync(`${expDir}/CLAUDE.md`)) {
			await exec(["git", "-C", expDir, "update-index", "--assume-unchanged", "CLAUDE.md"]);
		}
	}

	let cleanMs = 0;
	if (strategy === "full" && config.clean.length > 0) {
		spinner.update(`Cleaning ${config.clean.join(", ")}...`);
		const tClean = performance.now();
		cleanPostClone(expDir, config.clean);
		cleanMs = performance.now() - tClean;
	}

	// Determine terminal behavior:
	// 1. --terminal / --no-terminal flags (explicit override)
	// 2. Config auto_terminal (default: false — just print cd path)
	let shouldOpenTerminal: boolean;

	if (terminalOverride !== null) {
		shouldOpenTerminal = terminalOverride;
	} else {
		shouldOpenTerminal = config.autoTerminal;
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

	// Tell the shell wrapper to cd into the branch
	const wrapperActive = writeCdTarget(expDir);

	// Write deferred clone instructions for the shell wrapper
	if (wrapperActive && deferredPaths.length > 0) {
		for (const srcPath of deferredPaths) {
			const name = srcPath.slice(cloneSource.length + 1);
			const dstPath = `${expDir}/${name}`;
			writeDeferredClone(srcPath, dstPath);
		}
	}

	// ── Output ──

	if (config.json) {
		console.log(
			JSON.stringify({
				name: expName,
				number: Number.parseInt(num, 10),
				path: expDir,
				source: cloneSource,
				branch: branchName,
				branchReused,
				method,
				strategy,
				deferredPaths: deferredPaths.length > 0 ? deferredPaths : undefined,
				terminal: terminalType,
				description,
				from: fromExpName ?? null,
				cloneMs: Math.round(cloneMs),
				totalMs: Math.round(totalMs),
			}),
		);
		return;
	}

	if (verbose) {
		info(`Cloning ${c.cyan(cloneSourceLabel)} → ${c.magenta(expName)}`);

		let cloneDetail = `Cloned via ${methodLabel} in ${c.cyan(fmt(cloneMs))}`;
		if (strategy === "full" && config.clean.length > 0) {
			cloneDetail += ` (cleaned ${config.clean.join(", ")} in ${fmt(cleanMs)})`;
		}
		ok(cloneDetail);
		dim(`  source: ${cloneSource}`);
		dim(`  exp:    ${expDir}`);
		if (ctx.isClone && !fromId) {
			dim(`  (auto-detected: branching from ${ctx.expName})`);
		}

		if (branchName) {
			ok(
				`Branch: ${c.cyan(branchName)}${branchReused ? c.dim(" (already existed, switched to it)") : ""}`,
			);
		}

		if (deferredPaths.length > 0) {
			warn(
				`${config.deferDirs.join(", ")} copying in background (${deferredPaths.length} locations)`,
			);
		}

		const hasNextConfig =
			existsSync(`${root}/next.config.js`) ||
			existsSync(`${root}/next.config.mjs`) ||
			existsSync(`${root}/next.config.ts`);
		if (existsSync(`${root}/package.json`) || hasNextConfig) {
			warn("If dev server is running, the branch may need a different port");
			dim("  e.g. PORT=3001 pnpm dev");
		}

		if (terminalType !== "none") {
			ok(`Terminal open (${fmt(terminalMs)})`);
		} else if (!wrapperActive) {
			console.log(`  cd ${expDir}`);
		}

		console.log();
		dim(`  total: ${fmt(totalMs)}`);
		dim(`  exp diff ${num} · exp trash ${num}`);
	} else {
		ok(`${c.bold(expName)} ${c.dim(`created in ${fmt(totalMs)}`)}`);

		if (branchName) {
			dim(`  branch: ${branchName}${branchReused ? " (already existed)" : ""}`);
		}

		dim(`  path:   ${expDir}`);

		if (deferredPaths.length > 0) {
			warn(`${config.deferDirs.join(", ")} copying in background`);
		}

		if (terminalType === "none" && !wrapperActive) {
			console.log(`  cd ${expDir}`);
		}

		console.log();
		dim(`  exp diff ${num} · exp trash ${num}`);
	}
}
