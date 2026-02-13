import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const ROOT_MARKERS = [
	".git",
	"package.json",
	"Cargo.toml",
	"pyproject.toml",
	"go.mod",
	".exp-root",
];

export function getProjectRoot(from?: string): string {
	let dir = from ?? process.cwd();

	while (dir !== "/") {
		for (const marker of ROOT_MARKERS) {
			const target = join(dir, marker);
			if (existsSync(target)) {
				return dir;
			}
		}
		dir = dirname(dir);
	}

	return from ?? process.cwd();
}

export function getProjectName(root?: string): string {
	return basename(root ?? getProjectRoot());
}
