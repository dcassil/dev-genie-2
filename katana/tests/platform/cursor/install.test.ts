/**
 * Tests for CursorAdapter install, uninstall, and register workflows.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import CursorAdapter from "../../../src/platform/cursor/index";
import { InstallOptions } from "../../../src/platform/port";
import { UNIVERSAL_COMMANDS } from "../../../src/platform/_shared/universal-commands";

describe("CursorAdapter", () => {
  let tempDir: string;
  let adapter: CursorAdapter;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "katana-cursor-test-"));
    adapter = new CursorAdapter();
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  describe("install", () => {
    it("creates .cursor/rules/katana.mdc with universal commands", async () => {
      const opts: InstallOptions = {
        workspaceRoot: tempDir,
        katanaRoot: join(tempDir, ".katana"),
        mcpCommand: "npx katana-mcp",
      };

      const report = await adapter.install(opts);

      expect(report.platform).toBe("cursor");
      expect(report.mcpRegistered).toBe(true);
      expect(report.commands).toEqual(UNIVERSAL_COMMANDS.map((c) => c.id));
      expect(report.warnings).toEqual([]);

      const katanaMdcPath = join(tempDir, ".cursor", "rules", "katana.mdc");
      expect(existsSync(katanaMdcPath)).toBe(true);

      const content = readFileSync(katanaMdcPath, "utf8");
      expect(content).toContain('alwaysApply: true');
      expect(content).toContain("katana-decompose");
      expect(content).toContain("katana-work");
      expect(content).toContain("katana-board");
      expect(content).toContain("katana-validate");
    });

    it("creates .cursor/mcp.json with katana server", async () => {
      const opts: InstallOptions = {
        workspaceRoot: tempDir,
        katanaRoot: join(tempDir, ".katana"),
        mcpCommand: "npx katana-mcp",
        mcpArgs: ["--debug"],
      };

      const report = await adapter.install(opts);

      const mcpJsonPath = join(tempDir, ".cursor", "mcp.json");
      expect(existsSync(mcpJsonPath)).toBe(true);

      const content = JSON.parse(readFileSync(mcpJsonPath, "utf8"));
      expect(content.mcpServers.katana).toBeDefined();
      expect(content.mcpServers.katana.command).toBe("npx katana-mcp");
      expect(content.mcpServers.katana.args).toEqual(["--debug"]);
      expect(content.mcpServers.katana.transport).toBe("stdio");
    });

    it("is idempotent: re-run skips unchanged files", async () => {
      const opts: InstallOptions = {
        workspaceRoot: tempDir,
        katanaRoot: join(tempDir, ".katana"),
        mcpCommand: "npx katana-mcp",
      };

      const report1 = await adapter.install(opts);
      expect(report1.files.every((f) => f.action === "created")).toBe(true);

      const report2 = await adapter.install(opts);
      expect(report2.files.every((f) => f.action === "skipped")).toBe(true);
    });

    it("preserves existing foreign mcpServers in mcp.json", async () => {
      const mcpJsonPath = join(tempDir, ".cursor", "mcp.json");
      const existing = {
        mcpServers: {
          other: { command: "other-command", transport: "stdio" },
        },
      };
      const cursorDir = join(tempDir, ".cursor");
      mkdirSync(cursorDir, { recursive: true });
      writeFileSync(mcpJsonPath, JSON.stringify(existing, null, 2));

      const opts: InstallOptions = {
        workspaceRoot: tempDir,
        katanaRoot: join(tempDir, ".katana"),
        mcpCommand: "npx katana-mcp",
      };

      await adapter.install(opts);

      const content = JSON.parse(readFileSync(mcpJsonPath, "utf8"));
      expect(content.mcpServers.other).toBeDefined();
      expect(content.mcpServers.katana).toBeDefined();
    });

    it("returns files with correct paths and metadata", async () => {
      const opts: InstallOptions = {
        workspaceRoot: tempDir,
        katanaRoot: join(tempDir, ".katana"),
        mcpCommand: "npx katana-mcp",
      };

      const report = await adapter.install(opts);

      expect(report.files.length).toBeGreaterThanOrEqual(2);

      const katanaMdcFile = report.files.find((f) => f.path.includes("katana.mdc"));
      expect(katanaMdcFile).toBeDefined();
      expect(katanaMdcFile?.action).toBe("created");
      expect(katanaMdcFile?.bytes).toBeGreaterThan(0);

      const mcpJsonFile = report.files.find((f) => f.path.includes("mcp.json"));
      expect(mcpJsonFile).toBeDefined();
      expect(mcpJsonFile?.action).toBe("created");
      expect(mcpJsonFile?.bytes).toBeGreaterThan(0);
    });
  });

  describe("uninstall", () => {
    it("removes katana server from mcp.json while preserving others", async () => {
      const opts: InstallOptions = {
        workspaceRoot: tempDir,
        katanaRoot: join(tempDir, ".katana"),
        mcpCommand: "npx katana-mcp",
      };

      // First install
      await adapter.install(opts);

      // Add another server
      const mcpJsonPath = join(tempDir, ".cursor", "mcp.json");
      const content = JSON.parse(readFileSync(mcpJsonPath, "utf8"));
      content.mcpServers.other = { command: "other", transport: "stdio" };
      writeFileSync(mcpJsonPath, JSON.stringify(content, null, 2));

      // Uninstall
      const report = await adapter.uninstall({
        workspaceRoot: tempDir,
        katanaRoot: join(tempDir, ".katana"),
      });

      expect(report.mcpRegistered).toBe(false);

      const remaining = JSON.parse(readFileSync(mcpJsonPath, "utf8"));
      expect(remaining.mcpServers.katana).toBeUndefined();
      expect(remaining.mcpServers.other).toBeDefined();
    });
  });

  describe("registerRule", () => {
    it("creates directory-scoped rule files", async () => {
      const opts: InstallOptions = {
        workspaceRoot: tempDir,
        katanaRoot: join(tempDir, ".katana"),
        mcpCommand: "npx katana-mcp",
      };

      const ruleSpec = {
        id: "test-rule",
        scope: "directory" as const,
        body: "Test rule content",
        globs: ["src/**", "!src/generated/**"],
      };

      const files = await adapter.registerRule(ruleSpec, opts);

      expect(files.length).toBe(1);
      expect(files[0].path).toContain("test-rule.mdc");
      expect(files[0].action).toBe("created");

      const rulePath = join(tempDir, ".cursor", "rules", "test-rule.mdc");
      const content = readFileSync(rulePath, "utf8");
      expect(content).toContain('scope: "directory"');
      expect(content).toContain("src/**");
      expect(content).toContain("Test rule content");
    });
  });

  describe("generateAgentDoc", () => {
    it("injects marker block into agent doc", async () => {
      const opts: InstallOptions = {
        workspaceRoot: tempDir,
        katanaRoot: join(tempDir, ".katana"),
        mcpCommand: "npx katana-mcp",
      };

      const spec = {
        filename: "AGENTS.md",
        block: "# Katana Commands\n\nDescription here",
        markerStart: "<!-- katana:begin -->",
        markerEnd: "<!-- katana:end -->",
      };

      const result = await adapter.generateAgentDoc(spec, opts);

      expect(result.action).toBe("created");
      expect(result.path).toContain("AGENTS.md");

      const filePath = join(tempDir, "AGENTS.md");
      const content = readFileSync(filePath, "utf8");
      expect(content).toContain("<!-- katana:begin -->");
      expect(content).toContain("Katana Commands");
      expect(content).toContain("<!-- katana:end -->");
    });
  });
});
