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
		case "ghostty": {
			// Use osascript to open a single new window in the existing Ghostty instance,
			// then type the cd command. Using `open -na` would launch a new Ghostty instance
			// which restores all previous windows.
			const safeDir = dir.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
			const safeTitle = title.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
			await exec([
				"osascript",
				"-e",
				`tell application "Ghostty" to activate
tell application "System Events"
	tell process "Ghostty"
		click menu item "New Window" of menu "File" of menu bar 1
		delay 0.5
		keystroke "cd \\"${safeDir}\\" && clear && echo \\"${safeTitle}\\""
		key code 36
	end tell
end tell`,
			]);
			break;
		}

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
