import { describe, expect, test } from "bun:test";

/**
 * Tests for smart `exp new` features:
 * - Flag parsing: --terminal, --no-terminal, --from
 * - TTY detection logic
 * - Experiment context auto-detection
 *
 * These test the parsing and decision logic extracted from cmdNew,
 * not the full command (which requires filesystem + cloning).
 */

// ── Flag Parsing ──

function parseNewFlags(args: string[]) {
	let fromId: string | null = null;
	let terminalOverride: boolean | null = null;
	const filteredArgs: string[] = [];
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--from") {
			fromId = args[i + 1] ?? null;
			i++;
		} else if (args[i] === "--terminal") {
			terminalOverride = true;
		} else if (args[i] === "--no-terminal") {
			terminalOverride = false;
		} else {
			filteredArgs.push(args[i]);
		}
	}
	const description = filteredArgs.join(" ") || "fork";
	return { fromId, terminalOverride, filteredArgs, description };
}

describe("flag parsing", () => {
	test("parses --terminal flag", () => {
		const result = parseNewFlags(["try", "thing", "--terminal"]);
		expect(result.terminalOverride).toBe(true);
		expect(result.filteredArgs).toEqual(["try", "thing"]);
		expect(result.description).toBe("try thing");
	});

	test("parses --no-terminal flag", () => {
		const result = parseNewFlags(["try", "thing", "--no-terminal"]);
		expect(result.terminalOverride).toBe(false);
		expect(result.filteredArgs).toEqual(["try", "thing"]);
	});

	test("--terminal at the beginning", () => {
		const result = parseNewFlags(["--terminal", "try", "thing"]);
		expect(result.terminalOverride).toBe(true);
		expect(result.filteredArgs).toEqual(["try", "thing"]);
	});

	test("--no-terminal at the beginning", () => {
		const result = parseNewFlags(["--no-terminal", "try", "thing"]);
		expect(result.terminalOverride).toBe(false);
		expect(result.filteredArgs).toEqual(["try", "thing"]);
	});

	test("no terminal flags leaves terminalOverride as null", () => {
		const result = parseNewFlags(["try", "thing"]);
		expect(result.terminalOverride).toBeNull();
	});

	test("--from and --terminal together", () => {
		const result = parseNewFlags(["try", "--from", "1", "--terminal"]);
		expect(result.fromId).toBe("1");
		expect(result.terminalOverride).toBe(true);
		expect(result.filteredArgs).toEqual(["try"]);
	});

	test("--from and --no-terminal together", () => {
		const result = parseNewFlags(["--no-terminal", "--from", "redis", "variant"]);
		expect(result.fromId).toBe("redis");
		expect(result.terminalOverride).toBe(false);
		expect(result.filteredArgs).toEqual(["variant"]);
	});

	test("all flags together", () => {
		const result = parseNewFlags(["--from", "3", "--no-terminal", "my", "desc"]);
		expect(result.fromId).toBe("3");
		expect(result.terminalOverride).toBe(false);
		expect(result.filteredArgs).toEqual(["my", "desc"]);
		expect(result.description).toBe("my desc");
	});

	test("empty args with no flags", () => {
		const result = parseNewFlags([]);
		expect(result.fromId).toBeNull();
		expect(result.terminalOverride).toBeNull();
		expect(result.filteredArgs).toEqual([]);
		expect(result.description).toBe("fork");
	});

	test("--terminal does not consume the next arg", () => {
		const result = parseNewFlags(["--terminal", "my", "fork"]);
		expect(result.terminalOverride).toBe(true);
		expect(result.filteredArgs).toEqual(["my", "fork"]);
		expect(result.description).toBe("my fork");
	});
});

// ── TTY Detection Logic ──

function shouldOpenTerminal(terminalOverride: boolean | null, isTTY: boolean | undefined): boolean {
	const isInteractive = isTTY ?? false;
	if (terminalOverride !== null) {
		return terminalOverride;
	}
	return isInteractive;
}

describe("TTY detection", () => {
	test("suppresses terminal when stdin is not a TTY (script/AI agent)", () => {
		expect(shouldOpenTerminal(null, false)).toBe(false);
	});

	test("suppresses terminal when stdin.isTTY is undefined (piped)", () => {
		expect(shouldOpenTerminal(null, undefined)).toBe(false);
	});

	test("opens terminal when stdin is a TTY (interactive)", () => {
		expect(shouldOpenTerminal(null, true)).toBe(true);
	});

	test("--terminal overrides non-TTY to open terminal", () => {
		expect(shouldOpenTerminal(true, false)).toBe(true);
	});

	test("--terminal overrides undefined TTY to open terminal", () => {
		expect(shouldOpenTerminal(true, undefined)).toBe(true);
	});

	test("--no-terminal overrides TTY to suppress terminal", () => {
		expect(shouldOpenTerminal(false, true)).toBe(false);
	});

	test("--no-terminal when already non-TTY still suppresses", () => {
		expect(shouldOpenTerminal(false, false)).toBe(false);
	});

	test("--terminal when already TTY still opens", () => {
		expect(shouldOpenTerminal(true, true)).toBe(true);
	});
});

// ── Experiment Context Auto-detection ──

