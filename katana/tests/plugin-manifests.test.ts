import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
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
    expect(manifest.skills).toBe("./skills/");
    expect(manifest.mcpServers).toBe("./.mcp.json");
    expect(manifest.interface.displayName).toBe("Katana");
    for (const skill of [
      "katana-board",
      "katana-decompose",
      "katana-validate",
      "katana-work",
    ]) {
      expect(existsSync(resolve(root, "skills", skill, "SKILL.md"))).toBe(true);
    }
    expect(mcp.mcpServers.katana).toEqual({
      command: "/bin/sh",
      args: [
        "-lc",
        'root="${CODEX_PLUGIN_ROOT:-$(ls -dt "$HOME"/.codex/plugins/cache/dev-genie/katana/* 2>/dev/null | head -n 1)}"; exec node "$root/bin/katana-mcp.js"',
      ],
      transport: "stdio",
    });
  });

  it("keeps package and plugin manifest versions aligned", () => {
    const pkg = readJson("package.json");
    const lock = readJson("package-lock.json");
    const codex = readJson(".codex-plugin/plugin.json");
    const claude = readJson(".claude-plugin/plugin.json");

    expect(codex.version).toBe(pkg.version);
    expect(claude.version).toBe(pkg.version);
    expect(lock.version).toBe(pkg.version);
    expect(lock.packages[""].version).toBe(pkg.version);
    expect(lock.packages[""].dependencies["better-sqlite3"]).toBe(
      pkg.dependencies["better-sqlite3"],
    );
  });
});
