import { c } from "./colors.ts";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export interface Spinner {
	update: (text: string) => void;
	stop: () => void;
}

const noopSpinner: Spinner = {
	update() {},
	stop() {},
};

export function startSpinner(text: string): Spinner {
	if (!process.stdout.isTTY) return noopSpinner;

	let frame = 0;
	let currentText = text;

	const render = () => {
		const symbol = c.cyan(FRAMES[frame % FRAMES.length]);
		process.stdout.write(`\r  ${symbol} ${currentText}`);
		frame++;
	};

	render();
	const interval = setInterval(render, 80);

	return {
		update(newText: string) {
			currentText = newText;
		},
		stop() {
			clearInterval(interval);
			process.stdout.write("\r\x1b[2K");
		},
	};
}
