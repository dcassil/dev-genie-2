import { test } from "vitest";
import assert from "node:assert/strict";
import { runGates } from "../../src/gates/runner.js";
import { frontmatterSchemaGate } from "../../src/gates/builtin/frontmatter-schema.js";
import { shortCodeFormatGate } from "../../src/gates/builtin/short-code-format.js";
import { templateCompletenessGate } from "../../src/gates/builtin/template-completeness.js";
import { parentReadinessGate } from "../../src/gates/builtin/parent-readiness.js";
import { phaseTransitionExitCriteriaGate } from "../../src/gates/builtin/phase-transition-exit-criteria.js";
import { decompositionReadinessGate } from "../../src/gates/builtin/decomposition-readiness.js";
import { loadAllPassFixtures, loadAllFailFixtures, ctxFromAll } from "./helpers.js";

const ALL_GATES = [
  frontmatterSchemaGate,
  shortCodeFormatGate,
  templateCompletenessGate,
  parentReadinessGate,
  phaseTransitionExitCriteriaGate,
  decompositionReadinessGate,
];
const GATE_BY_NAME = new Map(ALL_GATES.map((g) => [g.name, g]));
// Fixture comments use shorter aliases for gates.
const GATE_ALIASES: Record<string, string> = {
  "decomp-schema": "decomposition-readiness",
  "exit-schema": "phase-transition-exit-criteria",
  "parent-schema": "parent-readiness",
  "short-code-schema": "short-code-format",
  "template-schema": "template-completeness",
};
for (const [alias, name] of Object.entries(GATE_ALIASES)) {
  const g = GATE_BY_NAME.get(name);
  if (g) GATE_BY_NAME.set(alias, g);
}

test("every pass fixture passes every gate", () => {
  const ctx = ctxFromAll();
  for (const doc of loadAllPassFixtures()) {
    const report = runGates(ALL_GATES, doc, ctx);
    if (!report.ok) {
      const failed = report.results.filter((r) => !r.ok);
      assert.fail(
        `pass fixture ${doc.path} failed: ` +
          failed.map((r) => `${r.gate}=[${r.reasons.map((x) => x.code).join(",")}]`).join("; "),
      );
    }
  }
});

test("every fail fixture triggers its declared gate and code", () => {
  const ctx = ctxFromAll();
  for (const fix of loadAllFailFixtures()) {
    const gate = GATE_BY_NAME.get(fix.expectedGate);
    assert.ok(gate, `unknown expected-gate "${fix.expectedGate}" in ${fix.path}`);
    const result = gate!.evaluate(fix.doc, ctx);
    assert.equal(result.ok, false, `${fix.path}: ${gate!.name} should fail`);
    const codes = result.reasons.filter((r) => r.severity === "error").map((r) => r.code);
    assert.ok(
      codes.includes(fix.expectedCode),
      `${fix.path}: expected error code "${fix.expectedCode}", got [${codes.join(", ")}]`,
    );
  }
});
