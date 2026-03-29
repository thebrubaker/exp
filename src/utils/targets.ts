/** Parse args like ["1", "3-5", "8"] into sorted deduplicated numbers [1, 3, 4, 5, 8] */
export function parseTargets(args: string[]): number[] | null {
	const RANGE_RE = /^(\d+)-(\d+)$/;
	const NUM_RE = /^\d+$/;

	// All args must be numbers or ranges — otherwise fall through to single-target
	if (!args.every((a) => NUM_RE.test(a) || RANGE_RE.test(a))) return null;

	const nums = new Set<number>();
	for (const arg of args) {
		const rangeMatch = arg.match(RANGE_RE);
		if (rangeMatch) {
			const lo = Number.parseInt(rangeMatch[1], 10);
			const hi = Number.parseInt(rangeMatch[2], 10);
			const [start, end] = lo <= hi ? [lo, hi] : [hi, lo];
			for (let i = start; i <= end; i++) nums.add(i);
		} else {
			nums.add(Number.parseInt(arg, 10));
		}
	}

	return [...nums].sort((a, b) => a - b);
}
