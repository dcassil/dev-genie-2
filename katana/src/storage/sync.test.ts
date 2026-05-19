import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { applyMigrations } from "./sqlite/migrations/index.js";
import { syncWorkspace } from "./sync.js";
import { writeMarkdown, computeHash } from "./markdown/index.js";
import type { Frontmatter } from "../types/document.js";
import { asShortCode } from "../types/document.js";

describe("syncWorkspace", () => {
  let tmpDir: string;
  let katanaDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "katana-sync-test-"));
    katanaDir = path.join(tmpDir, ".katana");
    fs.mkdirSync(katanaDir, { recursive: true });

    const dbPath = path.join(katanaDir, "test.db");
    db = new Database(dbPath);
    const migrationsDir = path.join(path.dirname(new URL(import.meta.url).pathname), "sqlite", "migrations");
    applyMigrations(db, migrationsDir);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("empty .katana/ + empty DB -> report all empty", () => {
    const report = syncWorkspace(db, katanaDir);
    expect(report.inserted).toEqual([]);
    expect(report.updated).toEqual([]);
    expect(report.skipped).toEqual([]);
    expect(report.orphaned).toEqual([]);
    expect(report.errors).toEqual([]);
  });

  it("one file, no row -> inserted; second run -> skipped", () => {
    const fm: Frontmatter = {
      id: "test_epic_0001",
      level: "epic",
      title: "Test Epic",
      short_code: asShortCode("TEST-E-0001"),
      subtype: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      archived: false,
      tags: [],
      exit_criteria_met: false,
      phase: "discovery",
    };

    const filePath = path.join(katanaDir, "epics", "TEST-E-0001.md");
    writeMarkdown(filePath, fm, "## Test content");

    // First run: should insert
    let report = syncWorkspace(db, katanaDir);
    expect(report.inserted.length).toBe(1);
    expect(report.updated).toEqual([]);
    expect(report.skipped).toEqual([]);
    expect(report.orphaned).toEqual([]);

    // Second run: should skip
    report = syncWorkspace(db, katanaDir);
    expect(report.inserted).toEqual([]);
    expect(report.updated).toEqual([]);
    expect(report.skipped.length).toBe(1);
    expect(report.orphaned).toEqual([]);
  });

  it("file edited on disk -> updated; row hash matches new on next run", () => {
    const fm: Frontmatter = {
      id: "test_epic_0002",
      level: "epic",
      title: "Test Epic",
      short_code: asShortCode("TEST-E-0002"),
      subtype: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      archived: false,
      tags: [],
      exit_criteria_met: false,
      phase: "discovery",
    };

    const filePath = path.join(katanaDir, "epics", "TEST-E-0002.md");
    writeMarkdown(filePath, fm, "## Original content");

    // First sync
    let report = syncWorkspace(db, katanaDir);
    expect(report.inserted.length).toBe(1);
    const firstHash = db.prepare("SELECT file_hash FROM documents WHERE short_code = ?").get("TEST-E-0002") as any;

    // Modify file on disk
    const newFm = { ...fm, updated_at: new Date().toISOString() };
    writeMarkdown(filePath, newFm, "## Modified content");

    // Second sync should detect change
    report = syncWorkspace(db, katanaDir);
    expect(report.updated.length).toBe(1);
    expect(report.skipped).toEqual([]);

    const secondHash = db.prepare("SELECT file_hash FROM documents WHERE short_code = ?").get("TEST-E-0002") as any;
    expect(firstHash.file_hash).not.toBe(secondHash.file_hash);

    // Third sync should skip
    report = syncWorkspace(db, katanaDir);
    expect(report.updated).toEqual([]);
    expect(report.skipped.length).toBe(1);
  });

  it("file deleted -> row marked archived (orphaned), never DELETEd", () => {
    const fm: Frontmatter = {
      id: "test_epic_0003",
      level: "epic",
      title: "Test Epic",
      short_code: asShortCode("TEST-E-0003"),
      subtype: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      archived: false,
      tags: [],
      exit_criteria_met: false,
      phase: "discovery",
    };

    const filePath = path.join(katanaDir, "epics", "TEST-E-0003.md");
    writeMarkdown(filePath, fm, "## Test content");

    // First sync
    let report = syncWorkspace(db, katanaDir);
    expect(report.inserted.length).toBe(1);

    // Delete file
    fs.unlinkSync(filePath);

    // Second sync should mark as archived
    report = syncWorkspace(db, katanaDir);
    expect(report.orphaned.length).toBe(1);

    // Verify row still exists but archived = 1
    const row = db.prepare("SELECT * FROM documents WHERE short_code = ?").get("TEST-E-0003") as any;
    expect(row).toBeDefined();
    expect(row.archived).toBe(1);
  });

  it("malformed frontmatter -> error captured, other files still processed", () => {
    // Create a valid file
    const fm: Frontmatter = {
      id: "test_epic_0004",
      level: "epic",
      title: "Valid Epic",
      short_code: asShortCode("TEST-E-0004"),
      subtype: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      archived: false,
      tags: [],
      exit_criteria_met: false,
      phase: "discovery",
    };

    const goodPath = path.join(katanaDir, "epics", "TEST-E-0004.md");
    writeMarkdown(goodPath, fm, "## Valid content");

    // Create a malformed file (invalid YAML)
    const badPath = path.join(katanaDir, "epics", "bad.md");
    fs.mkdirSync(path.dirname(badPath), { recursive: true });
    fs.writeFileSync(badPath, "---\ninvalid: yaml: content\n---\nBody", "utf8");

    const report = syncWorkspace(db, katanaDir);
    expect(report.errors.length).toBe(1);
    expect(report.errors[0].filepath).toBe(badPath);
    expect(report.inserted.length).toBe(1); // valid file still inserted
    expect(report.inserted[0]).toBe(goodPath);
  });
});
