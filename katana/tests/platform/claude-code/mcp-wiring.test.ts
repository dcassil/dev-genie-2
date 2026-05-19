import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, readFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { ClaudeCodeAdapter } from "../../../src/platform/claude-code";
import { InstallOptions } from "../../../src/platform/port";

const TEST_WORKSPACE = "/tmp/katana-mcp-test";

describe("Claude Code Adapter - MCP Wiring", () => {
  beforeEach(() => {
    mkdirSync(TEST_WORKSPACE, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_WORKSPACE, { recursive: true, force: true });
  });

  it("should create .mcp.json with katana server on fresh repo", async () => {
    const adapter = new ClaudeCodeAdapter();
    const opts: InstallOptions = {
      workspaceRoot: TEST_WORKSPACE,
      katanaRoot: "/katana",
      dryRun: false,
      force: false,
      mcpCommand: "npx",
      mcpArgs: ["-y", "katana-mcp"],
    };

    const report = await adapter.install(opts);

    expect(report.mcpRegistered).toBe(true);
    expect(report.warnings).toEqual([]);

    const mcpJsonPath = join(TEST_WORKSPACE, ".mcp.json");
    const content = readFileSync(mcpJsonPath, "utf-8");
    const config = JSON.parse(content);

    expect(config.mcpServers.katana).toBeDefined();
    expect(config.mcpServers.katana.command).toBe("npx");
    expect(config.mcpServers.katana.args).toEqual(["-y", "katana-mcp"]);
    expect(config.mcpServers.katana.transport).toBe("stdio");
  });

  it("should preserve existing servers when merging", async () => {
    const mcpJsonPath = join(TEST_WORKSPACE, ".mcp.json");
    const existing = {
      mcpServers: {
        foo: {
          command: "node",
          args: ["foo.js"],
          transport: "stdio",
        },
      },
    };
    writeFileSync(mcpJsonPath, JSON.stringify(existing, null, 2));

    const adapter = new ClaudeCodeAdapter();
    const opts: InstallOptions = {
      workspaceRoot: TEST_WORKSPACE,
      katanaRoot: "/katana",
      dryRun: false,
      force: false,
      mcpCommand: "npx",
      mcpArgs: ["-y", "katana-mcp"],
    };

    const report = await adapter.install(opts);

    expect(report.mcpRegistered).toBe(true);

    const content = readFileSync(mcpJsonPath, "utf-8");
    const config = JSON.parse(content);

    expect(config.mcpServers.foo).toBeDefined();
    expect(config.mcpServers.foo.command).toBe("node");
    expect(config.mcpServers.katana).toBeDefined();
    expect(config.mcpServers.katana.command).toBe("npx");
  });

  it("should skip write on re-install (idempotent)", async () => {
    const adapter = new ClaudeCodeAdapter();
    const opts: InstallOptions = {
      workspaceRoot: TEST_WORKSPACE,
      katanaRoot: "/katana",
      dryRun: false,
      force: false,
      mcpCommand: "npx",
      mcpArgs: ["-y", "katana-mcp"],
    };

    // First install
    await adapter.install(opts);
    const mcpJsonPath = join(TEST_WORKSPACE, ".mcp.json");
    const firstContent = readFileSync(mcpJsonPath, "utf-8");
    const firstMtime = (require("fs").statSync(mcpJsonPath)).mtime;

    // Small delay to ensure mtime would differ if written
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Second install
    const report = await adapter.install(opts);

    const mcpFile = report.files.find((f) => f.path === mcpJsonPath);
    expect(mcpFile?.action).toBe("skipped");
    expect(readFileSync(mcpJsonPath, "utf-8")).toBe(firstContent);
  });

  it("should fail on malformed .mcp.json without --force", async () => {
    const mcpJsonPath = join(TEST_WORKSPACE, ".mcp.json");
    writeFileSync(mcpJsonPath, "{ invalid json");

    const adapter = new ClaudeCodeAdapter();
    const opts: InstallOptions = {
      workspaceRoot: TEST_WORKSPACE,
      katanaRoot: "/katana",
      dryRun: false,
      force: false,
      mcpCommand: "npx",
      mcpArgs: ["-y", "katana-mcp"],
    };

    const report = await adapter.install(opts);

    expect(report.mcpRegistered).toBe(false);
    expect(report.warnings.length).toBeGreaterThan(0);
    expect(report.warnings[0]).toMatch(/Malformed/);
  });

  it("should overwrite malformed .mcp.json with --force", async () => {
    const mcpJsonPath = join(TEST_WORKSPACE, ".mcp.json");
    writeFileSync(mcpJsonPath, "{ invalid json");

    const adapter = new ClaudeCodeAdapter();
    const opts: InstallOptions = {
      workspaceRoot: TEST_WORKSPACE,
      katanaRoot: "/katana",
      dryRun: false,
      force: true,
      mcpCommand: "npx",
      mcpArgs: ["-y", "katana-mcp"],
    };

    const report = await adapter.install(opts);

    expect(report.mcpRegistered).toBe(true);
    expect(report.warnings).toEqual([]);

    const content = readFileSync(mcpJsonPath, "utf-8");
    const config = JSON.parse(content);
    expect(config.mcpServers.katana).toBeDefined();
  });

  it("should support dryRun mode", async () => {
    const adapter = new ClaudeCodeAdapter();
    const opts: InstallOptions = {
      workspaceRoot: TEST_WORKSPACE,
      katanaRoot: "/katana",
      dryRun: true,
      force: false,
      mcpCommand: "npx",
      mcpArgs: ["-y", "katana-mcp"],
    };

    const report = await adapter.install(opts);

    const mcpJsonPath = join(TEST_WORKSPACE, ".mcp.json");
    expect(require("fs").existsSync(mcpJsonPath)).toBe(false);

    const mcpFile = report.files.find((f) => f.path === mcpJsonPath);
    expect(mcpFile?.action).toBe("created");
  });
});
