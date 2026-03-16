import { existsSync, readdirSync } from "node:fs";
import { confirm, select } from "@inquirer/prompts";
import type { ExpConfig } from "../core/config.ts";
import { readRawConfig, writeConfig } from "../core/config.ts";
import { detectContext } from "../core/context.ts";
import { getExpBase, readMetadata, resolveExp } from "../core/experiment.ts";
import { getProjectName, getProjectRoot } from "../core/project.ts";
import { writeCdTarget } from "../utils/cd-file.ts";
import { c, dim, err, ok } from "../utils/colors.ts";
import {
	detectShell,
	getRcFile,
	installShellIntegration,
	isShellIntegrationInstalled,
} from "../utils/shell-integration.ts";
import { timeAgo } from "../utils/time.ts";

export async function cmdCd(query: string | undefined, config: ExpConfig) {
	// If inside a branch, use the original project root so we can cd to siblings
	const ctx = detectContext();
	const root = ctx.isClone ? ctx.originalRoot : getProjectRoot();
	const base = getExpBase(root, config);

	if (!query) {
		const expDir = await selectBranch(base, root);
		if (!expDir) return;
		cdTo(expDir);
		return;
	}

	const expDir = resolveExp(query, base);

	if (!expDir) {
		err(`Not found: ${query}`);
		process.exit(1);
	}

	cdTo(expDir);
}

/** Write cd target or print path, offer shell integration if needed */
function cdTo(expDir: string) {
	// If the shell wrapper is active, write to cd-file and stay quiet
	if (writeCdTarget(expDir)) {
		return;
	}

	// No wrapper — always print the path as fallback
	console.log(`cd ${expDir}`);

	// If TTY, shell integration not installed, and we haven't asked before — offer to set it up
	offerShellIntegration();
}

async function offerShellIntegration() {
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

/** Show interactive branch picker, return selected path or null */
async function selectBranch(base: string, root: string): Promise<string | null> {
	if (!process.stdout.isTTY) {
		err("Usage: exp cd <id>");
		dim("  Run exp ls to see available branches.");
		process.exit(1);
	}

	if (!existsSync(base)) {
		const name = getProjectName(root);
		dim(`No branches for ${name}. Run: exp new "my idea"`);
		return null;
	}

	const entries = readdirSync(base, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.sort((a, b) => a.name.localeCompare(b.name));

	if (entries.length === 0) {
		const name = getProjectName(root);
		dim(`No branches for ${name}. Run: exp new "my idea"`);
		return null;
	}

	const choices = entries.map((entry) => {
		const expDir = `${base}/${entry.name}`;
		const meta = readMetadata(expDir);
		const desc = meta?.description ?? "";
		const time = meta?.created ? timeAgo(meta.created) : "";
		const isDone = meta?.status === "done";

		// Build display label: name + description (if different from slug) + time
		let label = entry.name;
		if (desc && desc !== entry.name.replace(/^\d+-/, "")) {
			label += c.dim(` — ${desc}`);
		}
		if (time) {
			label += c.dim(`  ${time}`);
		}
		if (isDone) {
			label = c.dim(`${entry.name} ✓`);
		}

		return { name: label, value: expDir };
	});

	const selected = await select({
		message: "Branch:",
		choices,
	});

	return selected;
}
