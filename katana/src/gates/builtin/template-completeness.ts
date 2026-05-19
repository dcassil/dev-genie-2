import type { Gate, GateContext, GateReason, GateResult, KatanaDocument, DocumentSection } from "../types.js";

type SectionRule = { heading: string; required: true } | { heading: string; required: false; whenSubtype: ReadonlyArray<string | null> };

const SECTIONS_BY_LEVEL: Record<string, ReadonlyArray<SectionRule>> = {
  "product-doc": [
    { heading: "Purpose", required: true },
    { heading: "Audience", required: true },
    { heading: "Problem & Current State", required: true },
    { heading: "Goals / Non-Goals", required: true },
    { heading: "Architecture Overview", required: false, whenSubtype: ["architecture", "system-design"] },
    { heading: "System Components & Boundaries", required: false, whenSubtype: ["system-design"] },
    { heading: "Data Model Sketch", required: false, whenSubtype: ["system-design"] },
    { heading: "UX Surfaces & Flows", required: false, whenSubtype: ["ui"] },
    { heading: "Visual / Interaction Principles", required: false, whenSubtype: ["ui"] },
    { heading: "Constraints", required: true },
    { heading: "Success Criteria", required: true },
    { heading: "Child Epics", required: true },
  ],
  "epic": [
    { heading: "Parent Product Doc", required: true },
    { heading: "Summary", required: true },
    { heading: "Scope", required: true },
    { heading: "Out of Scope", required: true },
    { heading: "Architecture Decisions", required: false, whenSubtype: ["architecture"] },
    { heading: "Affected Modules / Surfaces", required: false, whenSubtype: ["architecture", "major-feature"] },
    { heading: "Feature Behavior", required: false, whenSubtype: ["major-feature"] },
    { heading: "UX Flows & States", required: false, whenSubtype: ["ui"] },
    { heading: "Component Inventory", required: false, whenSubtype: ["ui"] },
    { heading: "Exit Criteria", required: true },
    { heading: "Child User Stories", required: true },
  ],
  "user-story": [
    { heading: "Parent Epic", required: true },
    { heading: "Story", required: true },
    { heading: "Acceptance Criteria", required: true },
    { heading: "Architectural Constraints", required: false, whenSubtype: ["architecture"] },
    { heading: "Interface Contract", required: false, whenSubtype: ["interface-contract"] },
    { heading: "Data Shapes", required: false, whenSubtype: ["interface-contract"] },
    { heading: "UI States & Interactions", required: false, whenSubtype: ["ui"] },
    { heading: "Edge Cases", required: true },
    { heading: "Out of Scope", required: true },
    { heading: "Child Tasks", required: true },
  ],
  "task-high-pass": [
    { heading: "Parent User Story", required: true },
    { heading: "Goal", required: true },
    { heading: "Files to Create or Modify", required: true },
    { heading: "Scaffold Contract", required: true },
    { heading: "Types & Interfaces", required: true },
    { heading: "Cross-References", required: true },
    { heading: "Acceptance", required: true },
    { heading: "Hand-off to Low-Pass", required: true },
  ],
  "task-low-pass": [
    { heading: "Parent User Story", required: true },
    { heading: "Scaffold Source", required: true },
    { heading: "Files to Implement", required: true },
    { heading: "Implementation Notes", required: true },
    { heading: "Allowed Edits", required: true },
    { heading: "Acceptance", required: true },
    { heading: "Cross-References", required: true },
  ],
  "task-ui": [
    { heading: "Parent User Story", required: true },
    { heading: "Goal", required: true },
    { heading: "Acceptance", required: true },
  ],
};

/** `{{anything}}` templating tokens. */
const HANDLEBARS_RE = /\{\{[^}]+\}\}/;
/** Italic instructional prose used in templates: `_..._` on its own line. */
const INSTRUCTIONAL_RE = /^_[^_].*_$/m;
/** Bare `TBD`, `REQUIRED`, `CONDITIONAL`, `OPTIONAL` markers on their own line. */
const MARKER_RE = /^(TBD|REQUIRED|CONDITIONAL(?:\s*\([^)]*\))?|OPTIONAL)\s*$/m;

export const templateCompletenessGate: Gate = {
  name: "template-completeness",
  evaluate(doc: KatanaDocument, _ctx: GateContext): GateResult {
    const reasons: GateReason[] = [];
    const level = doc.frontmatter.level;
    if (!level || !SECTIONS_BY_LEVEL[level]) {
      return { gate: "template-completeness", ok: true, reasons }; // upstream gate handles invalid level
    }
    const subtype = (doc.frontmatter.subtype ?? null) as string | null;
    const rules = SECTIONS_BY_LEVEL[level]!;
    const sectionByHeading = new Map<string, DocumentSection>();
    for (const s of doc.sections) {
      if (s.depth === 2) sectionByHeading.set(s.heading, s);
    }

    for (const rule of rules) {
      const triggered = rule.required || rule.whenSubtype.includes(subtype);
      if (!triggered) continue;
      const section = sectionByHeading.get(rule.heading);
      if (!section) {
        reasons.push({
          code: "template.section-missing",
          message: `Section "## ${rule.heading}" is missing.`,
          severity: "error",
          pointer: `section:${rule.heading}`,
        });
        continue;
      }
      const body = section.body.trim();
      if (body === "") {
        reasons.push({
          code: "template.section-empty",
          message: `Section "## ${rule.heading}" is empty.`,
          severity: "error",
          pointer: `section:${rule.heading}`,
        });
        continue;
      }
      if (HANDLEBARS_RE.test(body)) {
        reasons.push({
          code: "template.placeholder-handlebars",
          message: `Section "## ${rule.heading}" still contains {{...}} placeholders.`,
          severity: "error",
          pointer: `section:${rule.heading}`,
        });
      }
      if (INSTRUCTIONAL_RE.test(body)) {
        reasons.push({
          code: "template.placeholder-instructional",
          message: `Section "## ${rule.heading}" still contains template instructional prose (_..._).`,
          severity: "error",
          pointer: `section:${rule.heading}`,
        });
      }
      if (MARKER_RE.test(body)) {
        reasons.push({
          code: "template.placeholder-marker",
          message: `Section "## ${rule.heading}" still contains a bare REQUIRED/CONDITIONAL/OPTIONAL/TBD marker.`,
          severity: "error",
          pointer: `section:${rule.heading}`,
        });
      }
    }

    const ok = !reasons.some((r) => r.severity === "error");
    return { gate: "template-completeness", ok, reasons };
  },
};
