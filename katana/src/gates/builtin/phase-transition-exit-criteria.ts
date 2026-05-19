import type { Gate, GateContext, GateReason, GateResult, KatanaDocument, DocumentSection } from "../types.js";

const EXIT_SECTION_BY_LEVEL: Record<string, string> = {
  "product-doc": "Success Criteria",
  "epic": "Exit Criteria",
  "user-story": "Acceptance Criteria",
  "task-high-pass": "Acceptance",
  "task-low-pass": "Acceptance",
  "task-ui": "Acceptance",
};

/** Matches `- [ ]` or `- [x]` (case-insensitive x) optionally with leading whitespace. */
const CHECKLIST_RE = /^\s*-\s*\[( |x|X)\]\s+\S/m;
const CHECKLIST_GLOBAL_RE = /^\s*-\s*\[( |x|X)\]\s+\S.*$/gm;
const UNCHECKED_RE = /^\s*-\s*\[ \]\s+\S/m;

export const phaseTransitionExitCriteriaGate: Gate = {
  name: "phase-transition-exit-criteria",
  evaluate(doc: KatanaDocument, _ctx: GateContext): GateResult {
    const reasons: GateReason[] = [];
    const level = doc.frontmatter.level;
    if (!level) return { gate: "phase-transition-exit-criteria", ok: true, reasons };
    const sectionName = EXIT_SECTION_BY_LEVEL[level];
    if (!sectionName) return { gate: "phase-transition-exit-criteria", ok: true, reasons };

    const section: DocumentSection | undefined = doc.sections.find(
      (s) => s.depth === 2 && s.heading === sectionName,
    );
    if (!section) {
      reasons.push({
        code: "exit.section-missing",
        message: `Section "## ${sectionName}" is missing.`,
        severity: "error",
        pointer: `section:${sectionName}`,
      });
      return { gate: "phase-transition-exit-criteria", ok: false, reasons };
    }

    const body = section.body;
    if (!CHECKLIST_RE.test(body)) {
      reasons.push({
        code: "exit.no-checklist",
        message: `Section "## ${sectionName}" has no checklist items (\`- [ ] item\`).`,
        severity: "error",
        pointer: `section:${sectionName}`,
      });
      return { gate: "phase-transition-exit-criteria", ok: false, reasons };
    }

    const allItems = body.match(CHECKLIST_GLOBAL_RE) ?? [];
    const hasUnchecked = UNCHECKED_RE.test(body);
    const flag = doc.frontmatter.exit_criteria_met === true;

    if (flag && hasUnchecked) {
      reasons.push({
        code: "exit.unchecked-with-flag",
        message: `exit_criteria_met is true but "## ${sectionName}" has unchecked items.`,
        severity: "error",
        pointer: `section:${sectionName}`,
      });
    }
    if (!flag && allItems.length > 0 && !hasUnchecked) {
      reasons.push({
        code: "exit.flag-mismatch-all-checked",
        message: `All items in "## ${sectionName}" are checked but exit_criteria_met is not true.`,
        severity: "warning",
        pointer: "frontmatter.exit_criteria_met",
      });
    }

    const ok = !reasons.some((r) => r.severity === "error");
    return { gate: "phase-transition-exit-criteria", ok, reasons };
  },
};
