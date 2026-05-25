import { parseArgs } from "node:util";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getAdapter, listPlatforms } from "../platform/registry.js";
import type { InstallOptions, PlatformId } from "../platform/port.js";

export interface InstallCommandArgs {
  platform: string;
  workspace?: string;
  "katana-root"?: string;
  "mcp-command"?: string;
  "mcp-args"?: string;
  "dry-run"?: boolean;
  force?: boolean;
}

export interface InstallCommandDeps {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
}

const here = dirname(fileURLToPath(import.meta.url));

export function defaultKatanaMcpArgs(): string[] {
  return [resolve(here, "../../bin/katana-mcp.js")];
}

function parseMcpArgs(value: string | undefined): string[] {
  if (value === undefined) return defaultKatanaMcpArgs();
  const trimmed = value.trim();
  if (trimmed === "") return [];
  return trimmed.split(",").map((arg) => arg.trim());
}

function isKnownPlatform(platform: string): platform is PlatformId {
  return platform === "claude-code" ||
    platform === "cursor" ||
    platform === "openai-codex";
}

export async function runInstall(
  argv: string[],
  deps: InstallCommandDeps,
): Promise<number> {
  try {
    const result = parseArgs({
      args: argv,
      options: {
        workspace: { type: "string" },
        "katana-root": { type: "string" },
        "mcp-command": { type: "string" },
        "mcp-args": { type: "string" },
        "dry-run": { type: "boolean" },
        force: { type: "boolean" },
      },
      allowPositionals: true,
    });

    const platform = result.positionals[0];

    if (!platform) {
      const available = listPlatforms();
      deps.stderr("Error: platform argument required.\n");
      deps.stderr(`Available platforms: ${available.join(", ")}\n`);
      deps.stderr("Usage: katana install <platform> [options]\n");
      return 2;
    }

    if (!isKnownPlatform(platform)) {
      const available = listPlatforms();
      deps.stderr(`Unknown platform: ${platform}. Known: ${available.join(", ")}\n`);
      deps.stderr(`Available platforms: ${available.join(", ")}\n`);
      return 2;
    }
    const adapter = getAdapter(platform);

    const workspace = result.values.workspace ?? process.cwd();
    const katanaRoot = result.values["katana-root"] ?? `${workspace}/.katana`;
    const mcpCommand = result.values["mcp-command"] ?? "node";
    const mcpArgs = parseMcpArgs(result.values["mcp-args"]);
    const dryRun = result.values["dry-run"] ?? false;
    const force = result.values.force ?? false;

    const opts: InstallOptions = {
      workspaceRoot: workspace,
      katanaRoot,
      mcpCommand,
      mcpArgs,
      dryRun,
      force,
    };

    const report = await adapter.install(opts);

    // Print warnings to stderr
    if (report.warnings.length > 0) {
      for (const warning of report.warnings) {
        deps.stderr(`Warning: ${warning}\n`);
      }
    }

    // Print file table
    if (report.files.length > 0) {
      deps.stdout("Files:\n");
      const headers = ["Path", "Action", "Bytes"];
      const rows = report.files.map((f) => [f.path, f.action, f.bytes.toString()]);

      // Simple table formatting
      const colWidths = [
        Math.max(...headers.map((h) => h.length), ...rows.map((r) => r[0].length)),
        Math.max(...headers.map((h) => h.length), ...rows.map((r) => r[1].length)),
        Math.max(...headers.map((h) => h.length), ...rows.map((r) => r[2].length)),
      ];

      deps.stdout(
        `${headers[0].padEnd(colWidths[0])}  ${headers[1].padEnd(colWidths[1])}  ${headers[2].padEnd(colWidths[2])}\n`,
      );
      deps.stdout(
        `${"-".repeat(colWidths[0])}  ${"-".repeat(colWidths[1])}  ${"-".repeat(colWidths[2])}\n`,
      );

      for (const row of rows) {
        deps.stdout(
          `${row[0].padEnd(colWidths[0])}  ${row[1].padEnd(colWidths[1])}  ${row[2].padEnd(colWidths[2])}\n`,
        );
      }
    }

    // Count actions
    const created = report.files.filter((f) => f.action === "created").length;
    const updated = report.files.filter((f) => f.action === "updated").length;
    const skipped = report.files.filter((f) => f.action === "skipped").length;

    // Print summary
    const mcpStr = report.mcpRegistered ? "true" : "false";
    deps.stdout(
      `installed ${platform}: ${created} created, ${updated} updated, ${skipped} skipped, mcp=${mcpStr}\n`,
    );

    return 0;
  } catch (err) {
    deps.stderr(`Error: ${(err as Error).message}\n`);
    return 1;
  }
}
