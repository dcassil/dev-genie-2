/**
 * Gate engine seam. KAT-I-0002 will replace runValidateGate / runDecomposeGate
 * with real evaluators. Callers MUST go through these functions, not inline rules.
 */
import type { Document, ShortCode } from "../types/document.js";
import type { StoragePort } from "../storage/port.js";

export interface Diagnostic {
  severity: "error" | "warning" | "info";
  rule_id: string;
  message: string;
}

export interface GateResult {
  short_code: ShortCode;
  ok: boolean;
  diagnostics: Diagnostic[];
}

export async function runValidateGate(
  doc: Document,
  _ctx: { storage: StoragePort }
): Promise<GateResult> {
  const diags: Diagnostic[] = [];
  const fm = doc.frontmatter;
  if (!fm.tags.includes(`#${fm.level}`))
    diags.push({
      severity: "error",
      rule_id: "tag.level",
      message: `tags must include #${fm.level}`,
    });
  if (!fm.tags.includes(`#phase/${fm.phase}`))
    diags.push({
      severity: "error",
      rule_id: "tag.phase",
      message: `tags must include #phase/${fm.phase}`,
    });
  if (fm.level !== "product-doc" && !fm.parent)
    diags.push({
      severity: "error",
      rule_id: "parent.required",
      message: `parent required for ${fm.level}`,
    });
  if (fm.level === "task-low-pass" && !fm.scaffold_task)
    diags.push({
      severity: "error",
      rule_id: "scaffold_task.required",
      message: "task-low-pass requires scaffold_task",
    });
  return {
    short_code: fm.short_code,
    ok: diags.every((d) => d.severity !== "error"),
    diagnostics: diags,
  };
}

export async function runDecomposeGate(
  parent: Document,
  ctx: { storage: StoragePort }
): Promise<GateResult> {
  // Stub: pass-through. KAT-I-0002 will check parent readiness (e.g., phase >= 'design').
  return runValidateGate(parent, ctx);
}
