import type { Gate, GateContext, GateReason, GateResult, KatanaDocument } from "../types.js";

const SHORT_CODE_RE = /^[A-Z][A-Z0-9]{1,9}-(PD|E|US|TH|TL|TU|A)-\d{4}$/;

const TYPE_CODE_BY_LEVEL: Record<string, string> = {
  "product-doc": "PD",
  "epic": "E",
  "user-story": "US",
  "task-high-pass": "TH",
  "task-low-pass": "TL",
  "task-ui": "TU",
};

export const shortCodeFormatGate: Gate = {
  name: "short-code-format",
  evaluate(doc: KatanaDocument, _ctx: GateContext): GateResult {
    const reasons: GateReason[] = [];
    const fm = doc.frontmatter;
    const code = fm.short_code;

    if (!code || code === "") {
      reasons.push({
        code: "short-code.missing",
        message: "short_code is missing.",
        severity: "error",
        pointer: "frontmatter.short_code",
      });
    } else if (!SHORT_CODE_RE.test(code)) {
      reasons.push({
        code: "short-code.invalid-format",
        message: `short_code "${code}" does not match ${SHORT_CODE_RE.source}.`,
        severity: "error",
        pointer: "frontmatter.short_code",
      });
    } else if (fm.level && TYPE_CODE_BY_LEVEL[fm.level]) {
      const expected = TYPE_CODE_BY_LEVEL[fm.level]!;
      const actual = code.split("-")[1];
      if (actual !== expected) {
        reasons.push({
          code: "short-code.type-mismatch",
          message: `short_code type segment "${actual}" does not match level "${fm.level}" (expected "${expected}").`,
          severity: "error",
          pointer: "frontmatter.short_code",
        });
      }
    }

    if (typeof fm.parent === "string" && fm.parent.length > 0 && !SHORT_CODE_RE.test(fm.parent)) {
      reasons.push({
        code: "short-code.parent-format",
        message: `parent "${fm.parent}" is not a well-formed short code.`,
        severity: "warning",
        pointer: "frontmatter.parent",
      });
    }

    if (typeof fm.scaffold_task === "string" && fm.scaffold_task.length > 0 && !SHORT_CODE_RE.test(fm.scaffold_task)) {
      reasons.push({
        code: "short-code.scaffold-format",
        message: `scaffold_task "${fm.scaffold_task}" is not a well-formed short code.`,
        severity: "warning",
        pointer: "frontmatter.scaffold_task",
      });
    }

    const ok = !reasons.some((r) => r.severity === "error");
    return { gate: "short-code-format", ok, reasons };
  },
};
