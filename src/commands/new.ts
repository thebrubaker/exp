import type { ExpConfig } from "../core/config.ts";
import { cloneProject, cleanPostClone } from "../core/clone.ts";
import { seedClaudeMd } from "../core/claude.ts";
import { ensureExpBase, nextNum, slugify, writeMetadata } from "../core/experiment.ts";
import { getProjectName, getProjectRoot } from "../core/project.ts";
import { c, dim, info, ok, warn } from "../utils/colors.ts";
import { detectTerminal, openTerminalAt } from "../utils/terminal.ts";
import { existsSync } from "node:fs";
import { execCheck } from "../utils/shell.ts";

export async function cmdNew(args: string[], config: ExpConfig) {
	const description = args.join(" ") || "experiment";
	const root = getProjectRoot();
	const name = getProjectName(root);
	const slug = slugify(description);
	const num = nextNum(ensureExpBase(root, config));
	const expName = `${num}-${slug}`;
	const base = ensureExpBase(root, config);
	const expDir = `${base}/${expName}`;

	info(`Cloning ${c.cyan(name)} → ${c.magenta(expName)}`);

	const method = await cloneProject(root, expDir);

	writeMetadata(expDir, {
		name: expName,
		description,
		source: root,
		created: new Date().toISOString(),
		number: Number.parseInt(num, 10),
	});

	seedClaudeMd(expDir, description, name, root, num);

	if (config.clean.length > 0) {
		cleanPostClone(expDir, config.clean);
	}

	if (method === "apfs") {
		ok("Cloned (instant, copy-on-write)");
	} else {
		ok("Cloned (regular copy)");
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
		await openTerminalAt(expDir, expName, terminalType);
		ok("Terminal open");
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
	dim(`  exp diff ${num} · exp promote ${num} · exp trash ${num}`);
}
