import { existsSync } from "node:fs";
import { seedClaudeMd } from "../core/claude.ts";
import { cleanPostClone, cloneProject } from "../core/clone.ts";
import type { ExpConfig } from "../core/config.ts";
import { ensureExpBase, nextNum, slugify, writeMetadata } from "../core/experiment.ts";
import { getProjectName, getProjectRoot } from "../core/project.ts";
import { c, dim, info, ok, warn } from "../utils/colors.ts";
import { execCheck } from "../utils/shell.ts";
import { startSpinner } from "../utils/spinner.ts";
import { detectTerminal, openTerminalAt } from "../utils/terminal.ts";

function fmt(ms: number): string {
	if (ms < 1000) return `${Math.round(ms)}ms`;
	return `${(ms / 1000).toFixed(1)}s`;
}

export async function cmdNew(args: string[], config: ExpConfig) {
	const t0 = performance.now();
	const verbose = config.verbose;

	const description = args.join(" ") || "experiment";
	const root = getProjectRoot();
	const name = getProjectName(root);
	const slug = slugify(description);
	const num = nextNum(ensureExpBase(root, config));
	const expName = `${num}-${slug}`;
	const base = ensureExpBase(root, config);
	const expDir = `${base}/${expName}`;

	const spinner = startSpinner(`Cloning ${c.cyan(name)} → ${c.magenta(expName)}`);

	const tClone = performance.now();
	const method = await cloneProject(root, expDir);
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
		source: root,
		created: new Date().toISOString(),
		number: Number.parseInt(num, 10),
	});

	spinner.update("Seeding CLAUDE.md...");
	seedClaudeMd(expDir, description, name, root, num);

	let cleanMs = 0;
	if (config.clean.length > 0) {
		spinner.update(`Cleaning ${config.clean.join(", ")}...`);
		const tClean = performance.now();
		cleanPostClone(expDir, config.clean);
		cleanMs = performance.now() - tClean;
	}

	// Open terminal
	const terminalType = detectTerminal(config.terminal);
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
			const { exec } = await import("../utils/shell.ts");
			await exec([config.openEditor, expDir]);
		}
	}

	const totalMs = performance.now() - t0;

	// ── Output ──

	if (verbose) {
		info(`Cloning ${c.cyan(name)} → ${c.magenta(expName)}`);

		let cloneDetail = `Cloned via ${methodLabel} in ${c.cyan(fmt(cloneMs))}`;
		if (config.clean.length > 0) {
			cloneDetail += ` (cleaned ${config.clean.join(", ")} in ${fmt(cleanMs)})`;
		}
		ok(cloneDetail);
		dim(`  source: ${root}`);
		dim(`  exp:    ${expDir}`);

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
		dim(`  exp diff ${num} · exp promote ${num} · exp trash ${num}`);
	} else {
		ok(`${c.bold(expName)} ${c.dim(`cloned in ${fmt(totalMs)}`)}`);

		if (terminalType === "none") {
			dim(`  cd ${expDir}`);
		}

		console.log();
		dim(`  exp diff ${num} · exp promote ${num} · exp trash ${num}`);
	}
}
