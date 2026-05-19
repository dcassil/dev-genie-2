/**
 * CursorAdapter implements PlatformAdapter for Cursor IDE.
 * Installs universal commands and MCP server configuration.
 */

import { join, relative } from "path";
import { mkdir } from "fs/promises";
import { idempotentWrite, readUtf8OrNull } from "../_shared/fs";
import { injectMarkerBlock, stripMarkerBlock } from "../_shared/markers";
import { mergeMcpServers, removeMcpServer } from "../_shared/json-merge";
import { UNIVERSAL_COMMANDS } from "../_shared/universal-commands";
import {
  PlatformAdapter,
  PlatformId,
  InstallOptions,
  InstallReport,
  WrittenFile,
  CommandSpec,
  RuleSpec,
  AgentDocSpec,
} from "../port";

export class CursorAdapter implements PlatformAdapter {
  readonly id: PlatformId = "cursor";

  async install(opts: InstallOptions): Promise<InstallReport> {
    const files: WrittenFile[] = [];
    const warnings: string[] = [];

    try {
      // Ensure .cursor/rules directory exists
      const rulesDir = join(opts.workspaceRoot, ".cursor", "rules");
      if (!opts.dryRun) {
        await mkdir(rulesDir, { recursive: true });
      }

      // Write katana.mdc rule with universal commands
      const katanaMdcPath = join(rulesDir, "katana.mdc");
      const katanaMdcContent = await this.renderKatanaMdc();
      const katanaMdcResult = await idempotentWrite(
        katanaMdcPath,
        katanaMdcContent,
        {
          force: opts.force,
          dryRun: opts.dryRun,
        }
      );
      files.push({
        path: relative(opts.workspaceRoot, katanaMdcPath),
        action: katanaMdcResult.action,
        bytes: katanaMdcResult.bytes,
      });

      // Write/merge .cursor/mcp.json
      const mcpJsonPath = join(opts.workspaceRoot, ".cursor", "mcp.json");
      if (!opts.dryRun) {
        await mkdir(join(opts.workspaceRoot, ".cursor"), { recursive: true });
      }

      const existingMcpJson = await readUtf8OrNull(mcpJsonPath);
      const mcpJsonContent = mergeMcpServers(existingMcpJson, "katana", {
        command: opts.mcpCommand,
        ...(opts.mcpArgs && { args: opts.mcpArgs }),
        transport: "stdio",
      });

      const mcpJsonResult = await idempotentWrite(mcpJsonPath, mcpJsonContent, {
        force: opts.force,
        dryRun: opts.dryRun,
      });
      files.push({
        path: relative(opts.workspaceRoot, mcpJsonPath),
        action: mcpJsonResult.action,
        bytes: mcpJsonResult.bytes,
      });

      return {
        platform: this.id,
        files,
        mcpRegistered: true,
        commands: UNIVERSAL_COMMANDS.map((cmd) => cmd.id),
        warnings,
      };
    } catch (error) {
      throw new Error(`CursorAdapter.install failed: ${error}`);
    }
  }

  async uninstall(
    opts: Pick<InstallOptions, "workspaceRoot" | "katanaRoot">
  ): Promise<InstallReport> {
    const files: WrittenFile[] = [];
    const warnings: string[] = [];

    try {
      // Remove katana rule
      const katanaMdcPath = join(opts.workspaceRoot, ".cursor", "rules", "katana.mdc");
      const katanaExists = await readUtf8OrNull(katanaMdcPath);
      if (katanaExists !== null) {
        await idempotentWrite(katanaMdcPath, "", { dryRun: false });
        files.push({
          path: relative(opts.workspaceRoot, katanaMdcPath),
          action: "updated",
          bytes: 0,
        });
      }

      // Remove MCP server from mcp.json
      const mcpJsonPath = join(opts.workspaceRoot, ".cursor", "mcp.json");
      const existingMcpJson = await readUtf8OrNull(mcpJsonPath);
      if (existingMcpJson !== null) {
        const updatedMcpJson = removeMcpServer(existingMcpJson, "katana");
        if (updatedMcpJson === null) {
          // Delete file if empty
          await idempotentWrite(mcpJsonPath, "", { dryRun: false });
        } else {
          await idempotentWrite(mcpJsonPath, updatedMcpJson, { dryRun: false });
        }
        files.push({
          path: relative(opts.workspaceRoot, mcpJsonPath),
          action: "updated",
          bytes: updatedMcpJson?.length ?? 0,
        });
      }

      return {
        platform: this.id,
        files,
        mcpRegistered: false,
        commands: UNIVERSAL_COMMANDS.map((cmd) => cmd.id),
        warnings,
      };
    } catch (error) {
      throw new Error(`CursorAdapter.uninstall failed: ${error}`);
    }
  }

  async registerCommand(
    spec: CommandSpec,
    opts: InstallOptions
  ): Promise<WrittenFile[]> {
    // Commands are embedded in katana.mdc, which is already written during install
    // No additional file writes needed for individual command registration
    return [];
  }

  async registerRule(
    spec: RuleSpec,
    opts: InstallOptions
  ): Promise<WrittenFile[]> {
    const files: WrittenFile[] = [];

    if (spec.scope === "directory") {
      const ruleDir = join(opts.workspaceRoot, ".cursor", "rules");
      if (!opts.dryRun) {
        await mkdir(ruleDir, { recursive: true });
      }

      const rulePath = join(ruleDir, `${spec.id}.mdc`);
      const ruleContent = this.renderDirectoryRule(spec);

      const result = await idempotentWrite(rulePath, ruleContent, {
        force: opts.force,
        dryRun: opts.dryRun,
      });

      files.push({
        path: relative(opts.workspaceRoot, rulePath),
        action: result.action,
        bytes: result.bytes,
      });
    }

    return files;
  }

  async generateAgentDoc(
    spec: AgentDocSpec,
    opts: InstallOptions
  ): Promise<WrittenFile> {
    const filePath = join(opts.workspaceRoot, spec.filename);
    const existing = await readUtf8OrNull(filePath);
    const updated = injectMarkerBlock(existing, spec.block);

    const result = await idempotentWrite(filePath, updated, {
      force: opts.force,
      dryRun: opts.dryRun,
    });

    return {
      path: relative(opts.workspaceRoot, filePath),
      action: result.action,
      bytes: result.bytes,
    };
  }

  private async renderKatanaMdc(): Promise<string> {
    const commandsList = UNIVERSAL_COMMANDS.map((cmd) => {
      const argsDesc = cmd.argsSchema
        ? ` (args: ${JSON.stringify(cmd.argsSchema.properties || {})})`
        : "";
      return `- **${cmd.id}**: ${cmd.description}${argsDesc}`;
    }).join("\n");

    return `---
scope: "workspace"
alwaysApply: true
---

# Katana Agent Commands

You have access to the following universal Katana MCP commands:

${commandsList}

When the user requests any of these operations, call the corresponding Katana MCP tool.
`;
  }

  private renderDirectoryRule(spec: RuleSpec): string {
    const globs = spec.globs?.join("\n  - ") || "";

    return `---
scope: "directory"
globs:
  - ${globs}
---

# ${spec.id}

${spec.body}
`;
  }
}

export default CursorAdapter;
