import { parseArgs } from "node:util";
import { getAdapter, listPlatforms } from "../platform/registry.js";
import type { UnknownPlatformError } from "../platform/registry.js";
import type { InstallOptions } from "../platform/port.js";

export interface UninstallCommandArgs {
  platform: string;
  workspace?: string;
  "katana-root"?: string;
}

export interface UninstallCommandDeps {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
}

export async function runUninstall(
  argv: string[],
  deps: UninstallCommandDeps,
): Promise<number> {
  try {
    const result = parseArgs({
      args: argv,
      options: {
        workspace: { type: "string" },
        "katana-root": { type: "string" },
      },
      allowPositionals: true,
    });

    const platform = result.positionals[0];

    if (!platform) {
      const available = listPlatforms();
      deps.stderr("Error: platform argument required.\n");
      deps.stderr(`Available platforms: ${available.join(", ")}\n`);
      deps.stderr("Usage: katana uninstall <platform> [options]\n");
      return 2;
    }

    let adapter;
    try {
      adapter = getAdapter(platform as any);
    } catch (err) {
      if ((err as Error).name === "UnknownPlatformError") {
        const available = listPlatforms();
        deps.stderr(`${(err as Error).message}\n`);
        deps.stderr(`Available platforms: ${available.join(", ")}\n`);
        return 2;
      }
      throw err;
    }

    const workspace = result.values.workspace ?? process.cwd();
    const katanaRoot = result.values["katana-root"] ?? `${workspace}/.katana`;

    const opts = {
      workspaceRoot: workspace,
      katanaRoot,
    };

    const report = await adapter.uninstall(opts);

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
    const removed = report.files.filter((f) => f.action === "removed").length;
    const updated = report.files.filter((f) => f.action === "updated").length;
    const skipped = report.files.filter((f) => f.action === "skipped").length;

    // Print summary
    deps.stdout(
      `uninstalled ${platform}: ${removed} removed, ${updated} updated, ${skipped} skipped\n`,
    );

    return 0;
  } catch (err) {
    deps.stderr(`Error: ${(err as Error).message}\n`);
    return 1;
  }
}
