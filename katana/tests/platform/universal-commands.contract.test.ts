/**
 * Contract test: every PlatformAdapter's install() must expose
 * the four universal commands with identical ids and mcpTool values.
 */

import { describe, it, expect } from "vitest";
import { UNIVERSAL_COMMANDS } from "../../src/platform/_shared/universal-commands";
import type { PlatformId, InstallOptions, InstallReport } from "../../src/platform/port";

/**
 * Mock adapters for testing. In the real implementation, these would be
 * the actual adapter implementations from each platform.
 */
const ADAPTERS = {
  "claude-code": {
    id: "claude-code" as PlatformId,
    install: async (opts: InstallOptions): Promise<InstallReport> => ({
      platform: "claude-code",
      files: [],
      mcpRegistered: true,
      commands: UNIVERSAL_COMMANDS.map((c) => c.id),
      warnings: [],
    }),
  },
  cursor: {
    id: "cursor" as PlatformId,
    install: async (opts: InstallOptions): Promise<InstallReport> => ({
      platform: "cursor",
      files: [],
      mcpRegistered: true,
      commands: UNIVERSAL_COMMANDS.map((c) => c.id),
      warnings: [],
    }),
  },
  "openai-codex": {
    id: "openai-codex" as PlatformId,
    install: async (opts: InstallOptions): Promise<InstallReport> => ({
      platform: "openai-codex",
      files: [],
      mcpRegistered: true,
      commands: UNIVERSAL_COMMANDS.map((c) => c.id),
      warnings: [],
    }),
  },
};

describe("Universal Commands Contract", () => {
  it("UNIVERSAL_COMMANDS exports exactly four commands", () => {
    expect(UNIVERSAL_COMMANDS).toHaveLength(4);
  });

  it("UNIVERSAL_COMMANDS have correct ids", () => {
    const ids = UNIVERSAL_COMMANDS.map((c) => c.id);
    expect(ids).toEqual(["katana-decompose", "katana-work", "katana-board", "katana-validate"]);
  });

  it("katana-decompose maps to decompose_document", () => {
    const cmd = UNIVERSAL_COMMANDS.find((c) => c.id === "katana-decompose");
    expect(cmd?.handlerHint.mcpTool).toBe("decompose_document");
  });

  it("katana-work maps to list_documents", () => {
    const cmd = UNIVERSAL_COMMANDS.find((c) => c.id === "katana-work");
    expect(cmd?.handlerHint.mcpTool).toBe("list_documents");
  });

  it("katana-board maps to list_documents", () => {
    const cmd = UNIVERSAL_COMMANDS.find((c) => c.id === "katana-board");
    expect(cmd?.handlerHint.mcpTool).toBe("list_documents");
  });

  it("katana-validate maps to validate_document", () => {
    const cmd = UNIVERSAL_COMMANDS.find((c) => c.id === "katana-validate");
    expect(cmd?.handlerHint.mcpTool).toBe("validate_document");
  });

  describe("Adapter Contract", () => {
    const mockOpts: InstallOptions = {
      workspaceRoot: "/test",
      katanaRoot: "/test/.katana",
      mcpCommand: "npx katana-mcp",
    };

    it("claude-code adapter exposes all universal commands", async () => {
      const report = await ADAPTERS["claude-code"].install(mockOpts);
      const expectedIds = UNIVERSAL_COMMANDS.map((c) => c.id);
      expect(report.commands).toEqual(expectedIds);
    });

    it("cursor adapter exposes all universal commands", async () => {
      const report = await ADAPTERS.cursor.install(mockOpts);
      const expectedIds = UNIVERSAL_COMMANDS.map((c) => c.id);
      expect(report.commands).toEqual(expectedIds);
    });

    it("openai-codex adapter exposes all universal commands", async () => {
      const report = await ADAPTERS["openai-codex"].install(mockOpts);
      const expectedIds = UNIVERSAL_COMMANDS.map((c) => c.id);
      expect(report.commands).toEqual(expectedIds);
    });
  });
});
