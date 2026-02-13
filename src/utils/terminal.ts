import { exec } from "./shell.ts";

export type TerminalType = "ghostty" | "iterm" | "warp" | "tmux" | "terminal" | "none";

export function detectTerminal(override?: string): TerminalType {
	if (override && override !== "auto") {
		return override as TerminalType;
	}

	const env = process.env;

	if (env.TERM_PROGRAM === "ghostty") return "ghostty";
	if (env.ITERM_SESSION_ID) return "iterm";
	if (env.TERM_PROGRAM === "WarpTerminal" || env.WARP_TERMINAL) return "warp";
	if (env.TMUX) return "tmux";
	if (env.TERM_PROGRAM === "Apple_Terminal") return "terminal";

	return "terminal";
}

export async function openTerminalAt(dir: string, title: string, terminalType: TerminalType) {
	switch (terminalType) {
		case "ghostty":
			await exec([
				"open",
				"-na",
				"Ghostty.app",
				"--args",
				`--working-directory=${dir}`,
			]);
			break;

		case "iterm": {
			const safeDir = dir.replace(/'/g, "'\\''");
			const safeTitle = title.replace(/'/g, "'\\''");
			const cmd = `cd '${safeDir}' && clear && echo '${safeTitle}'`;
			await exec([
				"osascript",
				"-e",
				`tell application "iTerm"
	activate
	tell current window
		create tab with default profile
		tell current session
			write text "${cmd}"
		end tell
	end tell
end tell`,
			]);
			break;
		}

		case "tmux":
			await exec(["tmux", "new-window", "-n", title, "-c", dir]);
			break;

		case "terminal": {
			const safeDir = dir.replace(/'/g, "'\\''");
			const safeTitle = title.replace(/'/g, "'\\''");
			const cmd = `cd '${safeDir}' && clear && echo '${safeTitle}'`;
			await exec([
				"osascript",
				"-e",
				`tell application "Terminal"
	activate
	do script "${cmd}"
end tell`,
			]);
			break;
		}

		case "none":
			break;
	}
}
