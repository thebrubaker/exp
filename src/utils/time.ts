export function timeAgo(isoDate: string): string {
	const diff = Date.now() - new Date(isoDate).getTime();
	const minutes = Math.floor(diff / 60000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}d ago`;
	const months = Math.floor(days / 30);
	return `${months}mo ago`;
}

const MS_PER_DAY = 86_400_000;

/**
 * Age of an ISO timestamp in (fractional) days, or null if it can't be parsed.
 * Callers use null to handle unknown-age conservatively — e.g. an age-based
 * trash filter must never sweep a branch whose age it can't determine.
 */
export function ageInDays(isoDate: string): number | null {
	const t = new Date(isoDate).getTime();
	if (Number.isNaN(t)) return null;
	return (Date.now() - t) / MS_PER_DAY;
}

/**
 * Parse an age threshold into days. Accepts a bare number (days) or a number
 * with a `d` (days) or `w` (weeks) suffix: "20", "20d", "3w". Returns null for
 * anything unparseable or negative (0 is allowed — matches everything).
 */
export function parseDays(raw: string): number | null {
	const m = raw.trim().match(/^(\d+(?:\.\d+)?)\s*([dw])?$/i);
	if (!m) return null;
	const n = Number.parseFloat(m[1]);
	if (!Number.isFinite(n) || n < 0) return null;
	return (m[2]?.toLowerCase() ?? "d") === "w" ? n * 7 : n;
}
