import { confirm } from "@inquirer/prompts";
import type { ExpConfig } from "../core/config.ts";
import { readRawConfig, writeConfig } from "../core/config.ts";
import { getExpBase, resolveExp } from "../core/experiment.ts";
import { getProjectRoot } from "../core/project.ts";
import { writeCdTarget } from "../utils/cd-file.ts";
import { c, dim, err, ok } from "../utils/colors.ts";
import {
	detectShell,
	getRcFile,
	installShellIntegration,
	isShellIntegrationInstalled,
} from "../utils/shell-integration.ts";

export async function cmdCd(query: string | undefined, config: ExpConfig) {
	if (!query) {
		err("Usage: exp cd <id>");
		dim("  Run exp ls to see available forks.");
		process.exit(1);
	}

	const root = getProjectRoot();
	const base = getExpBase(root, config);
	const expDir = resolveExp(query, base);

	if (!expDir) {
		err(`Not found: ${query}`);
		process.exit(1);
	}

	// If the shell wrapper is active, write to cd-file and stay quiet
	if (writeCdTarget(expDir)) {
		return;
	}

	// No wrapper — always print the path as fallback
	console.log(`cd ${expDir}`);

	// If TTY, shell integration not installed, and we haven't asked before — offer to set it up
	const existing = readRawConfig();
	if (
		process.stdout.isTTY &&
		!isShellIntegrationInstalled() &&
		existing.shell_integration_prompted !== "true"
	) {
		console.log();
		const shell = detectShell();
		const shouldInstall = await confirm({
			message: `Enable direct cd? ${c.dim(`(adds eval line to ${getRcFile(shell)})`)}`,
			default: true,
		});

		if (shouldInstall) {
			const { rcFile } = installShellIntegration(shell);
			ok(`Added to ${rcFile}`);
			dim("  Restart your shell, then exp cd will change directories directly.");
		} else {
			// Remember that the user declined so we don't ask again
			writeConfig({ shell_integration_prompted: "true" });
		}
	}
}
