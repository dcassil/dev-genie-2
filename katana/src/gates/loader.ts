import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import type {
  DocumentFrontmatter,
  DocumentSection,
  KatanaDocument,
} from "./types.js";

/**
 * Frontmatter delimiter regex. The opening `---` must start at file column 0,
 * but the file may have leading HTML comments (test fixtures use these for
 * `<!-- expected-gate: ... -->` markers, and tools may prepend banners).
 */
const FRONTMATTER_RE = /^(?:<!--[\s\S]*?-->\s*)*---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** Heading regex. Matches `## Heading` or `### Heading`. */
const HEADING_RE = /^(#{2,6})\s+(.+?)\s*$/;

/**
 * Read a file from disk and parse into a KatanaDocument.
 * Throws if the file cannot be read.
 * Does NOT throw on malformed frontmatter — emits an empty frontmatter object.
 */
export function loadDocument(path: string): KatanaDocument {
  const raw = readFileSync(path, "utf8");
  return parseDocument(path, raw);
}

/**
 * Parse already-read file contents into a KatanaDocument.
 * Pure; no I/O.
 */
export function parseDocument(path: string, raw: string): KatanaDocument {
  const match = FRONTMATTER_RE.exec(raw);
  let frontmatter: DocumentFrontmatter = {};
  let body = raw;
  if (match) {
    const yamlBlock = match[1] ?? "";
    body = match[2] ?? "";
    try {
      const parsed = parseYaml(yamlBlock);
      if (parsed && typeof parsed === "object") {
        frontmatter = parsed as DocumentFrontmatter;
      }
    } catch {
      // Malformed YAML: leave frontmatter as {}; gates will flag it.
    }
  }
  const sections = parseSections(body);
  return { path, raw, frontmatter, body, sections };
}

/**
 * Split a markdown body into sections by `##` and deeper headings.
 * A section's body extends until the next heading of equal or shallower depth.
 */
export function parseSections(body: string): DocumentSection[] {
  // A section's body extends until the next heading of equal-or-shallower
  // depth. Deeper sub-headings (e.g. `### Foo` inside a `## Bar` section)
  // are kept inside their parent so template-completeness can see content
  // placed under sub-headings. Sections are emitted in document order.
  const lines = body.split(/\r?\n/);
  type Node = { heading: string; depth: number; bodyLines: string[]; out: number };
  const nodes: Node[] = [];
  const stack: Node[] = [];

  function closeDownTo(depth: number): void {
    while (stack.length > 0 && stack[stack.length - 1]!.depth >= depth) {
      stack.pop();
    }
  }

  for (const line of lines) {
    const m = HEADING_RE.exec(line);
    if (m) {
      const depth = m[1]!.length;
      closeDownTo(depth);
      const node: Node = { heading: m[2]!, depth, bodyLines: [], out: nodes.length };
      nodes.push(node);
      // Ancestor sections also see this heading as part of their body.
      for (const ancestor of stack) ancestor.bodyLines.push(line);
      stack.push(node);
    } else {
      for (const s of stack) s.bodyLines.push(line);
    }
  }
  return nodes.map((n) => ({
    heading: n.heading,
    depth: n.depth,
    body: n.bodyLines.join("\n").trim(),
  }));
}
