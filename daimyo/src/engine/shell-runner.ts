import { spawn } from "node:child_process";

export interface DeclaredCommand {
  readonly command: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
}

export interface ShellRunResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Runs a declared command without invoking a shell and captures all output.
 */
export function runDeclaredCommand(command: DeclaredCommand): Promise<ShellRunResult> {
  return new Promise((resolve) => {
    const child = spawn(command.command, command.args ?? [], {
      cwd: command.cwd,
      env: command.env === undefined ? process.env : { ...process.env, ...command.env },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdout: string[] = [];
    const stderr: string[] = [];
    let settled = false;

    const timeout =
      command.timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            if (settled) return;
            child.kill("SIGTERM");
            stderr.push(`Command timed out after ${command.timeoutMs}ms`);
          }, command.timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => stdout.push(chunk));
    child.stderr.on("data", (chunk: string) => stderr.push(chunk));

    child.on("error", (error: Error) => {
      if (settled) return;
      settled = true;
      if (timeout !== undefined) clearTimeout(timeout);
      resolve({
        exitCode: 1,
        stdout: stdout.join(""),
        stderr: `${stderr.join("")}${error.message}`,
      });
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      if (timeout !== undefined) clearTimeout(timeout);
      resolve({
        exitCode: code ?? 1,
        stdout: stdout.join(""),
        stderr: stderr.join(""),
      });
    });
  });
}
