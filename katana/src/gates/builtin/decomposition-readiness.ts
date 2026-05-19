import type { Gate, GateContext, GateReason, GateResult, KatanaDocument, DocumentSection } from "../types.js";

type DecompRule = {
  parentSection: string;          // depth-2 heading
  subsections?: string[];         // required depth-3 headings (empty if none)
  shortCodePattern: RegExp;       // valid child short codes
  expectedChildLevel: string;     // child doc level
};

const DECOMP_BY_LEVEL: Record<string, DecompRule> = {
  "product-doc": {
    parentSection: "Child Epics",
    shortCodePattern: /\b([A-Z][A-Z0-9]{1,9}-E-\d{4})\b/g,
    expectedChildLevel: "epic",
  },
  "epic": {
    parentSection: "Child User Stories",
    shortCodePattern: /\b([A-Z][A-Z0-9]{1,9}-US-\d{4})\b/g,
    expectedChildLevel: "user-story",
  },
  "user-story": {
    parentSection: "Child Tasks",
    subsections: ["High-pass", "Low-pass"],
    shortCodePattern: /\b([A-Z][A-Z0-9]{1,9}-(?:TH|TL|TU)-\d{4})\b/g,
    expectedChildLevel: "task-high-pass|task-low-pass|task-ui",
  },
};

export const decompositionReadinessGate: Gate = {
  name: "decomposition-readiness",
  evaluate(doc: KatanaDocument, ctx: GateContext): GateResult {
    const reasons: GateReason[] = [];
    const level = doc.frontmatter.level;
    if (!level) return { gate: "decomposition-readiness", ok: true, reasons };
    const rule = DECOMP_BY_LEVEL[level];
    if (!rule) return { gate: "decomposition-readiness", ok: true, reasons };

    const parentSection: DocumentSection | undefined = doc.sections.find(
      (s) => s.depth === 2 && s.heading === rule.parentSection,
    );
    if (!parentSection) {
      reasons.push({
        code: "decomp.section-missing",
        message: `Section "## ${rule.parentSection}" is missing.`,
        severity: "error",
        pointer: `section:${rule.parentSection}`,
      });
      return { gate: "decomposition-readiness", ok: false, reasons };
    }

    if (rule.subsections && rule.subsections.length > 0) {
      // Find depth-3 sections that follow the parent section in source order.
      const idx = doc.sections.indexOf(parentSection);
      const subs = new Set<string>();
      for (let i = idx + 1; i < doc.sections.length; i++) {
        const s = doc.sections[i]!;
        if (s.depth <= 2) break;
        if (s.depth === 3) subs.add(s.heading);
      }
      for (const required of rule.subsections) {
        if (!subs.has(required)) {
          reasons.push({
            code: "decomp.subsection-missing",
            message: `Section "## ${rule.parentSection}" is missing subsection "### ${required}".`,
            severity: "error",
            pointer: `section:${rule.parentSection}/${required}`,
          });
        }
      }
    }

    // Collect short codes from parentSection.body and (for user-story) from
    // subsequent depth-3 section bodies up to the next depth-2 heading.
    const idx = doc.sections.indexOf(parentSection);
    let combined = parentSection.body;
    for (let i = idx + 1; i < doc.sections.length; i++) {
      const s = doc.sections[i]!;
      if (s.depth <= 2) break;
      combined += "\n" + s.body;
    }
    const codes = new Set<string>();
    const re = new RegExp(rule.shortCodePattern.source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(combined)) !== null) {
      codes.add(m[1]!);
    }

    if (codes.size === 0) {
      reasons.push({
        code: "decomp.no-children",
        message: `Section "## ${rule.parentSection}" lists no child short codes.`,
        severity: "error",
        pointer: `section:${rule.parentSection}`,
      });
      return { gate: "decomposition-readiness", ok: false, reasons };
    }

    const expectedLevels = new Set(rule.expectedChildLevel.split("|"));
    const myCode = doc.frontmatter.short_code;
    for (const code of codes) {
      const child = ctx.lookup(code);
      if (!child) {
        reasons.push({
          code: "decomp.child-unresolved",
          message: `Listed child "${code}" not found in workspace.`,
          severity: "error",
          pointer: `section:${rule.parentSection}`,
        });
        continue;
      }
      const childLevel = child.frontmatter.level;
      if (!childLevel || !expectedLevels.has(childLevel)) {
        reasons.push({
          code: "decomp.child-wrong-level",
          message: `Child "${code}" has level "${String(childLevel)}", expected one of ${[...expectedLevels].join(", ")}.`,
          severity: "error",
          pointer: `section:${rule.parentSection}`,
        });
      }
      if (myCode && child.frontmatter.parent !== myCode) {
        reasons.push({
          code: "decomp.child-wrong-parent",
          message: `Child "${code}" parent is "${String(child.frontmatter.parent)}", expected "${myCode}".`,
          severity: "error",
          pointer: `section:${rule.parentSection}`,
        });
      }
    }

    const ok = !reasons.some((r) => r.severity === "error");
    return { gate: "decomposition-readiness", ok, reasons };
  },
};
