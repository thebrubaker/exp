import type { ExpConfig } from "../core/config.ts";
import { detectContext } from "../core/context.ts";
import { writeCdTarget } from "../utils/cd-file.ts";
import { dim } from "../utils/colors.ts";

export function cmdHome(_config: ExpConfig) {
	const ctx = detectContext();

	if (!ctx.isFork) {
		dim("Already at project root.");
		return;
	}

	if (!writeCdTarget(ctx.originalRoot)) {
		console.log(ctx.originalRoot);
	}
}
