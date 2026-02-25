import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type ShellType = "zsh" | "bash" | "fish";

const EVAL_LINES: Record<ShellType, string> = {
	zsh: 'eval "$(exp shell-init)"',
	bash: 'eval "$(exp shell-init bash)"',
	fish: "exp shell-init fish | source",
};

const RC_FILES: Record<ShellType, string> = {
	zsh: join(process.env.HOME ?? "~", ".zshrc"),
	bash: join(process.env.HOME ?? "~", ".bashrc"),
	fish: join(process.env.HOME ?? "~", ".config", "fish", "config.fish"),
};

export function detectShell(): ShellType {
	const shell = process.env.SHELL ?? "";
	if (shell.endsWith("/fish")) return "fish";
	if (shell.endsWith("/bash")) return "bash";
	return "zsh";
}

export function getRcFile(shell: ShellType): string {
	return RC_FILES[shell];
}

export function getEvalLine(shell: ShellType): string {
	return EVAL_LINES[shell];
}

export function isShellIntegrationInstalled(shell?: ShellType): boolean {
	const s = shell ?? detectShell();
	const rcFile = RC_FILES[s];
	if (!existsSync(rcFile)) return false;

	try {
		const content = readFileSync(rcFile, "utf-8");
		return content.includes("exp shell-init");
	} catch {
		return false;
	}
}

export function installShellIntegration(shell?: ShellType): {
	rcFile: string;
	evalLine: string;
} {
	const s = shell ?? detectShell();
	const rcFile = RC_FILES[s];
	const evalLine = EVAL_LINES[s];

	// Ensure parent directory exists (for fish)
	const dir = dirname(rcFile);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}

	// Append with a comment marker
	const block = `\n# exp shell integration\n${evalLine}\n`;
	appendFileSync(rcFile, block, "utf-8");

	return { rcFile, evalLine };
}
