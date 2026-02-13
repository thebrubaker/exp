import { basename, join } from "node:path";
import { confirm } from "@inquirer/prompts";
import type { ExpConfig } from "../core/config.ts";
import { stripExpMarkers } from "../core/claude.ts";
import { getExpBase, resolveExp } from "../core/experiment.ts";
import { getProjectName, getProjectRoot } from "../core/project.ts";
import { c, dim, err, ok, warn } from "../utils/colors.ts";
import { exec } from "../utils/shell.ts";

export async function cmdPromote(query: string | undefined, config: ExpConfig) {
	if (!query) {
		err("Usage: exp promote <id>");
		process.exit(1);
	}

	const root = getProjectRoot();
	const base = getExpBase(root, config);
	const expDir = resolveExp(query, base);

	if (!expDir) {
		err(`Not found: ${query}`);
		process.exit(1);
	}

	const name = getProjectName(root);
	const expName = basename(expDir);
	const ts = new Date().toISOString().replace(/[T:]/g, "-").replace(/\..+/, "").replace(/-/g, "").replace(/(\d{8})(\d{6})/, "$1-$2");

	console.log();
	warn(`Promote ${c.magenta(expName)} → ${c.cyan(name)}?`);
	dim(`  Original backed up to _backup-${ts}`);

	const yes = await confirm({ message: "Continue?" });
	if (!yes) {
		dim("Cancelled.");
		return;
	}

	const backup = join(base, `_backup-${ts}`);

	const mvOriginal = await exec(["/bin/mv", root, backup]);
	if (!mvOriginal.success) {
		err(`Failed to backup original: ${mvOriginal.stderr}`);
		process.exit(1);
	}

	const mvExp = await exec(["/bin/mv", expDir, root]);
	if (!mvExp.success) {
		// Try to restore
		await exec(["/bin/mv", backup, root]);
		err(`Failed to promote: ${mvExp.stderr}`);
		process.exit(1);
	}

	// Clean experiment markers
	const expMetaPath = join(root, ".exp");
	await exec(["/bin/rm", "-f", expMetaPath]);
	stripExpMarkers(join(root, "CLAUDE.md"));

	ok(`Promoted. Backup: ${c.dim(backup)}`);
}
