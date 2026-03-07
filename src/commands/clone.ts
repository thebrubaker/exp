import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import { cloneProject } from "../core/clone.ts";
import type { ExpConfig } from "../core/config.ts";
import { c, dim, err, ok } from "../utils/colors.ts";
import { fmt } from "../utils/format.ts";

export async function cmdClone(args: string[], config: ExpConfig) {
	if (args.includes("--help") || args.includes("-h")) {
		console.log(`
  exp clone <source> [destination]   APFS clonefile copy of any directory

  If destination is omitted, clones into ./<source basename>.
  Errors if destination already exists.

  FLAGS
    --json       Machine-readable JSON output
    --verbose    Show method and timing details
`);
		return;
	}

	const filteredArgs: string[] = [];
	for (const arg of args) {
		if (arg !== "--json" && arg !== "--verbose" && arg !== "--debug") {
			filteredArgs.push(arg);
		}
	}

	const source = filteredArgs[0];
	if (!source) {
		err("Usage: exp clone <source> [destination]");
		process.exit(1);
	}

	const resolvedSource = resolve(source);
	if (!existsSync(resolvedSource)) {
		throw new Error(`Source not found: ${resolvedSource}`);
	}

	const destination = filteredArgs[1]
		? resolve(filteredArgs[1])
		: resolve(basename(resolvedSource));
	if (existsSync(destination)) {
		throw new Error(`Destination already exists: ${destination}`);
	}

	const t0 = performance.now();
	const method = await cloneProject(resolvedSource, destination);
	const totalMs = performance.now() - t0;

	const methodLabel =
		method === "clonefile"
			? "clonefile(2)"
			: method === "apfs"
				? "APFS copy-on-write"
				: "regular copy";

	if (config.json) {
		console.log(
			JSON.stringify({
				source: resolvedSource,
				destination,
				method,
				totalMs: Math.round(totalMs),
			}),
		);
		return;
	}

	if (config.verbose) {
		ok(`Cloned via ${methodLabel} in ${c.cyan(fmt(totalMs))}`);
		dim(`  source: ${resolvedSource}`);
		dim(`  dest:   ${destination}`);
	} else {
		ok(`${c.bold(basename(destination))} ${c.dim(`cloned in ${fmt(totalMs)}`)}`);
		dim(`  ${destination}`);
	}
}
