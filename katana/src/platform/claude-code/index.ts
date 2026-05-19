import { readFileSync, mkdirSync, rmSync, readdirSync, writeFileSync, statSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
import {
  PlatformAdapter,
  PlatformId,
  InstallOptions,
  InstallReport,
  CommandSpec,
  RuleSpec,
  AgentDocSpec,
  WrittenFile,
} from "../port";
import { idempotentWrite, readUtf8OrNull } from "../_shared/fs";
import { mergeMcpServers, MalformedMcpJsonError, removeMcpServer } from "../_shared/json-merge";
import { UNIVERSAL_COMMANDS } from "../_shared/universal-commands";
import { injectMarkerBlock, hasDuplicateMarkers, stripMarkerBlock } from "../_shared/markers";

export class ClaudeCodeAdapter implements PlatformAdapter {
  readonly id: PlatformId = "claude-code";

  private getPluginDir(workspaceRoot: string): string {
    return join(workspaceRoot, ".claude", "plugins", "katana");
  }

  private getCommandsDir(workspaceRoot: string): string {
    return join(this.getPluginDir(workspaceRoot), "commands");
  }

  private loadTemplate(name: string): string {
    const templatePath = join(__dirname, "templates", name);
    return readFileSync(templatePath, "utf-8");
  }

  private substituteVars(template: string, vars: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(vars)) {
      result = result.replace(new RegExp(`{{${key}}}`, "g"), value);
    }
    return result;
  }

  private async writeMcpConfig(opts: InstallOptions): Promise<WrittenFile> {
    const mcpJsonPath = join(opts.workspaceRoot, ".mcp.json");

    // Read existing file if present
    const existing = opts.dryRun ? null : await readUtf8OrNull(mcpJsonPath);

    // Build MCP server entry
    const args = opts.mcpArgs || [];
    const mcpEntry = {
      command: opts.mcpCommand,
      args,
      transport: "stdio",
    };

    // Merge into config
    let content: string;
    try {
      content = mergeMcpServers(existing, "katana", mcpEntry);
    } catch (err) {
      if (err instanceof MalformedMcpJsonError && !opts.force) {
        throw new Error(
          `Malformed .mcp.json: ${err.message}. Use --force to overwrite.`
        );
      }
      // If --force, reconstruct from scratch
      content = mergeMcpServers(null, "katana", mcpEntry);
    }

    // Write file
    const result = await idempotentWrite(mcpJsonPath, content, {
      dryRun: opts.dryRun,
      force: opts.force,
    });

    return {
      path: mcpJsonPath,
      action: result.action,
      bytes: result.bytes,
    };
  }

  async install(opts: InstallOptions): Promise<InstallReport> {
    const pluginDir = this.getPluginDir(opts.workspaceRoot);
    const commandsDir = this.getCommandsDir(opts.workspaceRoot);
    const files: WrittenFile[] = [];

    // Create directories
    if (!opts.dryRun) {
      mkdirSync(pluginDir, { recursive: true });
      mkdirSync(commandsDir, { recursive: true });
    }

    // Write plugin.json
    const pluginJsonTemplate = this.loadTemplate("plugin.json.tmpl");
    const pluginJsonPath = join(pluginDir, "plugin.json");
    const pluginJsonResult = await idempotentWrite(
      pluginJsonPath,
      pluginJsonTemplate,
      { dryRun: opts.dryRun, force: opts.force }
    );
    files.push({
      path: pluginJsonPath,
      action: pluginJsonResult.action,
      bytes: pluginJsonResult.bytes,
    });

    // Write command files
    for (const cmd of UNIVERSAL_COMMANDS) {
      const templateName = `commands/${cmd.id}.md.tmpl`;
      const template = this.loadTemplate(templateName);
      const cmdPath = join(commandsDir, `${cmd.id}.md`);
      const cmdResult = await idempotentWrite(cmdPath, template, {
        dryRun: opts.dryRun,
        force: opts.force,
      });
      files.push({
        path: cmdPath,
        action: cmdResult.action,
        bytes: cmdResult.bytes,
      });
    }

    // Write .mcp.json with the katana server entry
    const warnings: string[] = [];
    let mcpRegistered = true;
    try {
      const mcpFile = await this.writeMcpConfig(opts);
      files.push(mcpFile);
    } catch (err) {
      // Malformed .mcp.json without --force: surface as a warning rather
      // than aborting the rest of the install.
      warnings.push(err instanceof Error ? err.message : String(err));
      mcpRegistered = false;
    }

    // Generate agent documentation (CLAUDE.md)
    const agentDocSpec: AgentDocSpec = {
      filename: "CLAUDE.md",
      block: this.generateClaudeMdBlock(opts.katanaRoot),
      markerStart: "<!-- katana:begin -->",
      markerEnd: "<!-- katana:end -->",
    };
    const agentDocFile = await this.generateAgentDoc(agentDocSpec, opts);
    if (agentDocFile.action !== "skipped") {
      files.push(agentDocFile);
    }

    return {
      platform: this.id,
      files,
      mcpRegistered,
      commands: UNIVERSAL_COMMANDS.map((cmd) => cmd.id),
      warnings,
    };
  }

  async uninstall(
    opts: Pick<InstallOptions, "workspaceRoot" | "katanaRoot">
  ): Promise<InstallReport> {
    const files: WrittenFile[] = [];

    // 1. Delete .claude/plugins/katana/ recursively
    const pluginDir = this.getPluginDir(opts.workspaceRoot);
    const pluginDirAction = this.deleteDirectory(pluginDir);
    if (pluginDirAction.removed) {
      files.push({
        path: pluginDir,
        action: "removed",
        bytes: 0,
      });

      // 2. Clean up .claude/plugins/ if empty; clean up .claude/ if empty
      const pluginsDir = join(opts.workspaceRoot, ".claude", "plugins");
      if (this.isDirectoryEmpty(pluginsDir)) {
        rmSync(pluginsDir, { recursive: true, force: true });
      }

      const claudeDir = join(opts.workspaceRoot, ".claude");
      if (this.isDirectoryEmpty(claudeDir)) {
        rmSync(claudeDir, { recursive: true, force: true });
      }
    }

    // 3. Update .mcp.json: remove katana entry
    const mcpJsonPath = join(opts.workspaceRoot, ".mcp.json");
    const mcpJsonAction = await this.updateMcpJson(mcpJsonPath);
    if (mcpJsonAction) {
      files.push(mcpJsonAction);
    }

    // 4. Update CLAUDE.md: remove marker block
    const claudeMdPath = join(opts.workspaceRoot, "CLAUDE.md");
    const claudeMdAction = await this.updateClaudeMd(claudeMdPath);
    if (claudeMdAction) {
      files.push(claudeMdAction);
    }

    return {
      platform: this.id,
      files,
      mcpRegistered: false,
      commands: [],
      warnings: [],
    };
  }

  async registerCommand(
    spec: CommandSpec,
    opts: InstallOptions
  ): Promise<WrittenFile[]> {
    const commandsDir = this.getCommandsDir(opts.workspaceRoot);
    const cmdPath = join(commandsDir, `${spec.id}.md`);

    // For now, create a simple command file with frontmatter
    const content = `---
name: ${spec.id}
description: ${spec.description}
argument-hint: ${spec.id.replace("katana-", "")}
---

Command implementation for ${spec.id}.
`;

    if (!opts.dryRun) {
      mkdirSync(commandsDir, { recursive: true });
    }

    const result = await idempotentWrite(cmdPath, content, {
      dryRun: opts.dryRun,
      force: opts.force,
    });

    return [
      {
        path: cmdPath,
        action: result.action,
        bytes: result.bytes,
      },
    ];
  }

  async registerRule(
    spec: RuleSpec,
    opts: InstallOptions
  ): Promise<WrittenFile[]> {
    // Placeholder: deferred to later task
    return [];
  }

  private generateClaudeMdBlock(katanaRoot: string): string {
    const commands = UNIVERSAL_COMMANDS.map((cmd) => `- /${cmd.id}`).join(
      "\n"
    );
    return `## Katana Workflow

This repo uses katana. Workspace: \`${katanaRoot}\`.

Universal commands:
${commands}

Always invoke through the katana MCP server (\`mcpServers.katana\` in \`.mcp.json\`).`;
  }

  async generateAgentDoc(
    spec: AgentDocSpec,
    opts: InstallOptions
  ): Promise<WrittenFile> {
    const filePath = join(opts.workspaceRoot, spec.filename);

    // Read existing file if present
    let existing: string | null = null;
    if (!opts.dryRun) {
      existing = await readUtf8OrNull(filePath);
    }

    // Check for duplicate markers
    if (existing && hasDuplicateMarkers(existing)) {
      throw new Error(
        `Duplicate marker pairs found in ${spec.filename}. Error code: katana.claude-md.duplicate-markers`
      );
    }

    // Inject or replace marker block
    const newContent = injectMarkerBlock(existing, spec.block);

    // Write file idempotently
    const result = await idempotentWrite(filePath, newContent, {
      dryRun: opts.dryRun,
      force: opts.force,
    });

    return {
      path: filePath,
      action: result.action,
      bytes: result.bytes,
    };
  }

  private deleteDirectory(path: string): { removed: boolean } {
    try {
      statSync(path);
      rmSync(path, { recursive: true, force: true });
      return { removed: true };
    } catch {
      // Directory does not exist or cannot be deleted
      return { removed: false };
    }
  }

  private isDirectoryEmpty(path: string): boolean {
    try {
      const entries = readdirSync(path);
      return entries.length === 0;
    } catch {
      // Directory does not exist
      return false;
    }
  }

  private async updateMcpJson(mcpJsonPath: string): Promise<WrittenFile | null> {
    const existing = await readUtf8OrNull(mcpJsonPath);

    if (existing === null) {
      // File doesn't exist; nothing to do
      return null;
    }

    try {
      const result = removeMcpServer(existing, "katana");

      if (result === null) {
        // Remove the file (mcpServers is now empty)
        rmSync(mcpJsonPath, { force: true });
        return {
          path: mcpJsonPath,
          action: "removed",
          bytes: 0,
        };
      }

      // Update the file
      writeFileSync(mcpJsonPath, result);
      return {
        path: mcpJsonPath,
        action: "updated",
        bytes: Buffer.byteLength(result, "utf-8"),
      };
    } catch (err) {
      // Malformed JSON; skip
      return null;
    }
  }

  private async updateClaudeMd(claudeMdPath: string): Promise<WrittenFile | null> {
    const existing = await readUtf8OrNull(claudeMdPath);

    if (existing === null) {
      // File doesn't exist; nothing to do
      return null;
    }

    // Remove the marker block
    const stripped = stripMarkerBlock(existing);

    // Check if file is now empty or whitespace-only
    const trimmed = stripped.trim();
    if (trimmed === "") {
      // Delete the file
      rmSync(claudeMdPath, { force: true });
      return {
        path: claudeMdPath,
        action: "removed",
        bytes: 0,
      };
    }

    // Update the file
    writeFileSync(claudeMdPath, stripped);
    return {
      path: claudeMdPath,
      action: "updated",
      bytes: Buffer.byteLength(stripped, "utf-8"),
    };
  }
}
