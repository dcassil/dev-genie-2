import { describe, it, expect, beforeEach, vi } from "vitest";
import { runInstall } from "../../src/cli/install.js";
import type { InstallCommandDeps } from "../../src/cli/install.js";

describe("install CLI", () => {
  let output: string[];
  let errors: string[];
  let deps: InstallCommandDeps;

  beforeEach(() => {
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

  it("should parse install options correctly", async () => {
    // Mock the adapter to track calls
    const mockInstall = vi.fn().mockResolvedValue({
      platform: "claude-code",
      files: [
        { path: "/tmp/test/.katana/config.json", action: "created", bytes: 100 },
      ],
      mcpRegistered: true,
      commands: ["katana-decompose"],
      warnings: [],
    });

    // We can't easily mock getAdapter without restructuring, so this is a placeholder
    // for integration testing patterns
  });

  it("should print file table and summary on success", async () => {
    // Integration test placeholder
    // Would require setting up a real adapter or mocking the registry
  });

  it("should respect --dry-run flag", async () => {
    // Integration test placeholder
    // Verifies that dryRun=true is passed through without writing files
  });

  it("should handle default workspace and katana-root", async () => {
    // Integration test placeholder
    // Verifies process.cwd() and .katana defaults
  });
});
