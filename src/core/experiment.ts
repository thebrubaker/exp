import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { ExpConfig } from "./config.ts";

export interface ExpMetadata {
	name: string;
	description: string;
	source: string;
	created: string;
	number: number;
	// Lifecycle tracking
	status?: "active" | "trashed";
	trashedAt?: string;
}

export function getExpBase(projectRoot: string, config: ExpConfig): string {
	const name = basename(projectRoot);
	if (config.root) {
		return join(config.root, name);
	}
	return join(dirname(projectRoot), `.exp-${name}`);
}

export function ensureExpBase(projectRoot: string, config: ExpConfig): string {
	const base = getExpBase(projectRoot, config);
	if (!existsSync(base)) {
		mkdirSync(base, { recursive: true });
	}
	return base;
}

export function slugify(input: string): string {
	return input
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-/, "")
		.replace(/-$/, "");
}

export function nextNum(base: string): string {
	if (!existsSync(base)) return "001";

	const entries = readdirSync(base, { withFileTypes: true });
	let max = 0;

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const match = entry.name.match(/^(\d+)-/);
		if (match) {
			const n = Number.parseInt(match[1], 10);
			if (n > max) max = n;
		}
	}

	return String(max + 1).padStart(3, "0");
}

export function resolveExp(query: string, base: string): string | null {
	if (!existsSync(base)) return null;

	// Direct match
	const direct = join(base, query);
	if (existsSync(direct)) return direct;

	const entries = readdirSync(base, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.map((e) => e.name)
		.sort();

	// Number prefix: "3" → "003-*"
	if (/^\d+$/.test(query)) {
		const padded = query.padStart(3, "0");
		const match = entries.find((e) => e.startsWith(`${padded}-`));
		if (match) return join(base, match);
	}

	// Partial match
	const partial = entries.find((e) => e.includes(query));
	if (partial) return join(base, partial);

	return null;
}

export function readMetadata(expDir: string): ExpMetadata | null {
	const metaPath = join(expDir, ".exp");
	if (!existsSync(metaPath)) return null;
	try {
		return JSON.parse(readFileSync(metaPath, "utf-8"));
	} catch {
		return null;
	}
}

export function writeMetadata(expDir: string, meta: ExpMetadata) {
	Bun.write(join(expDir, ".exp"), JSON.stringify(meta));
}
