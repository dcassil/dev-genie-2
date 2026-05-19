/**
 * Compile-only type assertions for PlatformAdapter contract.
 * Uses expectType<> to lock the shape at the type level.
 */

import { describe, it } from "vitest";

// vitest doesn't export `expectType`; these are compile-time-only assertions.
// At runtime this helper is a no-op — the constraint is enforced by the
// generic parameter when TypeScript checks the file.
function expectType<T>(_value: T): void {}

import type {
  PlatformId,
  InstallOptions,
  WrittenFile,
  InstallReport,
  CommandSpec,
  RuleSpec,
  AgentDocSpec,
  PlatformAdapter,
} from "../../src/platform/port";

describe("PlatformAdapter types", () => {
  it("PlatformId is a string literal union", () => {
    const id: PlatformId = "claude-code";
    expectType<"claude-code" | "cursor" | "openai-codex">(id);
  });

  it("InstallOptions shape is correct", () => {
    const opts: InstallOptions = {
      workspaceRoot: "/home/user/project",
      katanaRoot: "/home/user/project/.katana",
      mcpCommand: "npx katana-mcp",
      mcpArgs: ["--debug"],
      dryRun: false,
      force: true,
    };
    expectType<InstallOptions>(opts);
  });

  it("WrittenFile records file operations", () => {
    const file: WrittenFile = {
      path: "/home/user/project/CLAUDE.md",
      action: "updated",
      bytes: 1024,
    };
    expectType<WrittenFile>(file);
  });

  it("InstallReport summarizes installation", () => {
    const report: InstallReport = {
      platform: "claude-code",
      files: [
        { path: "/.katana/config.json", action: "created", bytes: 256 },
        { path: "/CLAUDE.md", action: "updated", bytes: 2048 },
      ],
      mcpRegistered: true,
      commands: ["katana-decompose", "katana-work", "katana-board", "katana-validate"],
      warnings: [],
    };
    expectType<InstallReport>(report);
  });

  it("CommandSpec defines a universal or platform-specific command", () => {
    const cmd: CommandSpec = {
      id: "katana-decompose",
      description: "Decompose a parent document into children",
      argsSchema: {
        type: "object",
        required: ["parent"],
        properties: {
          parent: { type: "string" },
        },
      },
      handlerHint: { mcpTool: "decompose_document" },
    };
    expectType<CommandSpec>(cmd);
  });

  it("CommandSpec handles commands without direct MCP mapping", () => {
    const cmd: CommandSpec = {
      id: "katana-work",
      description: "Start the work loop on a task",
      handlerHint: { mcpTool: "" },
    };
    expectType<CommandSpec>(cmd);
  });

  it("RuleSpec defines workspace or directory rules", () => {
    const rule: RuleSpec = {
      id: "katana-core",
      scope: "workspace",
      body: "## Katana Core Rules\n\nEvery task must have a parent initiative.",
    };
    expectType<RuleSpec>(rule);
  });

  it("RuleSpec with directory scope and globs", () => {
    const rule: RuleSpec = {
      id: "src-rules",
      scope: "directory",
      body: "TypeScript and linting rules for src/",
      globs: ["src/**", "!src/generated/**"],
    };
    expectType<RuleSpec>(rule);
  });

  it("AgentDocSpec injects into shared files with markers", () => {
    const doc: AgentDocSpec = {
      filename: "CLAUDE.md",
      block: "## Katana Commands\n\nUse `/katana-decompose` to decompose a task.",
      markerStart: "<!-- katana:begin -->",
      markerEnd: "<!-- katana:end -->",
    };
    expectType<AgentDocSpec>(doc);
  });

  it("PlatformAdapter defines the contract", () => {
    const adapter: PlatformAdapter = {
      id: "claude-code",
      install: async (opts) => ({
        platform: opts.mcpCommand ? "claude-code" : "cursor",
        files: [],
        mcpRegistered: true,
        commands: [],
        warnings: [],
      }),
      uninstall: async () => ({
        platform: "claude-code",
        files: [],
        mcpRegistered: false,
        commands: [],
        warnings: [],
      }),
      registerCommand: async () => [],
      registerRule: async () => [],
      generateAgentDoc: async () => ({ path: "", action: "created", bytes: 0 }),
    };
    expectType<PlatformAdapter>(adapter);
  });

  it("Universal commands map to MCP tools correctly", () => {
    const cmds: CommandSpec[] = [
      {
        id: "katana-decompose",
        description: "Decompose parent into children",
        handlerHint: { mcpTool: "decompose_document" },
      },
      {
        id: "katana-board",
        description: "Display kanban board",
        handlerHint: { mcpTool: "list_documents" },
      },
      {
        id: "katana-validate",
        description: "Validate a document",
        handlerHint: { mcpTool: "validate_document" },
      },
      {
        id: "katana-work",
        description: "Start work loop on a task",
        handlerHint: { mcpTool: "" },
      },
    ];
    expectType<CommandSpec[]>(cmds);
  });
});
