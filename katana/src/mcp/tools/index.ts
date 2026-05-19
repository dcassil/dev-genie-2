/**
 * Aggregated katana MCP tool registry. Server (src/mcp/server.ts) iterates this array
 * to register handlers with @modelcontextprotocol/sdk.
 */
import { createDocumentTool } from "./create_document.js";
import { readDocumentTool } from "./read_document.js";
import { editDocumentTool } from "./edit_document.js";
import { listDocumentsTool } from "./list_documents.js";
import { searchDocumentsTool } from "./search_documents.js";
import { transitionPhaseTool } from "./transition_phase.js";
import { validateDocumentTool } from "./validate_document.js";
import { decomposeDocumentTool } from "./decompose_document.js";

export interface KatanaTool {
  name: string;
  description: string;
  inputSchema: object;
  outputSchema: object;
  handler: (input: any, ctx: any) => Promise<unknown>;
}

export const ALL_TOOLS: KatanaTool[] = [
  createDocumentTool,
  readDocumentTool,
  editDocumentTool,
  listDocumentsTool,
  searchDocumentsTool,
  transitionPhaseTool,
  validateDocumentTool,
  decomposeDocumentTool,
];

if (ALL_TOOLS.length !== 8) throw new Error("MCP tool surface must be exactly 8 tools");
