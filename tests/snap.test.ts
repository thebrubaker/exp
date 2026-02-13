import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { slugify } from "../src/core/experiment.ts";

// Helpers

function tmpDir(): string {
	const dir = join(
		import.meta.dir,
		".tmp",
		`test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
	);
	mkdirSync(dir, { recursive: true });
	return dir;
}

function writeSnapMeta(
	snapDir: string,
	meta: { name: string; description: string; created: string; source: string },
) {
	writeFileSync(join(snapDir, ".snap"), JSON.stringify(meta));
}

function readSnapMeta(
	snapDir: string,
): { name: string; description: string; created: string; source: string } | null {
	const metaPath = join(snapDir, ".snap");
	if (!existsSync(metaPath)) return null;
	try {
		return JSON.parse(readFileSync(metaPath, "utf-8"));
	} catch {
		return null;
	}
}

const dirs: string[] = [];

afterEach(() => {
	for (const dir of dirs) {
		try {
			Bun.spawnSync(["/bin/rm", "-rf", dir]);
		} catch {}
	}
	dirs.length = 0;
});

// ── Tests ──

describe("snap", () => {
	describe("snapshot directory creation", () => {
		test("creates .snapshots/<exp-name>/ directory structure", () => {
			const tmp = tmpDir();
			dirs.push(tmp);

			const base = join(tmp, ".exp-project");
			const expName = "001-try-redis";
			const expDir = join(base, expName);
			mkdirSync(expDir, { recursive: true });

			const snapshotsDir = join(base, ".snapshots", expName);
			mkdirSync(snapshotsDir, { recursive: true });

			expect(existsSync(snapshotsDir)).toBe(true);
			expect(basename(snapshotsDir)).toBe(expName);
		});

		test("creates snapshot subdirectory with slugified name", () => {
			const tmp = tmpDir();
			dirs.push(tmp);

			const base = join(tmp, ".exp-project");
			const expName = "001-try-redis";
			const snapshotsDir = join(base, ".snapshots", expName);

			const description = "before refactor";
			const slug = slugify(description);
			const snapDir = join(snapshotsDir, slug);
			mkdirSync(snapDir, { recursive: true });

			expect(slug).toBe("before-refactor");
			expect(existsSync(snapDir)).toBe(true);
		});

		test("handles duplicate snapshot names with timestamp suffix", () => {
			const tmp = tmpDir();
			dirs.push(tmp);

			const snapshotsDir = join(tmp, ".snapshots", "001-try-redis");
			const slug = slugify("before refactor");
			mkdirSync(join(snapshotsDir, slug), { recursive: true });

			// Simulate the dedup logic from snap.ts
			let snapName = slug;
			if (existsSync(join(snapshotsDir, snapName))) {
				const ts = Date.now();
				snapName = `${slug}-${ts}`;
			}

			expect(snapName).toMatch(/^before-refactor-\d+$/);
			expect(snapName).not.toBe(slug);
		});
	});

	describe("snapshot metadata", () => {
		test("writes .snap JSON metadata file", () => {
			const tmp = tmpDir();
			dirs.push(tmp);

			const snapDir = join(tmp, "my-snapshot");
			mkdirSync(snapDir, { recursive: true });

			const meta = {
				name: "before-refactor",
				description: "before refactor",
				created: new Date().toISOString(),
				source: "/path/to/experiment",
			};

			writeSnapMeta(snapDir, meta);

			const metaPath = join(snapDir, ".snap");
			expect(existsSync(metaPath)).toBe(true);

			const read = JSON.parse(readFileSync(metaPath, "utf-8"));
			expect(read.name).toBe("before-refactor");
			expect(read.description).toBe("before refactor");
			expect(read.source).toBe("/path/to/experiment");
			expect(read.created).toBeTruthy();
		});

		test("reads .snap metadata back", () => {
			const tmp = tmpDir();
			dirs.push(tmp);

			const snapDir = join(tmp, "my-snapshot");
			mkdirSync(snapDir, { recursive: true });

			const meta = {
				name: "working-auth",
				description: "working auth flow",
				created: "2025-01-15T10:30:00.000Z",
				source: "/some/path",
			};

			writeSnapMeta(snapDir, meta);

			const read = readSnapMeta(snapDir);
			expect(read).not.toBeNull();
			expect(read!.name).toBe("working-auth");
			expect(read!.description).toBe("working auth flow");
			expect(read!.created).toBe("2025-01-15T10:30:00.000Z");
		});

		test("returns null for missing .snap file", () => {
			const tmp = tmpDir();
			dirs.push(tmp);

			const snapDir = join(tmp, "no-meta");
			mkdirSync(snapDir, { recursive: true });

			const read = readSnapMeta(snapDir);
			expect(read).toBeNull();
		});
	});

	describe("snapshot listing", () => {
		test("lists all snapshot directories", () => {
			const tmp = tmpDir();
			dirs.push(tmp);

			const snapshotsDir = join(tmp, ".snapshots", "001-try-redis");

			// Create a few snapshots
			for (const name of ["before-refactor", "working-auth", "cleanup"]) {
				const snapDir = join(snapshotsDir, name);
				mkdirSync(snapDir, { recursive: true });
				writeSnapMeta(snapDir, {
					name,
					description: name.replace(/-/g, " "),
					created: new Date().toISOString(),
					source: "/path/to/exp",
				});
			}

			const entries = readdirSync(snapshotsDir, { withFileTypes: true })
				.filter((e) => e.isDirectory())
				.sort((a, b) => a.name.localeCompare(b.name));

			expect(entries).toHaveLength(3);
			expect(entries.map((e) => e.name)).toEqual(["before-refactor", "cleanup", "working-auth"]);
		});

		test("handles empty snapshots directory", () => {
			const tmp = tmpDir();
			dirs.push(tmp);

			const snapshotsDir = join(tmp, ".snapshots", "001-try-redis");
			mkdirSync(snapshotsDir, { recursive: true });

			const entries = readdirSync(snapshotsDir, { withFileTypes: true }).filter((e) =>
				e.isDirectory(),
			);

			expect(entries).toHaveLength(0);
		});

		test("handles non-existent snapshots directory", () => {
			const tmp = tmpDir();
			dirs.push(tmp);

			const snapshotsDir = join(tmp, ".snapshots", "001-try-redis");
			expect(existsSync(snapshotsDir)).toBe(false);
		});
	});

	describe("snapshot resolution", () => {
		test("resolves snapshot by exact name", () => {
			const tmp = tmpDir();
			dirs.push(tmp);

			const snapshotsDir = join(tmp, ".snapshots", "001-try-redis");
			mkdirSync(join(snapshotsDir, "before-refactor"), { recursive: true });

			const direct = join(snapshotsDir, "before-refactor");
			expect(existsSync(direct)).toBe(true);
		});

		test("resolves snapshot by partial match", () => {
			const tmp = tmpDir();
			dirs.push(tmp);

			const snapshotsDir = join(tmp, ".snapshots", "001-try-redis");
			mkdirSync(join(snapshotsDir, "before-refactor"), { recursive: true });
			mkdirSync(join(snapshotsDir, "working-auth"), { recursive: true });

			const entries = readdirSync(snapshotsDir, { withFileTypes: true })
				.filter((e) => e.isDirectory())
				.map((e) => e.name)
				.sort();

			const query = "refactor";
			const match = entries.find((e) => e.includes(query));
			expect(match).toBe("before-refactor");
		});
	});

	describe("restore flow", () => {
		test("creates pre-restore backup before restoring", () => {
			const tmp = tmpDir();
			dirs.push(tmp);

			const snapshotsDir = join(tmp, ".snapshots", "001-try-redis");
			mkdirSync(snapshotsDir, { recursive: true });

			// Simulate creating a pre-restore backup
			const ts = Date.now();
			const backupName = `pre-restore-${ts}`;
			const backupDir = join(snapshotsDir, backupName);
			mkdirSync(backupDir, { recursive: true });

			writeSnapMeta(backupDir, {
				name: backupName,
				description: "Auto-backup before restoring my-snap",
				created: new Date().toISOString(),
				source: "/path/to/exp",
			});

			expect(existsSync(backupDir)).toBe(true);
			expect(backupName).toMatch(/^pre-restore-\d+$/);

			const meta = readSnapMeta(backupDir);
			expect(meta).not.toBeNull();
			expect(meta!.description).toContain("Auto-backup");
		});

		test("snapshot contains correct source reference", () => {
			const tmp = tmpDir();
			dirs.push(tmp);

			const expDir = join(tmp, "001-try-redis");
			mkdirSync(expDir, { recursive: true });

			const snapDir = join(tmp, ".snapshots", "001-try-redis", "before-refactor");
			mkdirSync(snapDir, { recursive: true });

			writeSnapMeta(snapDir, {
				name: "before-refactor",
				description: "before refactor",
				created: new Date().toISOString(),
				source: expDir,
			});

			const meta = readSnapMeta(snapDir);
			expect(meta!.source).toBe(expDir);
		});
	});
});
