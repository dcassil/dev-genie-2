import type {
  DocumentFrontmatter,
  Gate,
  GateContext,
  GateReason,
  GateResult,
  KatanaDocument,
} from "../types.js";

const PHASES_BY_LEVEL: Record<string, ReadonlyArray<string>> = {
  "product-doc": ["draft", "review", "published"],
  "epic": ["discovery", "design", "ready", "active", "completed"],
  "user-story": ["discovery", "design", "ready", "active", "completed"],
  "task-high-pass": ["todo", "active", "completed"],
  "task-low-pass": ["todo", "active", "completed"],
  "task-ui": ["todo", "active", "completed"],
};

const SUBTYPES_BY_LEVEL: Record<string, ReadonlyArray<string | null>> = {
  "product-doc": ["architecture", "system-design", "ui", null],
  "epic": ["architecture", "major-feature", "ui", null],
  "user-story": ["architecture", "interface-contract", "ui", null],
  "task-high-pass": [null],
  "task-low-pass": [null],
  "task-ui": [null],
};

const CONDITIONAL_FIELDS: Record<string, Record<string, string | null>> = {
  "task-high-pass": { pass: "high", model_tier: "strong", story_id: null },
  "task-low-pass": { pass: "low", model_tier: "cheap", story_id: null, scaffold_task: null },
  "task-ui": { model_tier: "ui", story_id: null },
};

const REQUIRED_COMMON: ReadonlyArray<keyof DocumentFrontmatter> = [
  "id",
  "level",
  "title",
  "short_code",
  "created_at",
  "updated_at",
  "tags",
  "exit_criteria_met",
  "phase",
];

export const frontmatterSchemaGate: Gate = {
  name: "frontmatter-schema",
  evaluate(doc: KatanaDocument, _ctx: GateContext): GateResult {
    const reasons: GateReason[] = [];
    const fm = doc.frontmatter;

    // 1. Required common fields
    for (const field of REQUIRED_COMMON) {
      const v = fm[field];
      if (v === undefined || v === null || v === "") {
        reasons.push({
          code: "frontmatter.missing-field",
          message: `Required field "${field}" is missing or empty.`,
          severity: "error",
          pointer: `frontmatter.${field}`,
        });
      }
    }

    // 2. Level
    const level = fm.level;
    if (level === undefined) {
      // already covered by missing-field
    } else if (!(level in PHASES_BY_LEVEL)) {
      reasons.push({
        code: "frontmatter.invalid-level",
        message: `level "${level}" is not a valid Katana level.`,
        severity: "error",
        pointer: "frontmatter.level",
      });
    } else {
      // 3. Phase ∈ allowed phases for level
      const phase = fm.phase;
      if (phase !== undefined && !PHASES_BY_LEVEL[level]!.includes(phase)) {
        reasons.push({
          code: "frontmatter.invalid-phase-for-level",
          message: `phase "${phase}" is not valid for level "${level}".`,
          severity: "error",
          pointer: "frontmatter.phase",
        });
      }
      // 4. Subtype validation
      if (!("subtype" in fm)) {
        reasons.push({
          code: "frontmatter.missing-field",
          message: `Required field "subtype" is missing.`,
          severity: "error",
          pointer: "frontmatter.subtype",
        });
      } else {
        const allowed = SUBTYPES_BY_LEVEL[level]!;
        const sub = fm.subtype ?? null;
        if (!allowed.includes(sub as string | null)) {
          reasons.push({
            code: "frontmatter.invalid-subtype-for-level",
            message: `subtype "${String(sub)}" is not valid for level "${level}".`,
            severity: "error",
            pointer: "frontmatter.subtype",
          });
        }
      }
      // 5. Parent presence
      if (level !== "product-doc" && (!fm.parent || fm.parent === "")) {
        reasons.push({
          code: "frontmatter.missing-parent",
          message: `level "${level}" requires a parent short code.`,
          severity: "error",
          pointer: "frontmatter.parent",
        });
      }
      // 6. Conditional fields
      const cond = CONDITIONAL_FIELDS[level];
      if (cond) {
        for (const [field, expected] of Object.entries(cond)) {
          const actual = (fm as Record<string, unknown>)[field];
          if (actual === undefined || actual === null || actual === "") {
            reasons.push({
              code: "frontmatter.missing-conditional-field",
              message: `level "${level}" requires field "${field}".`,
              severity: "error",
              pointer: `frontmatter.${field}`,
            });
          } else if (expected !== null && actual !== expected) {
            reasons.push({
              code: "frontmatter.invalid-conditional-value",
              message: `level "${level}" requires "${field}" === "${expected}", got "${String(actual)}".`,
              severity: "error",
              pointer: `frontmatter.${field}`,
            });
          }
        }
      }
      // 7. Tag invariants
      const tags = fm.tags;
      if (tags !== undefined) {
        if (!Array.isArray(tags) || !tags.every((t) => typeof t === "string")) {
          reasons.push({
            code: "frontmatter.tags-not-array",
            message: `tags must be an array of strings.`,
            severity: "error",
            pointer: "frontmatter.tags",
          });
        } else {
          if (!tags.includes(`#${level}`)) {
            reasons.push({
              code: "frontmatter.tag-mismatch",
              message: `tags must include "#${level}".`,
              severity: "error",
              pointer: "frontmatter.tags",
            });
          }
          if (fm.phase && !tags.includes(`#phase/${fm.phase}`)) {
            reasons.push({
              code: "frontmatter.tag-mismatch",
              message: `tags must include "#phase/${fm.phase}".`,
              severity: "error",
              pointer: "frontmatter.tags",
            });
          }
        }
      }
    }

    const ok = !reasons.some((r) => r.severity === "error");
    return { gate: "frontmatter-schema", ok, reasons };
  },
};

export default frontmatterSchemaGate;
