import { describe, expect, it } from "vitest";
import { runDeclaredCommand } from "../../src/engine/shell-runner.js";

describe("runDeclaredCommand", () => {
  it("captures stdout, stderr, and a zero exit code", async () => {
    const result = await runDeclaredCommand({
      command: process.execPath,
      args: [
        "-e",
        "process.stdout.write('out'); process.stderr.write('err'); process.exit(0);",
      ],
    });

    expect(result).toEqual({
      exitCode: 0,
      stdout: "out",
      stderr: "err",
    });
  });

  it("captures non-zero exit codes", async () => {
    const result = await runDeclaredCommand({
      command: process.execPath,
      args: ["-e", "process.stderr.write('bad'); process.exit(7);"],
    });

    expect(result.exitCode).toBe(7);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("bad");
  });
});
