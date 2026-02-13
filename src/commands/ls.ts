import { existsSync, readdirSync } from "node:fs";
import type { ExpConfig } from "../core/config.ts";
import { getExpBase, readMetadata } from "../core/experiment.ts";
import { getProjectName, getProjectRoot } from "../core/project.ts";
import { c, dim } from "../utils/colors.ts";
import { exec } from "../utils/shell.ts";

export async function cmdLs(config: ExpConfig) {
	const root = getProjectRoot();
	const name = getProjectName(root);
	const base = getExpBase(root, config);

	if (!existsSync(base)) {
		dim(`No experiments for ${name}. Run: exp new "my idea"`);
		return;
	}

	const entries = readdirSync(base, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.sort((a, b) => a.name.localeCompare(b.name));

	if (entries.length === 0) {
		dim(`No experiments for ${name}. Run: exp new "my idea"`);
		return;
	}

	console.log();
	console.log(`${c.bold(`Experiments for ${c.cyan(name)}`)}`);
	console.log();

	for (const entry of entries) {
		const expDir = `${base}/${entry.name}`;
		const meta = readMetadata(expDir);

		const sizeResult = await exec(["du", "-sh", expDir]);
		const size = sizeResult.success ? sizeResult.stdout.split("\t")[0] : "?";

		console.log(`  ${c.bold(entry.name)}`);
		if (meta?.description) dim(`    ${meta.description}`);
		dim(`    ${size} · ${meta?.created ?? "?"}`);
		console.log();
	}
}
