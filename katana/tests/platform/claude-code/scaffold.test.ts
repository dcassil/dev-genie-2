import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ClaudeCodeAdapter } from "../../../src/platform/claude-code";
import { mkdtempSync, rmSync } from "fs";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("ClaudeCodeAdapter", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "katana-test-"));
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should have id 'claude-code'", () => {
    const adapter = new ClaudeCodeAdapter();
    expect(adapter.id).toBe("claude-code");
  });

  it("install() should create plugin.json and command files", async () => {
    const adapter = new ClaudeCodeAdapter();
    const report = await adapter.install({
      workspaceRoot: tempDir,
      katanaRoot: join(tempDir, ".katana"),
      mcpCommand: "npx katana-mcp",
    });

    expect(report.platform).toBe("claude-code");
    expect(report.commands).toEqual([
      "katana-decompose",
      "katana-work",
      "katana-board",
      "katana-validate",
    ]);
    expect(report.files.length).toBe(7); // plugin.json + 4 commands + .mcp.json + CLAUDE.md
    expect(report.mcpRegistered).toBe(true);

    // Verify plugin.json exists and matches golden fixture
    const pluginPath = join(tempDir, ".claude", "plugins", "katana", "plugin.json");
    expect(existsSync(pluginPath)).toBe(true);
    const pluginContent = readFileSync(pluginPath, "utf-8");
    const pluginJson = JSON.parse(pluginContent);
    expect(pluginJson.name).toBe("katana");
    expect(pluginJson.version).toBe("0.1.0");
    expect(pluginJson.commands).toContain("katana-decompose");
    expect(pluginJson.commands).toContain("katana-work");
    expect(pluginJson.commands).toContain("katana-board");
    expect(pluginJson.commands).toContain("katana-validate");

    // Verify command files exist
    const cmdDir = join(tempDir, ".claude", "plugins", "katana", "commands");
    expect(existsSync(join(cmdDir, "katana-decompose.md"))).toBe(true);
    expect(existsSync(join(cmdDir, "katana-work.md"))).toBe(true);
    expect(existsSync(join(cmdDir, "katana-board.md"))).toBe(true);
    expect(existsSync(join(cmdDir, "katana-validate.md"))).toBe(true);
  });

  it("install() should report all files as skipped on second run", async () => {
    const adapter = new ClaudeCodeAdapter();

    // First install
    const report1 = await adapter.install({
      workspaceRoot: tempDir,
      katanaRoot: join(tempDir, ".katana"),
      mcpCommand: "npx katana-mcp",
    });

    expect(report1.files.every((f) => f.action === "created")).toBe(true);

    // Second install
    const report2 = await adapter.install({
      workspaceRoot: tempDir,
      katanaRoot: join(tempDir, ".katana"),
      mcpCommand: "npx katana-mcp",
    });

    expect(report2.files.every((f) => f.action === "skipped")).toBe(true);
  });

  it("install() should respect dryRun option", async () => {
    const adapter = new ClaudeCodeAdapter();
    const report = await adapter.install({
      workspaceRoot: tempDir,
      katanaRoot: join(tempDir, ".katana"),
      mcpCommand: "npx katana-mcp",
      dryRun: true,
    });

    expect(report.files.every((f) => f.action === "created")).toBe(true);

    // Verify files were NOT actually written
    const pluginPath = join(tempDir, ".claude", "plugins", "katana", "plugin.json");
    expect(existsSync(pluginPath)).toBe(false);
  });

  it("registerCommand() should write a command file", async () => {
    const adapter = new ClaudeCodeAdapter();

    // First install to set up directories
    await adapter.install({
      workspaceRoot: tempDir,
      katanaRoot: join(tempDir, ".katana"),
      mcpCommand: "npx katana-mcp",
    });

    // Register a new command
    const customCmd = {
      id: "katana-foo",
      description: "Custom foo command",
      handlerHint: { mcpTool: "custom_tool" },
    };

    const files = await adapter.registerCommand(customCmd, {
      workspaceRoot: tempDir,
      katanaRoot: join(tempDir, ".katana"),
      mcpCommand: "npx katana-mcp",
    });

    expect(files.length).toBe(1);
    expect(files[0].action).toBe("created");

    const cmdPath = join(tempDir, ".claude", "plugins", "katana", "commands", "katana-foo.md");
    expect(existsSync(cmdPath)).toBe(true);
    const content = readFileSync(cmdPath, "utf-8");
    expect(content).toContain("name: katana-foo");
    expect(content).toContain("description: Custom foo command");
  });
});
