import { describe, it, expect, beforeEach, vi } from "vitest";
import { defaultKatanaMcpArgs, runInstall } from "../../src/cli/install.js";
import { registerAdapter, resetRegistry } from "../../src/platform/registry.js";
import type { InstallCommandDeps } from "../../src/cli/install.js";
import type { InstallOptions, InstallReport, PlatformAdapter, PlatformId } from "../../src/platform/port.js";

describe("install CLI", () => {
  let output: string[];
  let errors: string[];
  let deps: InstallCommandDeps;

  beforeEach(() => {
    resetRegistry();
    output = [];
    errors = [];
    deps = {
      stdout: (s: string) => output.push(s),
      stderr: (s: string) => errors.push(s),
    };
  });

  it("should exit 2 when platform is missing", async () => {
    const code = await runInstall([], deps);
    expect(code).toBe(2);
    expect(errors.join("")).toContain("platform argument required");
  });

  it("should exit 2 when platform is unknown", async () => {
    const code = await runInstall(["bogus"], deps);
    expect(code).toBe(2);
    expect(errors.join("")).toContain("Unknown platform");
  });

  it("should list available platforms on error", async () => {
    await runInstall(["unknown"], deps);
    const errorText = errors.join("");
    expect(errorText).toContain("Available platforms:");
    expect(errorText).toMatch(/claude-code|cursor|openai-codex/);
  });

  it("should default to the bundled marketplace launcher", async () => {
    const calls: InstallOptions[] = [];
    registerAdapter("claude-code", () => makeAdapter("claude-code", calls));

    const code = await runInstall(["claude-code", "--workspace", "/tmp/katana-cli-test"], deps);

    expect(code).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].mcpCommand).toBe("node");
    expect(calls[0].mcpArgs).toEqual(defaultKatanaMcpArgs());
    expect(calls[0].mcpArgs?.[0]).toMatch(/bin\/katana-mcp\.js$/);
  });

  it("should parse explicit install options correctly", async () => {
    const calls: InstallOptions[] = [];
    registerAdapter("claude-code", () => makeAdapter("claude-code", calls));

    const code = await runInstall([
      "claude-code",
      "--workspace",
      "/tmp/work",
      "--katana-root",
      "/tmp/work/.custom-katana",
      "--mcp-command",
      "node",
      "--mcp-args",
      "/tmp/katana/bin/katana-mcp.js,--flag",
      "--dry-run",
      "--force",
    ], deps);

    expect(code).toBe(0);
    expect(calls[0]).toMatchObject({
      workspaceRoot: "/tmp/work",
      katanaRoot: "/tmp/work/.custom-katana",
      mcpCommand: "node",
      mcpArgs: ["/tmp/katana/bin/katana-mcp.js", "--flag"],
      dryRun: true,
      force: true,
    });
  });

  it("should print file table and summary on success", async () => {
    const calls: InstallOptions[] = [];
    registerAdapter("claude-code", () => makeAdapter("claude-code", calls, {
      files: [{ path: "/tmp/test/.katana/config.json", action: "created", bytes: 100 }],
    }));

    const code = await runInstall(["claude-code"], deps);

    expect(code).toBe(0);
    expect(output.join("")).toContain("Files:");
    expect(output.join("")).toContain("installed claude-code: 1 created, 0 updated, 0 skipped, mcp=true");
  });

  it("should respect --dry-run flag", async () => {
    const calls: InstallOptions[] = [];
    registerAdapter("claude-code", () => makeAdapter("claude-code", calls));

    const code = await runInstall(["claude-code", "--dry-run"], deps);

    expect(code).toBe(0);
    expect(calls[0].dryRun).toBe(true);
  });

  it("should handle default workspace and katana-root", async () => {
    const calls: InstallOptions[] = [];
    registerAdapter("claude-code", () => makeAdapter("claude-code", calls));

    const code = await runInstall(["claude-code"], deps);

    expect(code).toBe(0);
    expect(calls[0].workspaceRoot).toBe(process.cwd());
    expect(calls[0].katanaRoot).toBe(`${process.cwd()}/.katana`);
  });
});

function makeAdapter(
  id: PlatformId,
  calls: InstallOptions[],
  overrides: Partial<InstallReport> = {},
): PlatformAdapter {
  const install = vi.fn(async (opts: InstallOptions): Promise<InstallReport> => {
    calls.push(opts);
    return {
      platform: id,
      files: [],
      mcpRegistered: true,
      commands: [],
      warnings: [],
      ...overrides,
    };
  });
  return {
    id,
    install,
    async uninstall(): Promise<InstallReport> {
      return {
        platform: id,
        files: [],
        mcpRegistered: false,
        commands: [],
        warnings: [],
      };
    },
    async registerCommand() {
      return [];
    },
    async registerRule() {
      return [];
    },
    async generateAgentDoc() {
      return { path: "AGENTS.md", action: "skipped", bytes: 0 };
    },
  };
}
