import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import {
  detect,
  type DetectedPluginPresence,
  type FsReadPort,
} from "../src/index.js";

describe("installer detector", () => {
  it("is deterministic for identical read-port responses", async () => {
    const port = new MemoryFsReadPort({
      "/repo/package.json": JSON.stringify({ scripts: { lint: "eslint ." } }, null, 2),
      "/repo/CLAUDE.md": [
        "# Rules",
        "",
        "- Do not modify `eslint.config.mjs`.",
      ].join("\n"),
    });

    const first = await detect(port, { workspaceRoot: "/repo" });
    const second = await detect(port, { workspaceRoot: "/repo" });

    expect(first).toEqual(second);
  });

  it("classifies a greenfield repo and emits the dev-genie detection report shape", async () => {
    const state = await detect(new MemoryFsReadPort({}), { workspaceRoot: "/repo" });

    expect(state.repo_classification).toBe("greenfield");
    expect(state.detection_report).toMatchObject({
      repoPath: "/repo",
      hasPackageJson: false,
      eslint: { found: false, files: [], notes: "no eslint config found" },
      typescript: { found: false, files: [], notes: "no tsconfig found" },
      hooks: { found: false, files: [], nativePreCommit: false },
      packageScripts: {},
      agentConfigs: [],
    });
    expect(state.plugins).toHaveLength(5);
    expect(state.plugins.every((plugin) => plugin.present === false)).toBe(true);
    expect(state.last_run).toBeNull();
  });

  it("detects existing-repo fields, plugins, regions, locks, and last-run fingerprint", async () => {
    const claudeMd = [
      "# Project rules",
      "",
      "- Do not modify `eslint.config.mjs`.",
      "<!-- dev-genie:guardrails:begin -->",
      "guardrails body",
      "<!-- dev-genie:guardrails:end -->",
      "<!-- katana:begin -->",
      "katana body",
      "<!-- katana:end -->",
      "",
    ].join("\n");
    const port = new MemoryFsReadPort({
      "/repo/package.json": JSON.stringify({
        scripts: {
          lint: "eslint .",
          build: "pnpm lint && tsc --noEmit",
        },
      }),
      "/repo/eslint.config.mjs": "export default [];\n",
      "/repo/eslint.config.guardrails.mjs": "export default [];\n",
      "/repo/tsconfig.json": "{}\n",
      "/repo/.git/hooks/pre-commit": "node audit/scripts/audit.mjs\n",
      "/repo/.audit/audit.config.json": "{}\n",
      "/repo/.audit/audit.results.json": "{}\n",
      "/repo/.katana/config.toml": "workspace = true\n",
      "/repo/.katana/vision.md": "# Vision\n",
      "/repo/.mcp.json": JSON.stringify({
        mcpServers: {
          katana: { command: "node" },
          daimyo: { command: "node" },
        },
      }),
      "/repo/.claude/settings.json": JSON.stringify({
        hooks: {
          PostToolUse: [
            {
              matcher: "Edit|Write|MultiEdit",
              hooks: [{ type: "command", command: "guardrails/scripts/lint-edited-file.sh" }],
            },
          ],
        },
      }),
      "/repo/.dev-genie/init.last-run.json": JSON.stringify({
        schemaVersion: 1,
        timestamp: "2026-05-25T00:00:00.000Z",
        repoFingerprint: "abc123",
      }),
      "/repo/CLAUDE.md": claudeMd,
    });

    const state = await detect(port, { workspaceRoot: "/repo" });

    expect(state.repo_classification).toBe("existing");
    expect(state.detection_report.packageScripts).toEqual({
      build: "pnpm lint && tsc --noEmit",
      lint: "eslint .",
    });
    expect(state.detection_report.agentConfigs).toEqual([
      {
        path: "CLAUDE.md",
        rawContent: claudeMd,
        rules: ["Do not modify `eslint.config.mjs`."],
        locks: [
          {
            pattern: "eslint.config.mjs",
            reason: "- Do not modify `eslint.config.mjs`.",
            sourceLine: 3,
          },
        ],
      },
    ]);
    expect(state.locks).toEqual([
      {
        pattern: "eslint.config.mjs",
        reason: "- Do not modify `eslint.config.mjs`.",
        sourceLine: 3,
        agentConfigPath: "CLAUDE.md",
      },
    ]);
    expect(state.last_run).toMatchObject({
      path: ".dev-genie/init.last-run.json",
      schemaVersion: 1,
      timestamp: "2026-05-25T00:00:00.000Z",
      repoFingerprint: "abc123",
    });
    expect(plugin(state.plugins, "dev-genie")?.present).toBe(true);
    expect(plugin(state.plugins, "guardrails")?.signals).toContainEqual({
      kind: "managed_config",
      path: ".claude/settings.json",
      detail: "guardrails/scripts/lint-edited-file.sh",
    });
    expect(plugin(state.plugins, "audit")?.present).toBe(true);
    expect(plugin(state.plugins, "katana")?.signals).toContainEqual({
      kind: "mcp_config",
      path: ".mcp.json",
      detail: "katana",
    });
    expect(plugin(state.plugins, "daimyo")?.signals).toContainEqual({
      kind: "mcp_config",
      path: ".mcp.json",
      detail: "daimyo",
    });
    expect(state.managed_regions).toContainEqual(expect.objectContaining({
      target: "dev-genie:guardrails",
      target_path: "CLAUDE.md",
      managed_marker: "<!-- dev-genie:guardrails:begin -->",
      marker_kind: "dev-genie",
      feature: "guardrails",
      present: true,
      region: expect.objectContaining({ content: "guardrails body" }),
    }));
    expect(state.managed_regions).toContainEqual(expect.objectContaining({
      target: "katana:agent-doc",
      target_path: "CLAUDE.md",
      managed_marker: "<!-- katana:begin -->",
      marker_kind: "katana",
      present: true,
      region: expect.objectContaining({ content: "katana body" }),
    }));
  });

  it("keeps detector implementation free of write-capable imports", async () => {
    const source = await readFile(new URL("../src/installer/detector.ts", import.meta.url), "utf8");

    expect(source).not.toMatch(/node:fs|fs\/promises|writeFile|appendFile|mkdir|rmSync|unlink|ManagedWriter|NodeFsReadPort/);
  });
});

