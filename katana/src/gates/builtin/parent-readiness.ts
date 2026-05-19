import type { Gate, GateContext, GateReason, GateResult, KatanaDocument } from "../types.js";

const EXPECTED_PARENT_LEVEL: Record<string, string> = {
  "epic": "product-doc",
  "user-story": "epic",
  "task-high-pass": "user-story",
  "task-low-pass": "user-story",
  "task-ui": "user-story",
};

const MIN_PARENT_PHASE: Record<string, string> = {
  // To create/work on an epic, parent product-doc must be at least "review".
  "epic": "review",
  // To create/work on a user-story, parent epic must be at least "ready".
  "user-story": "ready",
  // To create/work on a task, parent user-story must be at least "ready".
  "task-high-pass": "ready",
  "task-low-pass": "ready",
  "task-ui": "ready",
};

// Phase ordering used to compare. Earlier = lower index.
const PHASE_ORDER: Record<string, ReadonlyArray<string>> = {
  "product-doc": ["draft", "review", "published"],
  "epic": ["discovery", "design", "ready", "active", "completed"],
  "user-story": ["discovery", "design", "ready", "active", "completed"],
};

export const parentReadinessGate: Gate = {
  name: "parent-readiness",
  evaluate(doc: KatanaDocument, ctx: GateContext): GateResult {
    const reasons: GateReason[] = [];
    const level = doc.frontmatter.level;
    if (!level || level === "product-doc") {
      return { gate: "parent-readiness", ok: true, reasons };
    }

    const parentCode = doc.frontmatter.parent;
    if (!parentCode || parentCode === "") {
      reasons.push({
        code: "parent.missing-ref",
        message: `level "${level}" requires a parent short code.`,
        severity: "error",
        pointer: "frontmatter.parent",
      });
      return { gate: "parent-readiness", ok: false, reasons };
    }

    const parent = ctx.lookup(parentCode);
    if (!parent) {
      reasons.push({
        code: "parent.unresolved",
        message: `parent "${parentCode}" not found in workspace.`,
        severity: "error",
        pointer: "frontmatter.parent",
      });
    } else {
      const expectedLevel = EXPECTED_PARENT_LEVEL[level];
      if (expectedLevel && parent.frontmatter.level !== expectedLevel) {
        reasons.push({
          code: "parent.wrong-level",
          message: `parent "${parentCode}" has level "${String(parent.frontmatter.level)}", expected "${expectedLevel}".`,
          severity: "error",
          pointer: "frontmatter.parent",
        });
      }
      const minPhase = MIN_PARENT_PHASE[level];
      const parentLevel = parent.frontmatter.level;
      const parentPhase = parent.frontmatter.phase;
      if (minPhase && parentLevel && parentPhase) {
        const order = PHASE_ORDER[parentLevel];
        if (order) {
          const cur = order.indexOf(parentPhase);
          const min = order.indexOf(minPhase);
          if (cur >= 0 && min >= 0 && cur < min) {
            reasons.push({
              code: "parent.phase-too-early",
              message: `parent "${parentCode}" is in phase "${parentPhase}", required at least "${minPhase}".`,
              severity: "error",
              pointer: "frontmatter.parent",
            });
          }
        }
      }
    }

    if (level === "task-low-pass") {
      const scaffoldCode = doc.frontmatter.scaffold_task;
      if (typeof scaffoldCode === "string" && scaffoldCode !== "") {
        const scaffold = ctx.lookup(scaffoldCode);
        if (!scaffold) {
          reasons.push({
            code: "scaffold.unresolved",
            message: `scaffold_task "${scaffoldCode}" not found in workspace.`,
            severity: "error",
            pointer: "frontmatter.scaffold_task",
          });
        } else {
          if (scaffold.frontmatter.level !== "task-high-pass") {
            reasons.push({
              code: "scaffold.wrong-level",
              message: `scaffold_task "${scaffoldCode}" has level "${String(scaffold.frontmatter.level)}", expected "task-high-pass".`,
              severity: "error",
              pointer: "frontmatter.scaffold_task",
            });
          }
          if (scaffold.frontmatter.parent !== parentCode) {
            reasons.push({
              code: "scaffold.wrong-story",
              message: `scaffold_task parent "${String(scaffold.frontmatter.parent)}" differs from this task's parent "${parentCode}".`,
              severity: "error",
              pointer: "frontmatter.scaffold_task",
            });
          }
        }
      }
    }

    const ok = !reasons.some((r) => r.severity === "error");
    return { gate: "parent-readiness", ok, reasons };
  },
};
