/**
 * PlatformAdapter port interface and contract types.
 * Every platform (Claude Code, Cursor, OpenAI/Codex) implements this interface.
 * No platform-specific logic, no filesystem imports — types and contracts only.
 */

/**
 * Unique platform identifier.
 */
export type PlatformId = "claude-code" | "cursor" | "openai-codex";

/**
 * Options passed to adapter.install() and adapter.registerCommand().
 * Defines the workspace layout and MCP server invocation.
 */
export interface InstallOptions {
  /** Absolute path to the host repository root. */
  workspaceRoot: string;

  /** Absolute path to the katana installation directory, typically `<workspaceRoot>/.katana`. */
  katanaRoot: string;

  /** Command to invoke the MCP server; e.g. "npx katana-mcp" or custom launcher. */
  mcpCommand: string;

  /** Optional additional arguments passed to mcpCommand. */
  mcpArgs?: string[];

  /** If true, return report without writing any files. */
  dryRun?: boolean;

  /** If true, overwrite existing files; otherwise skip. */
  force?: boolean;
}

/**
 * Record of a single file created, updated, or skipped during install/register.
 */
export interface WrittenFile {
  /** Absolute or workspace-relative path to the file. */
  path: string;

  /** Lifecycle action: "created" (new), "updated" (modified), "skipped" (already matches), "removed" (deleted). */
  action: "created" | "updated" | "skipped" | "removed";

  /** File size in bytes after write (or current size if skipped). */
  bytes: number;
}

/**
 * Summary of adapter.install() or adapter.uninstall() execution.
 */
export interface InstallReport {
  /** Platform that performed the installation. */
  platform: PlatformId;

  /** All files written (or would-be written in dryRun mode). */
  files: WrittenFile[];

  /** Whether the MCP server was successfully registered in the platform's configuration. */
  mcpRegistered: boolean;

  /** List of command IDs exposed to the user after installation (e.g. ["katana-decompose", "katana-work", "katana-board", "katana-validate"]). */
  commands: string[];

  /** Non-fatal issues encountered (e.g. "Failed to register keyboard shortcut"). */
  warnings: string[];
}

/**
 * Specification for a universal or platform-specific command exposed to the user.
 * Maps 1:1 to an MCP tool at runtime via the handlerHint.
 *
 * Universal commands (required by all adapters):
 * - decompose: wraps MCP decompose_document
 * - work: custom runtime command (no direct MCP mapping)
 * - board: wraps MCP list_documents
 * - validate: wraps MCP validate_document
 */
export interface CommandSpec {
  /** Unique command identifier; e.g. "katana-decompose", "katana-work", "katana-board", "katana-validate". */
  id: string;

  /** Human-readable description for CLI help or UI tooltips. */
  description: string;

  /** Optional JSON Schema (draft-7) defining the command's arguments. */
  argsSchema?: object;

  /** Runtime hint mapping this command to an MCP tool handler. */
  handlerHint: {
    /** Name of the MCP tool this command delegates to (or empty string if custom handler). */
    mcpTool: string;
  };
}

/**
 * Specification for a workspace or directory-scoped linting/validation rule.
 * Injected into rule configuration files or agent instruction blocks.
 */
export interface RuleSpec {
  /** Unique rule identifier; e.g. "katana-core", "style-guide". */
  id: string;

  /** Scope: "workspace" (applies project-wide) or "directory" (applies to specific globs). */
  scope: "workspace" | "directory";

  /** Markdown content describing the rule and its rationale. */
  body: string;

  /** Optional glob patterns for directory-scoped rules; e.g. ["src/**", "!src/generated/**"]. */
  globs?: string[];
}

/**
 * Specification for injecting or updating content in shared agent documentation files.
 * Uses marker-bracketed regions to safely coexist with user-authored content.
 */
export interface AgentDocSpec {
  /** Target filename; typically "CLAUDE.md", "AGENTS.md", or platform-specific variants. */
  filename: string;

  /** Markdown content to inject between start and end markers. */
  block: string;

  /** Start marker; e.g. "<!-- katana:begin -->" or "<!-- katana:decompose-start -->". */
  markerStart: string;

  /** End marker; e.g. "<!-- katana:end -->" or "<!-- katana:decompose-end -->". */
  markerEnd: string;
}

/**
 * PlatformAdapter is the contract every platform implementation must honor.
 * All methods must be idempotent: re-running install on an unchanged workspace must be a no-op.
 */
export interface PlatformAdapter {
  /** Unique platform identifier. */
  readonly id: PlatformId;

  /**
   * Install katana and all universal commands into the platform.
   * Writes config files, registers MCP server, and surfaces the four universal commands.
   * Must be idempotent.
   */
  install(opts: InstallOptions): Promise<InstallReport>;

  /**
   * Uninstall katana from the platform.
   * Reverts changes made by install(); deregisters MCP server; removes command bindings.
   */
  uninstall(opts: Pick<InstallOptions, "workspaceRoot" | "katanaRoot">): Promise<InstallReport>;

  /**
   * Register a single command (universal or platform-specific) with the platform.
   * Returns the files written (configuration snippets, shortcut definitions, etc.).
   */
  registerCommand(spec: CommandSpec, opts: InstallOptions): Promise<WrittenFile[]>;

  /**
   * Register a workspace or directory-scoped rule with the platform.
   * Typically writes to rule configuration files or agent documentation.
   */
  registerRule(spec: RuleSpec, opts: InstallOptions): Promise<WrittenFile[]>;

  /**
   * Generate or inject platform-specific agent documentation (CLAUDE.md, AGENTS.md, etc.).
   * Uses marker-bracketed regions to safely coexist with user content.
   */
  generateAgentDoc(spec: AgentDocSpec, opts: InstallOptions): Promise<WrittenFile>;
}
