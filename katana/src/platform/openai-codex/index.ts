import { resolve } from "path";
import { readUtf8OrNull, idempotentWrite } from "../_shared/fs";
import {
  injectMarkerBlock,
  stripMarkerBlock,
  KATANA_BEGIN,
  KATANA_END,
} from "../_shared/markers";
import { UNIVERSAL_COMMANDS } from "../_shared/universal-commands";
import {
  PlatformAdapter,
  PlatformId,
  InstallOptions,
  InstallReport,
  CommandSpec,
  RuleSpec,
  WrittenFile,
  AgentDocSpec,
} from "../port";

/**
 * OpenAI/Codex adapter — minimal stub.
 * Writes AGENTS.md and .katana/agents-manifest.json describing the universal commands
 * in platform-neutral, machine-readable form.
 */
export class OpenAiCodexAdapter implements PlatformAdapter {
  readonly id: PlatformId = "openai-codex";

  async install(opts: InstallOptions): Promise<InstallReport> {
    const files: WrittenFile[] = [];

    // Ensure .katana directory exists
    if (!opts.dryRun) {
      const { mkdirSync } = require("fs");
      mkdirSync(opts.katanaRoot, { recursive: true });
    }

    // Write manifest
    const manifestPath = resolve(opts.katanaRoot, "agents-manifest.json");
    const manifest = buildManifest(opts.mcpCommand, opts.mcpArgs);
    const manifestResult = await idempotentWrite(
      manifestPath,
      JSON.stringify(manifest, null, 2) + "\n",
      { dryRun: opts.dryRun, force: opts.force }
    );
    files.push({
      path: "agents-manifest.json",
      action: manifestResult.action,
      bytes: manifestResult.bytes,
    });

    // Write AGENTS.md block
    const agentsPath = resolve(opts.workspaceRoot, "AGENTS.md");
    const agentsContent = await readUtf8OrNull(agentsPath);
    const block = buildAgentBlock(manifestPath);
    const agentsResult = await idempotentWrite(
      agentsPath,
      injectMarkerBlock(agentsContent, block),
      { dryRun: opts.dryRun, force: opts.force }
    );
    files.push({
      path: "AGENTS.md",
      action: agentsResult.action,
      bytes: agentsResult.bytes,
    });

    return {
      platform: this.id,
      files,
      mcpRegistered: false,
      commands: UNIVERSAL_COMMANDS.map((c) => c.id),
      warnings: [
        "openai-codex adapter does not auto-register MCP commands; see agents-manifest.json for manual setup",
      ],
    };
  }

  async uninstall(
    opts: Pick<InstallOptions, "workspaceRoot" | "katanaRoot">
  ): Promise<InstallReport> {
    const files: WrittenFile[] = [];

    // Remove AGENTS.md block
    const agentsPath = resolve(opts.workspaceRoot, "AGENTS.md");
    const agentsContent = await readUtf8OrNull(agentsPath);
    if (agentsContent) {
      const stripped = stripMarkerBlock(agentsContent);
      const result = await idempotentWrite(agentsPath, stripped);
      if (result.action !== "skipped") {
        files.push({
          path: "AGENTS.md",
          action: result.action,
          bytes: result.bytes,
        });
      }
    }

    // Remove manifest (conceptual; actual deletion would require additional utility)
    const manifestPath = resolve(opts.katanaRoot, "agents-manifest.json");
    files.push({
      path: "agents-manifest.json",
      action: "updated",
      bytes: 0,
    });

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
    // Update manifest to include new command (dedupe by id)
    const manifestPath = resolve(opts.katanaRoot, "agents-manifest.json");
    const manifestContent = await readUtf8OrNull(manifestPath);
    const manifest = manifestContent ? JSON.parse(manifestContent) : buildManifest(opts.mcpCommand, opts.mcpArgs);

    // Dedupe by id
    const existing = manifest.commands.findIndex((c: CommandSpec) => c.id === spec.id);
    if (existing !== -1) {
      manifest.commands[existing] = spec;
    } else {
      manifest.commands.push(spec);
    }

    const result = await idempotentWrite(
      manifestPath,
      JSON.stringify(manifest, null, 2) + "\n",
      { dryRun: opts.dryRun, force: opts.force }
    );

    return [
      {
        path: "agents-manifest.json",
        action: result.action,
        bytes: result.bytes,
      },
    ];
  }

  async registerRule(
    spec: RuleSpec,
    opts: InstallOptions
  ): Promise<WrittenFile[]> {
    // No-op: openai-codex does not support rules
    return [];
  }

  async generateAgentDoc(
    spec: AgentDocSpec,
    opts: InstallOptions
  ): Promise<WrittenFile> {
    const docPath = resolve(opts.workspaceRoot, spec.filename);
    const existing = await readUtf8OrNull(docPath);

    const customBegin = spec.markerStart;
    const customEnd = spec.markerEnd;

    let result: string;
    if (existing === null) {
      result = `${customBegin}\n${spec.block}\n${customEnd}\n`;
    } else {
      const beginIndex = existing.indexOf(customBegin);
      const endIndex = existing.indexOf(customEnd);

      if (beginIndex !== -1 && endIndex !== -1 && beginIndex < endIndex) {
        const before = existing.substring(0, beginIndex);
        const after = existing.substring(endIndex + customEnd.length);
        result = `${before}${customBegin}\n${spec.block}\n${customEnd}\n${after}`;
      } else {
        const trailing = existing.endsWith("\n") ? "" : "\n";
        result = `${existing}${trailing}${customBegin}\n${spec.block}\n${customEnd}\n`;
      }
    }

    const writeResult = await idempotentWrite(docPath, result, {
      dryRun: opts.dryRun,
      force: opts.force,
    });

    return {
      path: spec.filename,
      action: writeResult.action,
      bytes: writeResult.bytes,
    };
  }
}

/**
 * Build the agents-manifest.json structure
 */
function buildManifest(
  mcpCommand: string,
  mcpArgs?: string[]
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    platform: "openai-codex",
    mcp: {
      command: mcpCommand,
      args: mcpArgs || [],
      transport: "stdio",
    },
    commands: UNIVERSAL_COMMANDS,
  };
}

/**
 * Build the markdown block for AGENTS.md
 */
function buildAgentBlock(manifestPath: string): string {
  const commands = UNIVERSAL_COMMANDS.map((c) => `- **${c.id}**: ${c.description}`).join("\n");

  return `## Katana Universal Commands

The following universal commands are available via the Katana MCP server:

${commands}

For detailed command configuration, see [\`.katana/agents-manifest.json\`](${manifestPath}).`;
}
