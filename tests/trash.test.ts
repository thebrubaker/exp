import { describe, expect, test } from "bun:test";
import { parseTargets } from "../src/commands/trash.ts";

describe("parseTargets", () => {
	test("single number", () => {
		expect(parseTargets(["3"])).toEqual([3]);
	});

	test("multiple numbers", () => {
		expect(parseTargets(["1", "3", "5"])).toEqual([1, 3, 5]);
	});

	test("range", () => {
		expect(parseTargets(["1-5"])).toEqual([1, 2, 3, 4, 5]);
	});

	test("reversed range", () => {
		expect(parseTargets(["5-1"])).toEqual([1, 2, 3, 4, 5]);
	});

	test("mixed numbers and ranges", () => {
		expect(parseTargets(["1", "3-5", "8"])).toEqual([1, 3, 4, 5, 8]);
	});

	test("deduplicates overlapping", () => {
		expect(parseTargets(["1-3", "2-4"])).toEqual([1, 2, 3, 4]);
	});

	test("deduplicates explicit + range", () => {
		expect(parseTargets(["3", "1-5"])).toEqual([1, 2, 3, 4, 5]);
	});

	test("returns null for non-numeric args", () => {
		expect(parseTargets(["redis"])).toBeNull();
	});

	test("returns null for mixed numeric and named args", () => {
		expect(parseTargets(["1", "redis"])).toBeNull();
	});

	test("single-element range", () => {
		expect(parseTargets(["3-3"])).toEqual([3]);
	});
});
