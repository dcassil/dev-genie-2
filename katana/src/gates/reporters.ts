import type { GateRunReport } from "./runner.js";
import type { GateReason, GateResult } from "./types.js";

/**
 * JSON reporter: returns a stringified report with stable key order.
 * Pretty-printed with 2-space indent.
 */
export function formatJson(report: GateRunReport): string {
  const out = {
    ok: report.ok,
    document: {
      path: report.document.path,
      short_code: report.document.short_code ?? null,
    },
    results: report.results.map((r) => ({
      gate: r.gate,
      ok: r.ok,
      reasons: r.reasons.map((reason) => ({
        code: reason.code,
        severity: reason.severity,
        message: reason.message,
        pointer: reason.pointer ?? null,
      })),
    })),
  };
  return JSON.stringify(out, null, 2);
}

/**
 * Markdown reporter: produces a checklist suitable for posting back
 * to the agent. Each gate is one line; failures expand inline.
 *
 * Example output:
 *
 *   # Gate Report — KAT-E-9001
 *
 *   - [x] frontmatter-schema
 *   - [ ] template-completeness
 *     - error template.section-missing — Section "## Summary" is missing. (section:Summary)
 */
export function formatMarkdown(report: GateRunReport): string {
  const lines: string[] = [];
  const code = report.document.short_code ?? "(no short_code)";
  lines.push(`# Gate Report — ${code}`);
  lines.push("");
  lines.push(`Path: \`${report.document.path}\``);
  lines.push(`Overall: ${report.ok ? "PASS" : "FAIL"}`);
  lines.push("");
  for (const r of report.results) {
    const box = r.ok ? "[x]" : "[ ]";
    lines.push(`- ${box} ${r.gate}`);
    for (const reason of r.reasons) {
      const ptr = reason.pointer ? ` (${reason.pointer})` : "";
      lines.push(`  - ${reason.severity} ${reason.code} — ${reason.message}${ptr}`);
    }
  }
  return lines.join("\n") + "\n";
}