function plugin(plugins: readonly DetectedPluginPresence[], pluginId: string) {
  return plugins.find((candidate) => candidate.plugin_id === pluginId);
}

class MemoryFsReadPort implements FsReadPort {
  private readonly files: ReadonlyMap<string, string>;

  constructor(files: Readonly<Record<string, string>>) {
    this.files = new Map(Object.entries(files));
  }

  async exists(path: string): Promise<boolean> {
    const normalized = normalizePath(path);
    return this.files.has(normalized)
      || [...this.files.keys()].some((filePath) => filePath.startsWith(`${normalized}/`))
      || normalized === "/repo";
  }

  async readFile(path: string): Promise<string> {
    const normalized = normalizePath(path);
    const content = this.files.get(normalized);
    if (content === undefined) {
      throw new Error(`file not found: ${path}`);
    }
    return content;
  }

  async readDir(path: string): Promise<readonly string[]> {
    const normalized = normalizePath(path);
    const prefix = normalized.endsWith("/") ? normalized : `${normalized}/`;
    const children = new Set<string>();

    for (const filePath of this.files.keys()) {
      if (!filePath.startsWith(prefix)) {
        continue;
      }
      const remainder = filePath.slice(prefix.length);
      const child = remainder.split("/")[0];
      if (child !== undefined && child.length > 0) {
        children.add(child);
      }
    }

    if (children.size === 0 && normalized !== "/repo") {
      throw new Error(`dir not found: ${path}`);
    }

    return [...children].sort();
  }
}

function normalizePath(path: string): string {
  return path.replace(/\/+$/u, "") || "/";
}
