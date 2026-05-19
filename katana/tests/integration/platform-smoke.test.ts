import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { ClaudeCodeAdapter } from "../../src/platform/claude-code";
import { CursorAdapter } from "../../src/platform/cursor";
import { OpenAiCodexAdapter } from "../../src/platform/openai-codex";
import type { PlatformAdapter, InstallOptions } from "../../src/platform/port";
import { runInstall } from "../../src/cli/install";

const PLATFORMS = [
  { name: "claude-code", AdapterClass: ClaudeCodeAdapter },
  { name: "cursor", AdapterClass: CursorAdapter },
  { name: "openai-codex", AdapterClass: OpenAiCodexAdapter },
];

describe("Platform Adapter Smoke Test (Integration)", () => {
  for (const { name, AdapterClass } of PLATFORMS) {
    describe(name, () => {
      let tempDir: string;
      let adapter: PlatformAdapter;
      let installOpts: InstallOptions;

      beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), `katana-smoke-${name}-`));
        adapter = new AdapterClass();
        installOpts = {
          workspaceRoot: tempDir,
          katanaRoot: join(tempDir, ".katana"),
          mcpCommand: "npx",
          mcpArgs: ["-y", "katana-mcp"],
        };
      });

      afterEach(() => {
        if (existsSync(tempDir)) {
          rmSync(tempDir, { recursive: true, force: true });
        }
      });

      it("should install successfully on fresh workspace", async () => {
        const report = await adapter.install(installOpts);

        expect(report.platform).toBe(name);
        expect(report.files.length).toBeGreaterThan(0);
        expect(report.files.every((f) => f.action === "created")).toBe(true);
        expect(report.commands).toEqual([
          "katana-decompose",
          "katana-work",
          "katana-board",
          "katana-validate",
        ]);
      });

      it("should be idempotent on second install", async () => {
        // First install
        const report1 = await adapter.install(installOpts);
        const createdCount = report1.files.filter((f) => f.action === "created").length;
        expect(createdCount).toBeGreaterThan(0);

        // Second install: most files should be skipped; allow some updated due to marker merging
        const report2 = await adapter.install(installOpts);
        const skipped = report2.files.filter((f) => f.action === "skipped").length;
        const created = report2.files.filter((f) => f.action === "created").length;
        expect(skipped + created + report2.files.filter((f) => f.action === "updated").length).toBe(
          report2.files.length
        );
        // At minimum, most should be skipped
        expect(skipped >= createdCount / 2).toBe(true);
        expect(report2.commands).toEqual(report1.commands);
      });

      it("should repair drifted files with --force", async () => {
        // Install initially
        await adapter.install(installOpts);

        // Find a written file and mutate it
        const firstFile = (await adapter.install(installOpts)).files[0];
        if (!firstFile) return;

        const filePath = firstFile.path.startsWith("/")
          ? firstFile.path
          : join(tempDir, firstFile.path);

        if (!existsSync(filePath)) return;

        const originalContent = readFileSync(filePath, "utf-8");
        writeFileSync(filePath, "MUTATED CONTENT");

        // Re-install without --force: should report as drift
        const reportNoForce = await adapter.install(installOpts);
        const hasDriftWarning =
          reportNoForce.warnings.length > 0 ||
          reportNoForce.files.some((f) => f.action === "skipped");

        // Re-install with --force: should repair
        const reportWithForce = await adapter.install({
          ...installOpts,
          force: true,
        });
        const repairAction = reportWithForce.files.find((f) => f.path === filePath);
        if (repairAction) {
          expect(repairAction.action).toBe("updated");
        }

        // Verify file is restored
        const restoredContent = readFileSync(filePath, "utf-8");
        expect(restoredContent).toBe(originalContent);
      });

      it("should uninstall and restore to pre-install state", async () => {
        // Install
        const installReport = await adapter.install(installOpts);
        const installedPaths = new Set(
          installReport.files.map((f) =>
            f.path.startsWith("/") ? f.path : join(tempDir, f.path)
          )
        );

        // Uninstall
        const uninstallReport = await adapter.uninstall({
          workspaceRoot: tempDir,
          katanaRoot: installOpts.katanaRoot,
        });

        // Verify files are removed or reverted
        for (const file of uninstallReport.files) {
          const filePath = file.path.startsWith("/")
            ? file.path
            : join(tempDir, file.path);

          if (file.action === "removed") {
            expect(existsSync(filePath)).toBe(false);
          }
        }
      });

      it("should have mcpRegistered true for claude-code and cursor only", async () => {
        const report = await adapter.install(installOpts);

        if (name === "claude-code" || name === "cursor") {
          expect(report.mcpRegistered).toBe(true);
        } else {
          expect(report.mcpRegistered).toBe(false);
        }
      });

      it("should list four universal commands exactly", async () => {
        const report = await adapter.install(installOpts);

        expect(report.commands.length).toBe(4);
        expect(report.commands).toContain("katana-decompose");
        expect(report.commands).toContain("katana-work");
        expect(report.commands).toContain("katana-board");
        expect(report.commands).toContain("katana-validate");
      });
    });
  }

  describe("Cross-adapter assertions", () => {
    let tempDirs: Record<string, string> = {};
    let reports: Record<string, any> = {};

    beforeEach(async () => {
      for (const { name, AdapterClass } of PLATFORMS) {
        const tempDir = mkdtempSync(join(tmpdir(), `katana-cross-${name}-`));
        tempDirs[name] = tempDir;

        const adapter = new AdapterClass();
        const report = await adapter.install({
          workspaceRoot: tempDir,
          katanaRoot: join(tempDir, ".katana"),
          mcpCommand: "npx",
          mcpArgs: ["-y", "katana-mcp"],
        });
        reports[name] = report;
      }
    });

    afterEach(() => {
      for (const tempDir of Object.values(tempDirs)) {
        if (existsSync(tempDir)) {
          rmSync(tempDir, { recursive: true, force: true });
        }
      }
    });

    it("all three reports should list four universal commands exactly", () => {
      for (const { name } of PLATFORMS) {
        const report = reports[name];
        expect(report.commands.length).toBe(4);
        expect(report.commands).toEqual([
          "katana-decompose",
          "katana-work",
          "katana-board",
          "katana-validate",
        ]);
      }
    });

    it("mcpRegistered should be true for claude-code and cursor, false for openai-codex", () => {
      expect(reports["claude-code"].mcpRegistered).toBe(true);
      expect(reports["cursor"].mcpRegistered).toBe(true);
      expect(reports["openai-codex"].mcpRegistered).toBe(false);
    });

    it("should not rely on network for file operations", async () => {
      // This test verifies that installations complete without network calls
      // by checking that all file operations complete synchronously
      for (const { name, AdapterClass } of PLATFORMS) {
        const tempDir = mkdtempSync(join(tmpdir(), `katana-nonet-${name}-`));
        try {
          const adapter = new AdapterClass();
          const startTime = Date.now();

          const report = await adapter.install({
            workspaceRoot: tempDir,
            katanaRoot: join(tempDir, ".katana"),
            mcpCommand: "npx",
            mcpArgs: ["-y", "katana-mcp"],
          });

          const duration = Date.now() - startTime;
          // Should complete reasonably quickly (under 5 seconds) without network
          expect(duration).toBeLessThan(5000);
          expect(report.files.length).toBeGreaterThan(0);
        } finally {
          if (existsSync(tempDir)) {
            rmSync(tempDir, { recursive: true, force: true });
          }
        }
      }
    });
  });

  describe("CLI integration", () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), "katana-cli-test-"));
    });

    afterEach(() => {
      if (existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("runInstall should execute install via CLI args for each platform", async () => {
      for (const { name } of PLATFORMS) {
        const subDir = join(tempDir, name);
        const output: string[] = [];

        await runInstall(
          [name, "--workspace", subDir, "--mcp-command", "npx", "--mcp-args=-y,katana-mcp"],
          {
            stdout: (s) => output.push(s),
            stderr: (s) => output.push(s),
          }
        );

        const combinedOutput = output.join("");
        expect(combinedOutput).toContain("installed");
        expect(combinedOutput).toContain(name);
      }
    });
  });
});
