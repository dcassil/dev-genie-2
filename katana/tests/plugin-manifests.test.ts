import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");

function readJson(path: string): any {
  return JSON.parse(readFileSync(resolve(root, path), "utf8"));
}

describe("plugin manifests", () => {
  it("ships a Codex plugin manifest with MCP wiring", () => {
    const manifest = readJson(".codex-plugin/plugin.json");
    const mcp = readJson(".mcp.json");

    expect(manifest.name).toBe("katana");
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.mcpServers).toBe("./.mcp.json");
    expect(manifest.interface.displayName).toBe("Katana");
    expect(mcp.mcpServers.katana).toEqual({
      command: "node",
      args: ["${CODEX_PLUGIN_ROOT}/bin/katana-mcp.js"],
      transport: "stdio",
    });
  });

  it("keeps package and plugin manifest versions aligned", () => {
    const pkg = readJson("package.json");
    const codex = readJson(".codex-plugin/plugin.json");
    const claude = readJson(".claude-plugin/plugin.json");

    expect(codex.version).toBe(pkg.version);
    expect(claude.version).toBe(pkg.version);
  });
});