import { afterEach, beforeEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { detectContext } from "../src/core/context.ts";
import { resolveExp } from "../src/core/experiment.ts";

let tmpBase: string;

beforeEach(() => {
	tmpBase = join(
		tmpdir(),
		`exp-test-smart-new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
	);
	mkdirSync(tmpBase, { recursive: true });
});

afterEach(() => {
	rmSync(tmpBase, { recursive: true, force: true });
});

function writeExpMeta(dir: string, meta: Record<string, unknown>) {
	writeFileSync(join(dir, ".exp"), JSON.stringify(meta));
}

/**
 * Simulate the clone source resolution logic from cmdNew.
 * Returns the clone source and fromExpName that would be used.
 */
function resolveCloneSource(
	fromId: string | null,
	ctx: ReturnType<typeof detectContext>,
	root: string,
	base: string,
	projectName: string,
) {
	let cloneSource = root;
	let cloneSourceLabel = projectName;
	let fromExpName: string | undefined;

	if (fromId) {
		const resolved = resolveExp(fromId, base);
		if (!resolved) {
			throw new Error(`Fork not found: ${fromId}`);
		}
		cloneSource = resolved;
		fromExpName = basename(resolved);
		cloneSourceLabel = fromExpName;
	} else if (ctx.isFork) {
		cloneSource = ctx.expDir;
		fromExpName = ctx.expName;
		cloneSourceLabel = fromExpName;
	}

	return { cloneSource, cloneSourceLabel, fromExpName };
}

describe("experiment context auto-detection", () => {
	test("when inside experiment and no --from, clones from current experiment", () => {
		const expDir = join(tmpBase, "001-try-redis");
		mkdirSync(expDir);
		writeExpMeta(expDir, {
			name: "001-try-redis",
			description: "try redis",
			source: "/Users/joel/Code/my-project",
			created: "2025-02-12T15:30:00.000Z",
			number: 1,
		});

		const ctx = detectContext(expDir);
		expect(ctx.isFork).toBe(true);

		const result = resolveCloneSource(
			null,
			ctx,
			"/Users/joel/Code/my-project",
			tmpBase,
			"my-project",
		);
		expect(result.cloneSource).toBe(expDir);
		expect(result.fromExpName).toBe("001-try-redis");
		expect(result.cloneSourceLabel).toBe("001-try-redis");
	});

	test("--from takes priority over auto-detected experiment context", () => {
		// Set up two experiments
		const exp1 = join(tmpBase, "001-try-redis");
		const exp2 = join(tmpBase, "002-dark-mode");
		mkdirSync(exp1);
		mkdirSync(exp2);

		// We're "inside" exp1 but explicitly pass --from pointing to exp2
		writeExpMeta(exp1, {
			name: "001-try-redis",
			description: "try redis",
			source: "/Users/joel/Code/my-project",
			created: "2025-02-12T15:30:00.000Z",
			number: 1,
		});

		const ctx = detectContext(exp1);
		expect(ctx.isFork).toBe(true);

		const result = resolveCloneSource(
			"2",
			ctx,
			"/Users/joel/Code/my-project",
			tmpBase,
			"my-project",
		);
		expect(result.cloneSource).toBe(exp2);
		expect(result.fromExpName).toBe("002-dark-mode");
	});

	test("when not inside experiment and no --from, clones from project root", () => {
		const ctx = detectContext(tmpBase); // no .exp file
		expect(ctx.isFork).toBe(false);

		const result = resolveCloneSource(
			null,
			ctx,
			"/Users/joel/Code/my-project",
			tmpBase,
			"my-project",
		);
		expect(result.cloneSource).toBe("/Users/joel/Code/my-project");
		expect(result.fromExpName).toBeUndefined();
		expect(result.cloneSourceLabel).toBe("my-project");
	});

	test("auto-detected context uses originalRoot for project root", () => {
		const expDir = join(tmpBase, "003-auth-rewrite");
		mkdirSync(expDir);
		writeExpMeta(expDir, {
			name: "003-auth-rewrite",
			description: "rewrite auth",
			source: "/Users/joel/Code/big-app",
			created: "2025-06-01T10:00:00.000Z",
			number: 3,
		});

		const ctx = detectContext(expDir);
		expect(ctx.isFork).toBe(true);
		if (!ctx.isFork) return;

		// The root should come from the .exp metadata source field
		expect(ctx.originalRoot).toBe("/Users/joel/Code/big-app");
	});

	test("auto-detected context from subdirectory of experiment", () => {
		const expDir = join(tmpBase, "001-try-redis");
		mkdirSync(expDir);
		writeExpMeta(expDir, {
			name: "001-try-redis",
			description: "try redis",
			source: "/Users/joel/Code/my-project",
			created: "2025-02-12T15:30:00.000Z",
			number: 1,
		});

		const subDir = join(expDir, "src", "components");
		mkdirSync(subDir, { recursive: true });

		const ctx = detectContext(subDir);
		expect(ctx.isFork).toBe(true);
		if (!ctx.isFork) return;

		expect(ctx.expDir).toBe(expDir);
		expect(ctx.expName).toBe("001-try-redis");

		const result = resolveCloneSource(null, ctx, ctx.originalRoot, tmpBase, "my-project");
		expect(result.cloneSource).toBe(expDir);
		expect(result.fromExpName).toBe("001-try-redis");
	});
});
