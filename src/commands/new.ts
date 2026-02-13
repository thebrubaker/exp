import { existsSync } from "node:fs";
import type { ExpConfig } from "../core/config.ts";
import { cloneProject, cleanPostClone } from "../core/clone.ts";
import { seedClaudeMd } from "../core/claude.ts";
import { ensureExpBase, nextNum, slugify, writeMetadata } from "../core/experiment.ts";
import { getProjectName, getProjectRoot } from "../core/project.ts";
import { c, dim, info, ok, warn } from "../utils/colors.ts";
import { execCheck } from "../utils/shell.ts";
import { detectTerminal, openTerminalAt } from "../utils/terminal.ts";

function fmt(ms: number): string {
	if (ms < 1000) return `${Math.round(ms)}ms`;
	return `${(ms / 1000).toFixed(1)}s`;
}

export async function cmdNew(args: string[], config: ExpConfig) {
	const t0 = performance.now();

	const description = args.join(" ") || "experiment";
	const root = getProjectRoot();
	const name = getProjectName(root);
	const slug = slugify(description);
	const num = nextNum(ensureExpBase(root, config));
	const expName = `${num}-${slug}`;
	const base = ensureExpBase(root, config);
	const expDir = `${base}/${expName}`;

	info(`Cloning ${c.cyan(name)} → ${c.magenta(expName)}`);

	const tClone = performance.now();
	const method = await cloneProject(root, expDir);
	const cloneMs = performance.now() - tClone;

	writeMetadata(expDir, {
		name: expName,
		description,
		source: root,
		created: new Date().toISOString(),
		number: Number.parseInt(num, 10),
	});

	seedClaudeMd(expDir, description, name, root, num);

	const methodLabel =
		method === "clonefile" ? "clonefile(2)" :
		method === "apfs" ? "APFS copy-on-write" :
		"regular copy";

	if (config.clean.length > 0) {
		const tClean = performance.now();
		cleanPostClone(expDir, config.clean);
		const cleanMs = performance.now() - tClean;
		ok(`Cloned via ${methodLabel} in ${c.cyan(fmt(cloneMs))} (cleaned ${config.clean.join(", ")} in ${fmt(cleanMs)})`);
	} else {
		ok(`Cloned via ${methodLabel} in ${c.cyan(fmt(cloneMs))}`);
	}

	dim(`  source: ${root}`);
	dim(`  exp:    ${expDir}`);

	// Port conflict warning
	const hasPackageJson = existsSync(`${root}/package.json`);
	const hasNextConfig =
		existsSync(`${root}/next.config.js`) ||
		existsSync(`${root}/next.config.mjs`) ||
		existsSync(`${root}/next.config.ts`);

	if (hasPackageJson || hasNextConfig) {
		warn("If dev server is running, the experiment may need a different port");
		dim("  e.g. PORT=3001 pnpm dev");
	}

	// Open terminal
	const terminalType = detectTerminal(config.terminal);
	if (terminalType !== "none") {
		const tTerm = performance.now();
		await openTerminalAt(expDir, expName, terminalType);
		ok(`Terminal open (${fmt(performance.now() - tTerm)})`);
	} else {
		ok(`Ready: cd '${expDir}'`);
	}

	// Open editor
	if (config.openEditor) {
		const hasEditor = await execCheck(["which", config.openEditor]);
		if (hasEditor) {
			const { exec } = await import("../utils/shell.ts");
			await exec([config.openEditor, expDir]);
		}
	}

	console.log();
	dim(`  total: ${fmt(performance.now() - t0)}`);
	dim(`  exp diff ${num} · exp promote ${num} · exp trash ${num}`);
}
