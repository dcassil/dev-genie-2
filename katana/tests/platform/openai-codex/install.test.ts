import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "os";
import { mkdtemp, rm, readFile } from "fs/promises";
import { resolve } from "path";
import { OpenAiCodexAdapter } from "../../../src/platform/openai-codex";

describe("OpenAiCodexAdapter", () => {
  let workspaceRoot: string;
  let katanaRoot: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(resolve(tmpdir(), "openai-codex-"));
    katanaRoot = resolve(workspaceRoot, ".katana");
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("should install on a fresh directory", async () => {
    const adapter = new OpenAiCodexAdapter();
    const report = await adapter.install({
      workspaceRoot,
      katanaRoot,
      mcpCommand: "npx katana-mcp",
      mcpArgs: ["--stdio"],
    });

    expect(report.platform).toBe("openai-codex");
    expect(report.mcpRegistered).toBe(false);
    expect(report.commands).toEqual([
      "katana-decompose",
      "katana-work",
      "katana-board",
      "katana-validate",
    ]);
    expect(report.warnings.length).toBeGreaterThan(0);
    expect(
      report.warnings[0].includes("does not auto-register")
    ).toBe(true);

    // Verify AGENTS.md exists with marker block
    const agentsPath = resolve(workspaceRoot, "AGENTS.md");
    const agentsContent = await readFile(agentsPath, "utf8");
    expect(agentsContent).toContain("<!-- katana:begin -->");
    expect(agentsContent).toContain("<!-- katana:end -->");
    expect(agentsContent).toContain("katana-decompose");
    expect(agentsContent).toContain("katana-work");

    // Verify manifest exists and is valid JSON
    const manifestPath = resolve(katanaRoot, "agents-manifest.json");
    const manifestContent = await readFile(manifestPath, "utf8");
    const manifest = JSON.parse(manifestContent);

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.platform).toBe("openai-codex");
    expect(manifest.mcp.command).toBe("npx katana-mcp");
    expect(manifest.mcp.args).toEqual(["--stdio"]);
    expect(manifest.mcp.transport).toBe("stdio");
    expect(manifest.commands.length).toBe(4);
    expect(manifest.commands[0].id).toBe("katana-decompose");
    expect(manifest.commands[0].handlerHint.mcpTool).toBe("decompose_document");
  });

  it("should be idempotent on re-run", async () => {
    const adapter = new OpenAiCodexAdapter();

    // First install
    const report1 = await adapter.install({
      workspaceRoot,
      katanaRoot,
      mcpCommand: "npx katana-mcp",
    });

    expect(report1.files.every((f) => f.action === "created")).toBe(true);

    // Second install (should skip)
    const report2 = await adapter.install({
      workspaceRoot,
      katanaRoot,
      mcpCommand: "npx katana-mcp",
    });

    expect(report2.files.every((f) => f.action === "skipped")).toBe(true);
  });

  it("should uninstall cleanly", async () => {
    const adapter = new OpenAiCodexAdapter();

    // Install first
    await adapter.install({
      workspaceRoot,
      katanaRoot,
      mcpCommand: "npx katana-mcp",
    });

    // Uninstall
    const report = await adapter.uninstall({
      workspaceRoot,
      katanaRoot,
    });

    expect(report.platform).toBe("openai-codex");
    expect(report.commands.length).toBe(0);

    // Verify AGENTS.md marker block was removed
    const agentsPath = resolve(workspaceRoot, "AGENTS.md");
    const agentsContent = await readFile(agentsPath, "utf8");
    expect(agentsContent).not.toContain("<!-- katana:begin -->");
    expect(agentsContent).not.toContain("<!-- katana:end -->");
  });

  it("registerRule should return no-op warning", async () => {
    const adapter = new OpenAiCodexAdapter();

    const files = await adapter.registerRule(
      {
        id: "test-rule",
        scope: "workspace",
        body: "Test rule",
      },
      {
        workspaceRoot,
        katanaRoot,
        mcpCommand: "npx katana-mcp",
      }
    );

    expect(files).toEqual([]);
  });

  it("registerCommand should update manifest", async () => {
    const adapter = new OpenAiCodexAdapter();

    await adapter.install({
      workspaceRoot,
      katanaRoot,
      mcpCommand: "npx katana-mcp",
    });

    // Register a new command
    const newCommand = {
      id: "katana-custom",
      description: "Custom command",
      handlerHint: { mcpTool: "custom_tool" },
    };

    const files = await adapter.registerCommand(newCommand, {
      workspaceRoot,
      katanaRoot,
      mcpCommand: "npx katana-mcp",
    });

    expect(files.length).toBe(1);
    expect(files[0].path).toBe("agents-manifest.json");

    // Verify manifest was updated
    const manifestPath = resolve(katanaRoot, "agents-manifest.json");
    const manifestContent = await readFile(manifestPath, "utf8");
    const manifest = JSON.parse(manifestContent);

    expect(manifest.commands.some((c: any) => c.id === "katana-custom")).toBe(
      true
    );
  });

  it("should handle force overwrite", async () => {
    const adapter = new OpenAiCodexAdapter();

    // First install
    await adapter.install({
      workspaceRoot,
      katanaRoot,
      mcpCommand: "npx katana-mcp",
      mcpArgs: ["--old-arg"],
    });

    // Force re-install with new args
    const report = await adapter.install({
      workspaceRoot,
      katanaRoot,
      mcpCommand: "npx katana-mcp",
      mcpArgs: ["--new-arg"],
      force: true,
    });

    expect(report.files.some((f) => f.action === "updated")).toBe(true);

    // Verify new args are in manifest
    const manifestPath = resolve(katanaRoot, "agents-manifest.json");
    const manifestContent = await readFile(manifestPath, "utf8");
    const manifest = JSON.parse(manifestContent);

    expect(manifest.mcp.args).toEqual(["--new-arg"]);
  });

  it("should handle dryRun mode", async () => {
    const adapter = new OpenAiCodexAdapter();

    const report = await adapter.install({
      workspaceRoot,
      katanaRoot,
      mcpCommand: "npx katana-mcp",
      dryRun: true,
    });

    expect(report.files.length).toBeGreaterThan(0);

    // Verify no files were actually written
    const agentsPath = resolve(workspaceRoot, "AGENTS.md");
    try {
      await readFile(agentsPath);
      expect.fail("AGENTS.md should not exist in dryRun mode");
    } catch {
      // Expected
    }
  });
});
