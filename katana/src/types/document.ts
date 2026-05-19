/**
 * Shared document types for katana. Mirrors docs/schema/frontmatter.md
 * and docs/schema/short-codes.md. Single source of truth for type names
 * used in storage, mcp tools, and gate engine integration.
 */

/** All document levels Katana knows about. */
export type DocumentType =
  | "product-doc"
  | "epic"
  | "user-story"
  | "task-high-pass"
  | "task-low-pass"
  | "task-ui";

/** Type-code segment used inside short codes. */
export type TypeCode = "PD" | "E" | "US" | "TH" | "TL" | "TU" | "A";

/** Mapping locked from docs/schema/short-codes.md. */
export const TYPE_CODE_BY_LEVEL: Record<DocumentType, TypeCode> = {
  "product-doc": "PD",
  epic: "E",
  "user-story": "US",
  "task-high-pass": "TH",
  "task-low-pass": "TL",
  "task-ui": "TU",
};

/** Phases per document type — forward-only state machines. */
export const PHASES_BY_LEVEL: Record<DocumentType, readonly string[]> = {
  "product-doc": ["draft", "review", "published"],
  epic: ["discovery", "design", "ready", "active", "completed"],
  "user-story": ["discovery", "design", "ready", "active", "completed"],
  "task-high-pass": ["todo", "active", "completed"],
  "task-low-pass": ["todo", "active", "completed"],
  "task-ui": ["todo", "active", "completed"],
} as const;

export type Phase = string; // validated against PHASES_BY_LEVEL at runtime.

/** Subtype enum constrained per level (see frontmatter spec). */
export type Subtype =
  | "architecture"
  | "system-design"
  | "ui"
  | "major-feature"
  | "interface-contract"
  | null;

/** Canonical short-code regex from docs/schema/short-codes.md. */
export const SHORT_CODE_REGEX =
  /^[A-Z][A-Z0-9]{1,9}-(PD|E|US|TH|TL|TU|A)-\d{4}$/;

/** Branded ShortCode for compile-time discipline. */
export type ShortCode = string & { readonly __shortCode: unique symbol };

export function isShortCode(value: string): value is ShortCode {
  return SHORT_CODE_REGEX.test(value);
}

export function asShortCode(value: string): ShortCode {
  if (!isShortCode(value)) throw new Error(`Invalid short code: ${value}`);
  return value as ShortCode;
}

/** Frontmatter as parsed from a katana markdown file. */
export interface Frontmatter {
  id: string;
  level: DocumentType;
  title: string;
  short_code: ShortCode;
  subtype: Subtype;
  created_at: string; // ISO-8601
  updated_at: string; // ISO-8601
  archived: boolean;
  tags: string[];
  exit_criteria_met: boolean;
  phase: Phase;
  parent?: ShortCode;
  blocked_by?: ShortCode[];
  pass?: "high" | "low";
  model_tier?: "strong" | "cheap" | "ui";
  scaffold_task?: ShortCode;
  story_id?: ShortCode;
  strategy_id?: string | null;
  initiative_id?: string | null;
}

/** A document = frontmatter + markdown body. */
export interface Document {
  frontmatter: Frontmatter;
  body: string;
  /** Absolute or workspace-relative path to the .md file on disk. */
  filepath: string;
  /** SHA-256 of the on-disk file contents. */
  file_hash: string;
}

/** Minimal projection used by list/search responses. */
export interface DocumentSummary {
  short_code: ShortCode;
  level: DocumentType;
  title: string;
  phase: Phase;
  parent?: ShortCode;
  archived: boolean;
  updated_at: string;
}
