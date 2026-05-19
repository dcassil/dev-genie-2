import { test } from "vitest";
import assert from "node:assert/strict";
import { runGates } from "../../src/gates/runner.js";
import { createContext } from "../../src/gates/context.js";
import type { Gate, KatanaDocument } from "../../src/gates/types.js";

const fakeDoc: KatanaDocument = {
  path: "/tmp/x.md",
  raw: "",
  frontmatter: { short_code: "KAT-E-0001" },
  body: "",
  sections: [],
};

test("runner converts thrown gates into gate.threw reasons", () => {
  const bad: Gate = {
    name: "bad",
    evaluate() {
      throw new Error("boom");
    },
  };
  const r = runGates([bad], fakeDoc, createContext([]));
  assert.equal(r.ok, false);
  assert.equal(r.results[0]!.reasons[0]!.code, "gate.threw");
});

test("runner ok is true iff every result.ok is true", () => {
  const ok: Gate = { name: "ok", evaluate: () => ({ gate: "ok", ok: true, reasons: [] }) };
  const r = runGates([ok, ok], fakeDoc, createContext([]));
  assert.equal(r.ok, true);
});
