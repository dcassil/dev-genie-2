import { test } from "vitest";
import assert from "node:assert/strict";
import { formatJson, formatMarkdown } from "../../src/gates/reporters.js";

const sample = {
  ok: false,
  document: { path: "/x.md", short_code: "KAT-E-0001" as string | undefined },
  results: [
    { gate: "g1", ok: true, reasons: [] },
    {
      gate: "g2",
      ok: false,
      reasons: [{ code: "x.y", message: "m", severity: "error" as const, pointer: "p" }],
    },
  ],
};

test("formatJson is parseable and round-trips key fields", () => {
  const j = JSON.parse(formatJson(sample));
  assert.equal(j.ok, false);
  assert.equal(j.document.path, "/x.md");
  assert.equal(j.results.length, 2);
});

test("formatMarkdown lists each gate and indents reasons", () => {
  const md = formatMarkdown(sample);
  assert.match(md, /- \[x\] g1/);
  assert.match(md, /- \[ \] g2/);
  assert.match(md, /  - error x\.y — m \(p\)/);
});
