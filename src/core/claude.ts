import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MARKER_START = "<!-- exp:start -->";
const MARKER_END = "<!-- exp:end -->";

export function seedClaudeMd(
	expDir: string,
	description: string,
	projectName: string,
	projectRoot: string,
	num: string,
) {
	const claudePath = join(expDir, "CLAUDE.md");
	const header = `${MARKER_START}
## Side quest: ${description}

APFS clone of \`${projectName}\`. Original untouched at \`${projectRoot}\`.
Goal: **${description}**
Promote: \`exp promote ${num}\` | Trash: \`exp trash ${num}\`
${MARKER_END}
`;

	if (existsSync(claudePath)) {
		const existing = readFileSync(claudePath, "utf-8");
		writeFileSync(claudePath, `${header}\n${existing}`);
	} else {
		writeFileSync(claudePath, header);
	}
}

export function stripExpMarkers(filePath: string) {
	if (!existsSync(filePath)) return;

	const content = readFileSync(filePath, "utf-8");
	const lines = content.split("\n");
	const result: string[] = [];
	let inMarker = false;

	for (const line of lines) {
		if (line.trim() === MARKER_START) {
			inMarker = true;
			continue;
		}
		if (line.trim() === MARKER_END) {
			inMarker = false;
			continue;
		}
		if (!inMarker) {
			result.push(line);
		}
	}

	// Remove leading blank lines left behind
	let start = 0;
	while (start < result.length && result[start].trim() === "") {
		start++;
	}

	writeFileSync(filePath, result.slice(start).join("\n"));
}
