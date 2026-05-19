export class MalformedMcpJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MalformedMcpJsonError";
  }
}

/**
 * Merge or insert an MCP server entry into JSON, preserving key order.
 * Throws MalformedMcpJsonError on parse failure.
 */
export function mergeMcpServers(
  existingJson: string | null,
  name: string,
  entry: object
): string {
  let config: Record<string, any>;

  if (existingJson === null) {
    config = { mcpServers: {} };
  } else {
    try {
      config = JSON.parse(existingJson);
    } catch (err) {
      throw new MalformedMcpJsonError(
        `Failed to parse JSON: ${err instanceof Error ? err.message : "unknown error"}`
      );
    }
  }

  if (!config.mcpServers || typeof config.mcpServers !== "object") {
    config.mcpServers = {};
  }

  config.mcpServers[name] = entry;

  return JSON.stringify(config, null, 2) + "\n";
}

/**
 * Remove an MCP server entry from JSON.
 * Returns stringified JSON, or null if the file should be deleted (empty mcpServers).
 */
export function removeMcpServer(existingJson: string, name: string): string | null {
  let config: Record<string, any>;

  try {
    config = JSON.parse(existingJson);
  } catch (err) {
    throw new MalformedMcpJsonError(
      `Failed to parse JSON: ${err instanceof Error ? err.message : "unknown error"}`
    );
  }

  if (config.mcpServers && typeof config.mcpServers === "object") {
    delete config.mcpServers[name];

    if (Object.keys(config.mcpServers).length === 0) {
      // Only signal "delete the file" when nothing else lives at the top
      // level. Otherwise drop the empty mcpServers key but keep the rest.
      delete config.mcpServers;
      if (Object.keys(config).length === 0) {
        return null;
      }
    }
  }

  return JSON.stringify(config, null, 2) + "\n";
}
