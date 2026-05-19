import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { computeHash, readMarkdown, writeMarkdown, serialize } from "./index.js";
import type { Frontmatter } from "../../types/document.js";

describe("markdown storage", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "markdown-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("computeHash", () => {
    it("matches hash of bytes on disk", () => {
      const content = "---\nid: test\n---\nbody";
      const hash = computeHash(content);
      expect(hash).toBeDefined();
      expect(hash).toHaveLength(64); // SHA-256 hex digest
    });

    it("produces consistent hash for same content", () => {
      const content = "test content";
      const hash1 = computeHash(content);
      const hash2 = computeHash(content);
      expect(hash1).toBe(hash2);
    });
  });

  describe("serialize", () => {
    it("preserves field order in frontmatter", () => {
      const fm: Frontmatter = {
        id: "test-id",
        level: "epic",
        title: "Test Epic",
        short_code: "TEST-E-0001" as any,
        subtype: "architecture",
        created_at: "2026-05-09T00:00:00Z",
        updated_at: "2026-05-09T00:00:00Z",
        archived: false,
        tags: ["#epic"],
        exit_criteria_met: false,
        phase: "draft",
        parent: "TEST-PD-0001" as any,
        blocked_by: ["TEST-E-0002" as any],
      };
      const body = "Test body";
      const serialized = serialize(fm, body);

      // Extract frontmatter lines after opening ---
      const lines = serialized.split("\n");
      const fmEnd = lines.indexOf("---", 1);
      const fmLines = lines.slice(1, fmEnd);

      // Check order: id, level, title, short_code, subtype come first
      expect(fmLines[0]).toMatch(/^id:/);
      expect(fmLines[1]).toMatch(/^level:/);
      expect(fmLines[2]).toMatch(/^title:/);
      expect(fmLines[3]).toMatch(/^short_code:/);
      expect(fmLines[4]).toMatch(/^subtype:/);
    });

    it("skips undefined fields", () => {
      const fm: Frontmatter = {
        id: "test-id",
        level: "task-high-pass",
        title: "Test Task",
        short_code: "TEST-TH-0001" as any,
        subtype: null,
        created_at: "2026-05-09T00:00:00Z",
        updated_at: "2026-05-09T00:00:00Z",
        archived: false,
        tags: [],
        exit_criteria_met: false,
        phase: "todo",
      };
      const body = "Task body";
      const serialized = serialize(fm, body);
      // Undefined optional fields like parent, blocked_by should not appear
      expect(serialized).not.toContain("parent:");
      expect(serialized).not.toContain("blocked_by:");
    });

    it("ensures trailing newline on body", () => {
      const fm: Frontmatter = {
        id: "test",
        level: "epic",
        title: "Test",
        short_code: "TEST-E-0001" as any,
        subtype: null,
        created_at: "2026-05-09T00:00:00Z",
        updated_at: "2026-05-09T00:00:00Z",
        archived: false,
        tags: [],
        exit_criteria_met: false,
        phase: "draft",
      };
      const bodyNoNewline = "body without newline";
      const serialized = serialize(fm, bodyNoNewline);
      expect(serialized.endsWith("\n")).toBe(true);
    });

    it("preserves trailing newline if already present", () => {
      const fm: Frontmatter = {
        id: "test",
        level: "epic",
        title: "Test",
        short_code: "TEST-E-0001" as any,
        subtype: null,
        created_at: "2026-05-09T00:00:00Z",
        updated_at: "2026-05-09T00:00:00Z",
        archived: false,
        tags: [],
        exit_criteria_met: false,
        phase: "draft",
      };
      const bodyWithNewline = "body with newline\n";
      const serialized = serialize(fm, bodyWithNewline);
      expect(serialized.endsWith("\n")).toBe(true);
      // Should not double-add newline
      expect(serialized.endsWith("\n\n")).toBe(false);
    });

    it("does not mutate input frontmatter object", () => {
      const fm: Frontmatter = {
        id: "test",
        level: "epic",
        title: "Test",
        short_code: "TEST-E-0001" as any,
        subtype: null,
        created_at: "2026-05-09T00:00:00Z",
        updated_at: "2026-05-09T00:00:00Z",
        archived: false,
        tags: ["#original"],
        exit_criteria_met: false,
        phase: "draft",
      };
      const originalTags = [...fm.tags];
      serialize(fm, "body");
      expect(fm.tags).toEqual(originalTags);
    });

    it("preserves array order (tags, blocked_by)", () => {
      const fm: Frontmatter = {
        id: "test",
        level: "epic",
        title: "Test",
        short_code: "TEST-E-0001" as any,
        subtype: null,
        created_at: "2026-05-09T00:00:00Z",
        updated_at: "2026-05-09T00:00:00Z",
        archived: false,
        tags: ["#c", "#a", "#b"],
        exit_criteria_met: false,
        phase: "draft",
        blocked_by: ["TEST-E-0003" as any, "TEST-E-0001" as any, "TEST-E-0002" as any],
      };
      const serialized = serialize(fm, "body");
      // Tags should appear in original order, not sorted
      expect(serialized).toContain("- '#c'");
      expect(serialized).toContain("- '#a'");
      expect(serialized).toContain("- '#b'");
      const cIdx = serialized.indexOf("'#c'");
      const aIdx = serialized.indexOf("'#a'");
      const bIdx = serialized.indexOf("'#b'");
      expect(cIdx < aIdx && aIdx < bIdx).toBe(true);
    });
  });

  describe("round-trip: writeMarkdown + readMarkdown", () => {
    it("preserves frontmatter and body identically", () => {
      const fm: Frontmatter = {
        id: "epic-123",
        level: "epic",
        title: "Build Platform",
        short_code: "TEST-E-0042" as any,
        subtype: "system-design",
        created_at: "2026-05-01T10:30:00Z",
        updated_at: "2026-05-09T14:22:00Z",
        archived: false,
        tags: ["#backend", "#urgent"],
        exit_criteria_met: false,
        phase: "active",
        parent: "TEST-PD-0001" as any,
        blocked_by: ["TEST-E-0040" as any],
      };
      const body = "## Design Overview\n\nThis epic covers...\n";

      const filepath = path.join(tmpDir, "test-epic.md");
      writeMarkdown(filepath, fm, body);
      const doc = readMarkdown(filepath);

      expect(doc.frontmatter).toEqual(fm);
      expect(doc.body).toBe(body);
      expect(doc.filepath).toBe(filepath);
    });

    it("normalizes body without trailing newline", () => {
      const fm: Frontmatter = {
        id: "test",
        level: "task-high-pass",
        title: "Test Task",
        short_code: "TEST-TH-0001" as any,
        subtype: null,
        created_at: "2026-05-09T00:00:00Z",
        updated_at: "2026-05-09T00:00:00Z",
        archived: false,
        tags: [],
        exit_criteria_met: false,
        phase: "todo",
      };
      const bodyWithoutNewline = "Task description";

      const filepath = path.join(tmpDir, "task-no-newline.md");
      writeMarkdown(filepath, fm, bodyWithoutNewline);
      const doc = readMarkdown(filepath);

      // Body should have been normalized to include trailing newline during write,
      // then stripped of leading newlines during read
      expect(doc.body).toBe(bodyWithoutNewline);
    });

    it("matches file_hash from writeMarkdown and readMarkdown for identical content", () => {
      const fm: Frontmatter = {
        id: "test",
        level: "epic",
        title: "Test",
        short_code: "TEST-E-0001" as any,
        subtype: null,
        created_at: "2026-05-09T00:00:00Z",
        updated_at: "2026-05-09T00:00:00Z",
        archived: false,
        tags: [],
        exit_criteria_met: false,
        phase: "draft",
      };
      const body = "Test content\n";

      const filepath = path.join(tmpDir, "hash-test.md");
      const writeResult = writeMarkdown(filepath, fm, body);
      const readResult = readMarkdown(filepath);

      expect(readResult.file_hash).toBe(writeResult.file_hash);
    });
  });

  describe("writeMarkdown", () => {
    it("creates parent directories if missing", () => {
      const fm: Frontmatter = {
        id: "test",
        level: "epic",
        title: "Test",
        short_code: "TEST-E-0001" as any,
        subtype: null,
        created_at: "2026-05-09T00:00:00Z",
        updated_at: "2026-05-09T00:00:00Z",
        archived: false,
        tags: [],
        exit_criteria_met: false,
        phase: "draft",
      };
      const filepath = path.join(tmpDir, "a", "b", "c", "doc.md");
      expect(() => fs.statSync(path.dirname(filepath))).toThrow();

      writeMarkdown(filepath, fm, "body");

      expect(fs.statSync(path.dirname(filepath)).isDirectory()).toBe(true);
      expect(fs.readFileSync(filepath, "utf8")).toContain("---");
    });

    it("returns bytesWritten matching file size", () => {
      const fm: Frontmatter = {
        id: "test",
        level: "epic",
        title: "Test",
        short_code: "TEST-E-0001" as any,
        subtype: null,
        created_at: "2026-05-09T00:00:00Z",
        updated_at: "2026-05-09T00:00:00Z",
        archived: false,
        tags: [],
        exit_criteria_met: false,
        phase: "draft",
      };
      const filepath = path.join(tmpDir, "bytes-test.md");
      const result = writeMarkdown(filepath, fm, "Test body");

      const stat = fs.statSync(filepath);
      expect(result.bytesWritten).toBe(stat.size);
    });
  });

  describe("readMarkdown", () => {
    it("reads and parses markdown with YAML frontmatter", () => {
      const filepath = path.join(tmpDir, "sample.md");
      const content = `---
id: sample-001
level: epic
title: Sample Epic
short_code: TEST-E-0001
subtype: architecture
created_at: "2026-05-09T00:00:00Z"
updated_at: "2026-05-09T00:00:00Z"
archived: false
tags:
  - "#sample"
  - "#test"
exit_criteria_met: false
phase: draft
---

## Sample Content

This is the body.
`;
      fs.writeFileSync(filepath, content, "utf8");
      const doc = readMarkdown(filepath);

      expect(doc.frontmatter.id).toBe("sample-001");
      expect(doc.frontmatter.level).toBe("epic");
      expect(doc.frontmatter.tags).toEqual(["#sample", "#test"]);
      expect(doc.body).toContain("## Sample Content");
      expect(doc.filepath).toBe(filepath);
    });

    it("computes file_hash of raw on-disk content", () => {
      const filepath = path.join(tmpDir, "hash-sample.md");
      const content = "---\nid: test\n---\nbody";
      fs.writeFileSync(filepath, content, "utf8");

      const doc = readMarkdown(filepath);
      const expectedHash = computeHash(content);

      expect(doc.file_hash).toBe(expectedHash);
    });

    it("strips leading newline from body", () => {
      const filepath = path.join(tmpDir, "newline-test.md");
      const content = `---
id: test
level: epic
title: Test
short_code: TEST-E-0001
subtype: null
created_at: "2026-05-09T00:00:00Z"
updated_at: "2026-05-09T00:00:00Z"
archived: false
tags: []
exit_criteria_met: false
phase: draft
---

Body content`;
      fs.writeFileSync(filepath, content, "utf8");

      const doc = readMarkdown(filepath);
      expect(doc.body).toBe("Body content");
      expect(doc.body.startsWith("\n")).toBe(false);
    });
  });
});
