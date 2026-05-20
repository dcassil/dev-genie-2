/**
 * katana MCP server entry. stdio transport (per ADR KAT-A-0001).
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { openSqliteStorage } from "../storage/sqlite/index.js";
import type { StoragePort } from "../storage/port.js";
import { ALL_TOOLS } from "./tools/index.js";
import { DocumentNotFound } from "../storage/port.js";

export interface ServerOptions { workspaceRoot: string; }

export async function startServer(opts: ServerOptions): Promise<void> {
  const storage: StoragePort = openSqliteStorage({ workspaceRoot: opts.workspaceRoot });
  const server = new Server(
    { name: "katana", version: "0.1.6" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ALL_TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = ALL_TOOLS.find((t) => t.name === req.params.name);
    if (!tool) throw new Error(`Unknown tool: ${req.params.name}`);
    try {
      const result = await tool.handler(req.params.arguments ?? {}, { storage });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err: any) {
      const isNotFound = err instanceof DocumentNotFound;
      return {
        isError: true,
        content: [{ type: "text", text: `${isNotFound ? "DocumentNotFound" : "Error"}: ${err.message}` }],
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => { storage.close(); process.exit(0); });
  }
}
