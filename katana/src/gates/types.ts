/**
 * Document level (mirrors docs/schema/frontmatter.md).
 */
export type DocumentLevel =
  | "product-doc"
  | "epic"
  | "user-story"
  | "task-high-pass"
  | "task-low-pass"
  | "task-ui";

/**
 * Phase values across all levels (union of every per-level phase set).
 */
export type Phase =
  | "draft"
  | "review"
  | "published"
  | "discovery"
  | "design"
  | "ready"
  | "active"
  | "completed"
  | "todo";

/**
 * Subtype values across all levels (per docs/schema/frontmatter.md).
 */
export type Subtype =
  | "architecture"
  | "system-design"
  | "ui"
  | "major-feature"
  | "interface-contract"
  | null;

/**
 * Parsed frontmatter as produced by the document loader (KAT-T-0063).
 * Permissive — gates handle missing/invalid fields, they do not crash.
 */
export interface DocumentFrontmatter {
  id?: string;
  level?: DocumentLevel;
  title?: string;
  short_code?: string;
  subtype?: Subtype;
  parent?: string;
  created_at?: string;
  updated_at?: string;
  archived?: boolean;
  tags?: string[];
  exit_criteria_met?: boolean;
  phase?: Phase;
  blocked_by?: string[];
  pass?: "high" | "low";
  model_tier?: "strong" | "cheap" | "ui";
  scaffold_task?: string;
  story_id?: string;
  strategy_id?: string | null;
  initiative_id?: string | null;
  [key: string]: unknown;
}

/**
 * A parsed section heading + body block from the markdown body.
 */
export interface DocumentSection {
  /** Heading text without the leading `## ` markers. */
  heading: string;
  /** Heading depth (2 for `##`, 3 for `###`). */
  depth: number;
  /** Raw body text between this heading and the next equal-or-higher heading. */
  body: string;
}

/**
 * A single document loaded from disk and ready for gate evaluation.
 */
export interface KatanaDocument {
  /** Absolute filesystem path to the markdown file. */
  path: string;
  /** Raw file contents. */
  raw: string;
  /** Parsed frontmatter (may have missing fields if the file is malformed). */
  frontmatter: DocumentFrontmatter;
  /** Markdown body with the frontmatter block stripped. */
  body: string;
  /** Top-level sections parsed from `body` (depth >= 2). */
  sections: DocumentSection[];
}

export type GateSeverity = "error" | "warning";

/**
 * One actionable failure produced by a gate. Gates may emit multiple per run.
 */
export interface GateReason {
  /** Stable machine-readable identifier, e.g. "frontmatter.missing-field". */
  code: string;
  /** Human-readable single-line explanation. */
  message: string;
  /** Errors fail the gate; warnings do not. */
  severity: GateSeverity;
  /** Optional pointer, e.g. "frontmatter.short_code" or "section:Goal". */
  pointer?: string;
}

/**
 * Result of running one gate against one document.
 * `ok` is false iff at least one reason has severity "error".
 */
export interface GateResult {
  gate: string;
  ok: boolean;
  reasons: GateReason[];
}

/**
 * Workspace context passed to every gate. Filesystem operations are
 * abstracted so gates stay pure with respect to disk.
 */
export interface GateContext {
  /** Look up another document by short code. Returns null if not found. */
  lookup(shortCode: string): KatanaDocument | null;
  /** All non-archived documents in the workspace. */
  all(): KatanaDocument[];
}

/**
 * The Gate interface every built-in and user-defined gate implements.
 */
export interface Gate {
  /** Stable identifier, e.g. "template-completeness". */
  readonly name: string;
  /**
   * Pure evaluator. MUST NOT touch the filesystem directly — use ctx.lookup.
   * MUST NOT throw for invalid documents; emit a GateReason instead.
   */
  evaluate(doc: KatanaDocument, ctx: GateContext): GateResult;
}
