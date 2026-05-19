import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { openSqliteStorage } from "../../src/storage/sqlite/index.js";
import { DocumentNotFound } from "../../src/storage/port.js";
import type { ShortCode } from "../../src/types/document.js";

describe("SqliteStorage", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "katana-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("create", () => {
    it("allocates short_code, writes file, inserts row", async () => {
      const storage = openSqliteStorage({ workspaceRoot: tempDir });
      try {
        const doc = await storage.create({
          level: "epic",
          title: "Test Epic",
          body: "This is a test epic.",
        });

        expect(doc.frontmatter.short_code).toMatch(/^KAT-E-\d{4}$/);
        expect(doc.frontmatter.title).toBe("Test Epic");
        expect(doc.body).toBe("This is a test epic.");
        expect(doc.frontmatter.phase).toBe("discovery");
        expect(fs.existsSync(doc.filepath)).toBe(true);
      } finally {
        storage.close();
      }
    });

    it("validates phase against PHASES_BY_LEVEL", async () => {
      const storage = openSqliteStorage({ workspaceRoot: tempDir });
      try {
        const doc = await storage.create({
          level: "task-high-pass",
          title: "Test Task",
        });
        expect(doc.frontmatter.phase).toBe("todo");
      } finally {
        storage.close();
      }
    });

    it("respects parent and initiative_id", async () => {
      const storage = openSqliteStorage({ workspaceRoot: tempDir });
      try {
        const parent = await storage.create({
          level: "epic",
          title: "Parent Epic",
        });

        const child = await storage.create({
          level: "user-story",
          title: "Child Story",
          parent: parent.frontmatter.short_code as ShortCode,
          initiative_id: "init-123",
        });

        expect(child.frontmatter.parent).toBe(parent.frontmatter.short_code);
        expect(child.frontmatter.initiative_id).toBe("init-123");
      } finally {
        storage.close();
      }
    });
  });

  describe("read", () => {
    it("returns full document with body", async () => {
      const storage = openSqliteStorage({ workspaceRoot: tempDir });
      try {
        const created = await storage.create({
          level: "epic",
          title: "Test Epic",
          body: "Epic body content.",
        });

        const read = await storage.read(created.frontmatter.short_code);
        expect(read.body).toBe("Epic body content.");
        expect(read.frontmatter.title).toBe("Test Epic");
      } finally {
        storage.close();
      }
    });

    it("throws DocumentNotFound for unknown short_code", async () => {
      const storage = openSqliteStorage({ workspaceRoot: tempDir });
      try {
        await expect(
          storage.read("KAT-E-9999" as ShortCode),
        ).rejects.toThrow(DocumentNotFound);
      } finally {
        storage.close();
      }
    });
  });

  describe("edit", () => {
    it("replaces first occurrence by default", async () => {
      const storage = openSqliteStorage({ workspaceRoot: tempDir });
      try {
        const doc = await storage.create({
          level: "epic",
          title: "Test",
          body: "foo bar foo",
        });

        const edited = await storage.edit(
          doc.frontmatter.short_code,
          "foo",
          "baz",
        );
        expect(edited.body).toBe("baz bar foo");
      } finally {
        storage.close();
      }
    });

    it("replaces all occurrences when replace_all=true", async () => {
      const storage = openSqliteStorage({ workspaceRoot: tempDir });
      try {
        const doc = await storage.create({
          level: "epic",
          title: "Test",
          body: "foo bar foo",
        });

        const edited = await storage.edit(
          doc.frontmatter.short_code,
          "foo",
          "baz",
          true,
        );
        expect(edited.body).toBe("baz bar baz");
      } finally {
        storage.close();
      }
    });

    it("throws if search text not found", async () => {
      const storage = openSqliteStorage({ workspaceRoot: tempDir });
      try {
        const doc = await storage.create({
          level: "epic",
          title: "Test",
          body: "content",
        });

        await expect(
          storage.edit(doc.frontmatter.short_code, "notfound", "replace"),
        ).rejects.toThrow();
      } finally {
        storage.close();
      }
    });
  });

  describe("patchFrontmatter", () => {
    it("updates arbitrary frontmatter fields", async () => {
      const storage = openSqliteStorage({ workspaceRoot: tempDir });
      try {
        const doc = await storage.create({
          level: "epic",
          title: "Original Title",
        });

        const patched = await storage.patchFrontmatter(
          doc.frontmatter.short_code,
          { title: "Updated Title", exit_criteria_met: true },
        );

        expect(patched.frontmatter.title).toBe("Updated Title");
        expect(patched.frontmatter.exit_criteria_met).toBe(true);
      } finally {
        storage.close();
      }
    });

    it("validates phase when transitioning", async () => {
      const storage = openSqliteStorage({ workspaceRoot: tempDir });
      try {
        const doc = await storage.create({
          level: "epic",
          title: "Test",
        });

        const patched = await storage.patchFrontmatter(
          doc.frontmatter.short_code,
          { phase: "design" },
        );
        expect(patched.frontmatter.phase).toBe("design");
      } finally {
        storage.close();
      }
    });

    it("rejects invalid phase", async () => {
      const storage = openSqliteStorage({ workspaceRoot: tempDir });
      try {
        const doc = await storage.create({
          level: "epic",
          title: "Test",
        });

        await expect(
          storage.patchFrontmatter(doc.frontmatter.short_code, {
            phase: "invalid_phase",
          }),
        ).rejects.toThrow();
      } finally {
        storage.close();
      }
    });
  });

  describe("list", () => {
    it("returns summaries without body", async () => {
      const storage = openSqliteStorage({ workspaceRoot: tempDir });
      try {
        await storage.create({
          level: "epic",
          title: "Epic 1",
          body: "Long body content...",
        });

        const summaries = await storage.list();
        expect(summaries.length).toBeGreaterThan(0);
        expect(summaries[0]).toHaveProperty("short_code");
        expect(summaries[0]).toHaveProperty("level");
        expect(summaries[0]).toHaveProperty("title");
        expect(summaries[0]).not.toHaveProperty("body");
      } finally {
        storage.close();
      }
    });

    it("filters by level", async () => {
      const storage = openSqliteStorage({ workspaceRoot: tempDir });
      try {
        await storage.create({
          level: "epic",
          title: "Epic",
        });
        await storage.create({
          level: "user-story",
          title: "Story",
        });

        const epics = await storage.list({ level: "epic" });
        expect(epics.every((s) => s.level === "epic")).toBe(true);
      } finally {
        storage.close();
      }
    });

    it("filters by phase", async () => {
      const storage = openSqliteStorage({ workspaceRoot: tempDir });
      try {
        const doc = await storage.create({
          level: "epic",
          title: "Epic",
        });
        await storage.patchFrontmatter(doc.frontmatter.short_code, {
          phase: "design",
        });

        const design = await storage.list({ phase: "design" });
        expect(design.every((s) => s.phase === "design")).toBe(true);
      } finally {
        storage.close();
      }
    });

    it("respects limit and offset", async () => {
      const storage = openSqliteStorage({ workspaceRoot: tempDir });
      try {
        for (let i = 0; i < 5; i++) {
          await storage.create({
            level: "epic",
            title: `Epic ${i}`,
          });
        }

        const page1 = await storage.list({ limit: 2, offset: 0 });
        expect(page1.length).toBe(2);

        const page2 = await storage.list({ limit: 2, offset: 2 });
        expect(page2.length).toBe(2);
        expect(page1[0].short_code).not.toBe(page2[0].short_code);
      } finally {
        storage.close();
      }
    });
  });

  describe("search", () => {
    it("performs full-text search", async () => {
      const storage = openSqliteStorage({ workspaceRoot: tempDir });
      try {
        await storage.create({
          level: "epic",
          title: "Authentication System",
          body: "Handle user login and session management.",
        });
        await storage.create({
          level: "epic",
          title: "Payment Processing",
          body: "Process credit card transactions securely.",
        });

        const results = await storage.search({
          query: "authentication",
        });

        expect(results.length).toBeGreaterThan(0);
        expect(results.some((r) => r.title.includes("Authentication"))).toBe(
          true,
        );
      } finally {
        storage.close();
      }
    });

    it("sanitizes query", async () => {
      const storage = openSqliteStorage({ workspaceRoot: tempDir });
      try {
        await storage.create({
          level: "epic",
          title: "Test",
          body: "Content here",
        });

        const results = await storage.search({
          query: "test!@#$%^&*()",
        });
        expect(Array.isArray(results)).toBe(true);
      } finally {
        storage.close();
      }
    });

    it("filters by level", async () => {
      const storage = openSqliteStorage({ workspaceRoot: tempDir });
      try {
        await storage.create({
          level: "epic",
          title: "Epic Title",
          body: "relevant",
        });
        await storage.create({
          level: "user-story",
          title: "Story Title",
          body: "relevant",
        });

        const epicsOnly = await storage.search({
          query: "relevant",
          level: "epic",
        });
        expect(epicsOnly.every((s) => s.level === "epic")).toBe(true);
      } finally {
        storage.close();
      }
    });

    it("includes rank and snippet", async () => {
      const storage = openSqliteStorage({ workspaceRoot: tempDir });
      try {
        await storage.create({
          level: "epic",
          title: "Authentication",
          body: "User authentication system",
        });

        const results = await storage.search({
          query: "authentication",
        });

        if (results.length > 0) {
          expect(results[0]).toHaveProperty("rank");
          expect(results[0]).toHaveProperty("snippet");
          expect(typeof results[0].rank).toBe("number");
          expect(typeof results[0].snippet).toBe("string");
        }
      } finally {
        storage.close();
      }
    });
  });

  describe("children", () => {
    it("returns children of a parent", async () => {
      const storage = openSqliteStorage({ workspaceRoot: tempDir });
      try {
        const parent = await storage.create({
          level: "epic",
          title: "Parent Epic",
        });

        const child1 = await storage.create({
          level: "user-story",
          title: "Child 1",
          parent: parent.frontmatter.short_code as ShortCode,
        });
        const child2 = await storage.create({
          level: "user-story",
          title: "Child 2",
          parent: parent.frontmatter.short_code as ShortCode,
        });

        const children = await storage.children(parent.frontmatter.short_code);
        expect(children.length).toBe(2);
        expect(children.map((c) => c.short_code).sort()).toEqual(
          [child1.frontmatter.short_code, child2.frontmatter.short_code].sort(),
        );
      } finally {
        storage.close();
      }
    });

    it("excludes archived children", async () => {
      const storage = openSqliteStorage({ workspaceRoot: tempDir });
      try {
        const parent = await storage.create({
          level: "epic",
          title: "Parent",
        });

        const child = await storage.create({
          level: "user-story",
          title: "Child",
          parent: parent.frontmatter.short_code as ShortCode,
        });

        await storage.patchFrontmatter(child.frontmatter.short_code, {
          archived: true,
        });

        const children = await storage.children(parent.frontmatter.short_code);
        expect(children.length).toBe(0);
      } finally {
        storage.close();
      }
    });
  });

  describe("close", () => {
    it("closes the database handle", async () => {
      const storage = openSqliteStorage({ workspaceRoot: tempDir });
      storage.close();
      // If close() didn't work, subsequent operations would fail
      await expect(storage.read("KAT-E-0001" as ShortCode)).rejects.toThrow();
    });
  });
});
