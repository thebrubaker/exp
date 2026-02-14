import type { ExpConfig } from "../core/config.ts";
import { detectContext } from "../core/context.ts";
import { dim } from "../utils/colors.ts";

export function cmdHome(_config: ExpConfig) {
	const ctx = detectContext();

	if (!ctx.isFork) {
		dim("Already at project root.");
		return;
	}

	// Print just the path (so it works with: cd $(exp home))
	console.log(ctx.originalRoot);
}
