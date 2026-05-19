import { test } from "vitest";
import assert from "node:assert/strict";
import { parseDocument, parseSections } from "../../src/gates/loader.js";

test("parseDocument extracts frontmatter and body", () => {
  const raw = `---\nid: x\nlevel: epic\n---\n\n## H\n\nBody.\n`;
  const d = parseDocument("/x.md", raw);
  assert.equal(d.frontmatter.id, "x");
  assert.equal(d.frontmatter.level, "epic");
  assert.equal(d.sections.length, 1);
  assert.equal(d.sections[0]!.heading, "H");
});

test("parseDocument with malformed YAML returns empty frontmatter", () => {
  const raw = `---\n: : :\n---\n\n## H\n`;
  const d = parseDocument("/x.md", raw);
  assert.deepEqual(d.frontmatter, {});
});

test("parseSections respects depth", () => {
  const s = parseSections("## A\n\nbody A\n\n### A1\n\nsub\n\n## B\n\nbody B");
  assert.equal(s.length, 3);
  assert.equal(s[0]!.depth, 2);
  assert.equal(s[1]!.depth, 3);
  assert.equal(s[2]!.heading, "B");
});
