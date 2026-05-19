import { CommandSpec } from "../port";

/**
 * Universal commands required by every PlatformAdapter.
 * These four commands are exposed identically across all platforms (Claude Code, Cursor, OpenAI Codex)
 * and map 1:1 to MCP tools declared in KAT-A-0001.
 */
export const UNIVERSAL_COMMANDS: CommandSpec[] = [
  {
    id: "katana-decompose",
    description: "Decompose a parent doc into children",
    argsSchema: {
      type: "object",
      required: ["parent"],
      properties: {
        parent: { type: "string" },
      },
    },
    handlerHint: { mcpTool: "decompose_document" },
  },
  {
    id: "katana-work",
    description: "Start working a task",
    argsSchema: {
      type: "object",
      required: ["task"],
      properties: {
        task: { type: "string" },
      },
    },
    handlerHint: { mcpTool: "list_documents" },
  },
  {
    id: "katana-board",
    description: "Show the kanban board",
    argsSchema: {
      type: "object",
      properties: {
        level: { type: "string" },
        phase: { type: "string" },
      },
    },
    handlerHint: { mcpTool: "list_documents" },
  },
  {
    id: "katana-validate",
    description: "Validate a document",
    argsSchema: {
      type: "object",
      required: ["short_code"],
      properties: {
        short_code: { type: "string" },
      },
    },
    handlerHint: { mcpTool: "validate_document" },
  },
];
