/**
 * Two-pass handoff enforcement. Pure (no I/O); depends only on a
 * DocLookup the caller supplies.
 *
 * Rule: a task-low-pass MUST have `scaffold_task` set, that scaffold
 * MUST resolve to a task-high-pass document (per
 * docs/schema/frontmatter.md), and that task-high-pass MUST be in
 * phase "completed" before the low-pass may transition todo → active.
 *
 * The loop runtime (src/workflow/loop.ts) calls `assertCanStart` BEFORE
 * dispatching any model work. The MCP transition_phase handler (storage
 * layer) calls it as a guard for the same transition.
 */
import type { ShortCode } from "../types/document.js";
import type { TransitionRejection } from "./types.js";

export interface HandoffDocView {
  short_code: string;
  level:
    | "product-doc"
    | "epic"
    | "user-story"
    | "task-high-pass"
    | "task-low-pass"
    | "task-ui";
  phase: string;
  scaffold_task?: string;
}

export interface DocLookup {
  get(short_code: string): HandoffDocView | null;
}

/**
 * Returns null if the low-pass may start; otherwise a structured rejection.
 * No-ops (returns null) for any non-low-pass document — the rule only
 * applies to task-low-pass.
 */
export function assertCanStart(
  doc: HandoffDocView,
  lookup: DocLookup,
): TransitionRejection | null {
  if (doc.level !== "task-low-pass") return null;

  const scaffoldCode = doc.scaffold_task;
  if (!scaffoldCode) {
    return {
      kind: "scaffold-incomplete",
      lowPass: doc.short_code as ShortCode,
      scaffold: "" as ShortCode,
      scaffoldPhase: "missing",
    };
  }

  const scaffold = lookup.get(scaffoldCode);
  if (!scaffold) {
    return {
      kind: "scaffold-incomplete",
      lowPass: doc.short_code as ShortCode,
      scaffold: scaffoldCode as ShortCode,
      scaffoldPhase: "missing",
    };
  }

  if (scaffold.level !== "task-high-pass") {
    // Per schema, scaffold_task MUST point to a task-high-pass.
    return {
      kind: "scaffold-incomplete",
      lowPass: doc.short_code as ShortCode,
      scaffold: scaffoldCode as ShortCode,
      scaffoldPhase: "missing",
    };
  }

  if (scaffold.phase !== "completed") {
    return {
      kind: "scaffold-incomplete",
      lowPass: doc.short_code as ShortCode,
      scaffold: scaffoldCode as ShortCode,
      scaffoldPhase: scaffold.phase,
    };
  }

  return null;
}

/**
 * Convenience: format a scaffold-incomplete rejection as a one-line
 * human message for logs / agent surfaces.
 */
export function explainHandoffRejection(r: TransitionRejection): string {
  if (r.kind !== "scaffold-incomplete") return `(non-handoff rejection: ${r.kind})`;
  if (r.scaffoldPhase === "missing") {
    return `Low-pass ${r.lowPass} cannot start: scaffold ${r.scaffold || "<unset>"} not found.`;
  }
  return `Low-pass ${r.lowPass} cannot start: scaffold ${r.scaffold} is in phase "${r.scaffoldPhase}", needs "completed".`;
}
