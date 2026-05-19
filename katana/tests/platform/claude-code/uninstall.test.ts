import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ClaudeCodeAdapter } from "../../../src/platform/claude-code";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "fs";
import { existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("ClaudeCodeAdapter.uninstall()", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "katana-test-"));
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should remove plugin directory after uninstall", async () => {
    const adapter = new ClaudeCodeAdapter();

    // Install first
    await adapter.install({
      workspaceRoot: tempDir,
      katanaRoot: join(tempDir, ".katana"),
      mcpCommand: "npx katana-mcp",
    });

    const pluginDir = join(tempDir, ".claude", "plugins", "katana");
    expect(existsSync(pluginDir)).toBe(true);

    // Uninstall
    const report = await adapter.uninstall({
      workspaceRoot: tempDir,
      katanaRoot: join(tempDir, ".katana"),
    });

    expect(report.platform).toBe("claude-code");
    expect(existsSync(pluginDir)).toBe(false);
    expect(report.files.some((f) => f.action === "removed")).toBe(true);
  });

  it("should clean up empty .claude directory after uninstall", async () => {
    const adapter = new ClaudeCodeAdapter();

    // Install first
    await adapter.install({
      workspaceRoot: tempDir,
      katanaRoot: join(tempDir, ".katana"),
      mcpCommand: "npx katana-mcp",
    });

    const claudeDir = join(tempDir, ".claude");
    expect(existsSync(claudeDir)).toBe(true);

    // Uninstall
    await adapter.uninstall({
      workspaceRoot: tempDir,
      katanaRoot: join(tempDir, ".katana"),
    });

    expect(existsSync(claudeDir)).toBe(false);
  });

  it("should remove katana entry from .mcp.json", async () => {
    const adapter = new ClaudeCodeAdapter();

    // Manually create .mcp.json with katana entry (install doesn't do this; KAT-T-0143 does)
    const mcpJsonPath = join(tempDir, ".mcp.json");
    writeFileSync(
      mcpJsonPath,
      JSON.stringify(
        {
          mcpServers: {
            katana: { command: "npx", args: ["-y", "katana-mcp"], transport: "stdio" },
          },
        },
        null,
        2
      ) + "\n"
    );

    let mcpJson = JSON.parse(readFileSync(mcpJsonPath, "utf-8"));
    expect(mcpJson.mcpServers.katana).toBeDefined();

    // Uninstall
    const report = await adapter.uninstall({
      workspaceRoot: tempDir,
      katanaRoot: join(tempDir, ".katana"),
    });

    // File should be deleted (mcpServers had only katana)
    expect(existsSync(mcpJsonPath)).toBe(false);
    expect(report.files.some((f) => f.path === mcpJsonPath && f.action === "removed")).toBe(true);
  });

  it("should preserve foreign mcpServers entries during uninstall", async () => {
    const adapter = new ClaudeCodeAdapter();

    // Create .mcp.json with foreign entry AND katana (install doesn't create it)
    const mcpJsonPath = join(tempDir, ".mcp.json");
    writeFileSync(
      mcpJsonPath,
      JSON.stringify(
        {
          mcpServers: {
            foo: { command: "foo-command", transport: "stdio" },
            katana: { command: "npx", args: ["-y", "katana-mcp"], transport: "stdio" },
          },
        },
        null,
        2
      ) + "\n"
    );

    // Install (creates plugin structure but doesn't touch .mcp.json)
    await adapter.install({
      workspaceRoot: tempDir,
      katanaRoot: join(tempDir, ".katana"),
      mcpCommand: "npx katana-mcp",
    });

    let mcpJson = JSON.parse(readFileSync(mcpJsonPath, "utf-8"));
    expect(mcpJson.mcpServers.katana).toBeDefined();
    expect(mcpJson.mcpServers.foo).toBeDefined();

    // Uninstall
    const report = await adapter.uninstall({
      workspaceRoot: tempDir,
      katanaRoot: join(tempDir, ".katana"),
    });

    // File should still exist with foo entry intact
    expect(existsSync(mcpJsonPath)).toBe(true);
    mcpJson = JSON.parse(readFileSync(mcpJsonPath, "utf-8"));
    expect(mcpJson.mcpServers.katana).toBeUndefined();
    expect(mcpJson.mcpServers.foo).toBeDefined();
    expect(report.files.some((f) => f.path === mcpJsonPath && f.action === "updated")).toBe(true);
  });

  it("should remove marker block from CLAUDE.md without deleting user content", async () => {
    const adapter = new ClaudeCodeAdapter();

    // Create CLAUDE.md with user content before install
    const claudeMdPath = join(tempDir, "CLAUDE.md");
    const userContent = "# My Project\n\nSome user documentation.\n";
    writeFileSync(claudeMdPath, userContent);

    // Install
    await adapter.install({
      workspaceRoot: tempDir,
      katanaRoot: join(tempDir, ".katana"),
      mcpCommand: "npx katana-mcp",
    });

    let content = readFileSync(claudeMdPath, "utf-8");
    expect(content).toContain("<!-- katana:begin -->");
    expect(content).toContain("<!-- katana:end -->");

    // Uninstall
    const report = await adapter.uninstall({
      workspaceRoot: tempDir,
      katanaRoot: join(tempDir, ".katana"),
    });

    // File should exist with user content but no marker block
    expect(existsSync(claudeMdPath)).toBe(true);
    content = readFileSync(claudeMdPath, "utf-8");
    expect(content).toContain("# My Project");
    expect(content).toContain("Some user documentation.");
    expect(content).not.toContain("<!-- katana:begin -->");
    expect(content).not.toContain("<!-- katana:end -->");
    expect(report.files.some((f) => f.path === claudeMdPath && f.action === "updated")).toBe(true);
  });

  it("should delete CLAUDE.md if it becomes empty after uninstall", async () => {
    const adapter = new ClaudeCodeAdapter();

    // Install (creates CLAUDE.md with only katana content)
    await adapter.install({
      workspaceRoot: tempDir,
      katanaRoot: join(tempDir, ".katana"),
      mcpCommand: "npx katana-mcp",
    });

    const claudeMdPath = join(tempDir, "CLAUDE.md");
    expect(existsSync(claudeMdPath)).toBe(true);

    // Uninstall
    const report = await adapter.uninstall({
      workspaceRoot: tempDir,
      katanaRoot: join(tempDir, ".katana"),
    });

    // File should be deleted
    expect(existsSync(claudeMdPath)).toBe(false);
    expect(report.files.some((f) => f.path === claudeMdPath && f.action === "removed")).toBe(true);
  });

  it("should be idempotent: uninstalling twice is a no-op", async () => {
    const adapter = new ClaudeCodeAdapter();

    // Install
    await adapter.install({
      workspaceRoot: tempDir,
      katanaRoot: join(tempDir, ".katana"),
      mcpCommand: "npx katana-mcp",
    });

    // First uninstall
    const report1 = await adapter.uninstall({
      workspaceRoot: tempDir,
      katanaRoot: join(tempDir, ".katana"),
    });

    const removedCount1 = report1.files.filter((f) => f.action === "removed").length;
    expect(removedCount1).toBeGreaterThan(0);

    // Second uninstall should return empty files (nothing to uninstall)
    const report2 = await adapter.uninstall({
      workspaceRoot: tempDir,
      katanaRoot: join(tempDir, ".katana"),
    });

    // On second uninstall, no files should be touched (empty array)
    expect(report2.files.length).toBe(0);
  });

  it("should handle missing files gracefully during uninstall", async () => {
    const adapter = new ClaudeCodeAdapter();

    // Call uninstall without install (no files exist)
    const report = await adapter.uninstall({
      workspaceRoot: tempDir,
      katanaRoot: join(tempDir, ".katana"),
    });

    // Should return empty files array (nothing to uninstall)
    expect(report.files.length).toBe(0);
  });

  it("install -> uninstall should preserve user files byte-for-byte", async () => {
    const adapter = new ClaudeCodeAdapter();

    const claudeMdPath = join(tempDir, "CLAUDE.md");
    const userContent = "# My Custom Project\n\nLorem ipsum dolor sit amet.\n";

    // Pre-install state
    writeFileSync(claudeMdPath, userContent);
    const originalHash = require("crypto")
      .createHash("sha256")
      .update(userContent)
      .digest("hex");

    // Install
    await adapter.install({
      workspaceRoot: tempDir,
      katanaRoot: join(tempDir, ".katana"),
      mcpCommand: "npx katana-mcp",
    });

    // Uninstall
    await adapter.uninstall({
      workspaceRoot: tempDir,
      katanaRoot: join(tempDir, ".katana"),
    });

    // Post-uninstall check
    const restored = readFileSync(claudeMdPath, "utf-8");
    const restoredHash = require("crypto")
      .createHash("sha256")
      .update(restored)
      .digest("hex");

    expect(restoredHash).toBe(originalHash);
  });
});
