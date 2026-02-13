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
	fromExp?: string,
) {
	const claudePath = join(expDir, "CLAUDE.md");
	const lineageLine = fromExp ? `\nForked from experiment \`${fromExp}\`.` : "";
	const header = `${MARKER_START}
## Side quest: ${description}

APFS clone of \`${projectName}\`. Original untouched at \`${projectRoot}\`.${lineageLine}
Goal: **${description}**
Diff: \`exp diff ${num}\` | Trash: \`exp trash ${num}\`
${MARKER_END}
`;

	if (existsSync(claudePath)) {
		const existing = readFileSync(claudePath, "utf-8");
		writeFileSync(claudePath, `${header}\n${existing}`);
	} else {
		writeFileSync(claudePath, header);
	}
}
