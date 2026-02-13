import chalk from "chalk";

export const c = {
	red: chalk.red,
	green: chalk.green,
	yellow: chalk.yellow,
	blue: chalk.blue,
	magenta: chalk.magenta,
	cyan: chalk.cyan,
	dim: chalk.dim,
	bold: chalk.bold,
};

export function info(...args: unknown[]) {
	console.log(`${c.blue("▸")} ${args.join(" ")}`);
}

export function ok(...args: unknown[]) {
	console.log(`${c.green("✓")} ${args.join(" ")}`);
}

export function warn(...args: unknown[]) {
	console.log(`${c.yellow("⚠")} ${args.join(" ")}`);
}

export function err(...args: unknown[]) {
	console.error(`${c.red("✗")} ${args.join(" ")}`);
}

export function dim(...args: unknown[]) {
	console.log(c.dim(args.join(" ")));
}
