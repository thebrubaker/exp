export interface ExecResult {
	stdout: string;
	stderr: string;
	exitCode: number;
	success: boolean;
}

export interface ExecOptions {
	cwd?: string;
}

export async function exec(command: string[], options: ExecOptions = {}): Promise<ExecResult> {
	try {
		const proc = Bun.spawn(command, {
			stdout: "pipe",
			stderr: "pipe",
			cwd: options.cwd,
		});

		const [stdout, stderr] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
		]);

		await proc.exited;

		return {
			stdout,
			stderr,
			exitCode: proc.exitCode ?? 1,
			success: proc.exitCode === 0,
		};
	} catch (error) {
		return {
			stdout: "",
			stderr: error instanceof Error ? error.message : String(error),
			exitCode: 1,
			success: false,
		};
	}
}

export async function execOrThrow(command: string[], options: ExecOptions = {}): Promise<string> {
	const result = await exec(command, options);
	if (!result.success) {
		throw new Error(`Command failed: ${result.stderr || result.stdout}`);
	}
	return result.stdout.trim();
}

export async function execCheck(command: string[], options: ExecOptions = {}): Promise<boolean> {
	const result = await exec(command, options);
	return result.success;
}
