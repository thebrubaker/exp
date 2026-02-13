import { describe, expect, test } from "bun:test";
import { timeAgo } from "../src/utils/time.ts";

function ago(ms: number): string {
	return new Date(Date.now() - ms).toISOString();
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("timeAgo", () => {
	test("just now for < 1 minute", () => {
		expect(timeAgo(ago(30 * SECOND))).toBe("just now");
		expect(timeAgo(ago(0))).toBe("just now");
	});

	test("minutes", () => {
		expect(timeAgo(ago(1 * MINUTE))).toBe("1m ago");
		expect(timeAgo(ago(5 * MINUTE))).toBe("5m ago");
		expect(timeAgo(ago(59 * MINUTE))).toBe("59m ago");
	});

	test("hours", () => {
		expect(timeAgo(ago(1 * HOUR))).toBe("1h ago");
		expect(timeAgo(ago(2 * HOUR))).toBe("2h ago");
		expect(timeAgo(ago(23 * HOUR))).toBe("23h ago");
	});

	test("days", () => {
		expect(timeAgo(ago(1 * DAY))).toBe("1d ago");
		expect(timeAgo(ago(3 * DAY))).toBe("3d ago");
		expect(timeAgo(ago(29 * DAY))).toBe("29d ago");
	});

	test("months", () => {
		expect(timeAgo(ago(30 * DAY))).toBe("1mo ago");
		expect(timeAgo(ago(60 * DAY))).toBe("2mo ago");
		expect(timeAgo(ago(365 * DAY))).toBe("12mo ago");
	});

	test("handles ISO date strings", () => {
		const recent = new Date(Date.now() - 5 * MINUTE).toISOString();
		expect(timeAgo(recent)).toBe("5m ago");
	});

	test("boundary: exactly 60 minutes becomes 1h", () => {
		expect(timeAgo(ago(60 * MINUTE))).toBe("1h ago");
	});

	test("boundary: exactly 24 hours becomes 1d", () => {
		expect(timeAgo(ago(24 * HOUR))).toBe("1d ago");
	});

	test("boundary: exactly 30 days becomes 1mo", () => {
		expect(timeAgo(ago(30 * DAY))).toBe("1mo ago");
	});
});
