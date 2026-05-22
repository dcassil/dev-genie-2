/**
 * Daimyo MCP server entry. This task only scaffolds the package and core
 * contracts, so registry/tool wiring is intentionally deferred to DGOS-T-0012.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

export async function startServer(): Promise<void> {
  const server = new Server(
    { name: "daimyo", version: "0.5.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => ({
    isError: true,
    content: [
      {
        type: "text",
        text: `Unknown Daimyo tool: ${request.params.name}`,
      },
    ],
  }));

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
