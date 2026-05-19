/**
 * Reconcile .katana/**\/*.md with the documents table.
 *  - File present, row absent     -> INSERT
 *  - File present, row hash diff  -> UPDATE
 *  - File present, row hash same  -> SKIP
 *  - File absent,  row present    -> mark archived = 1 (do NOT delete; archive is deferred)
 *
 * Idempotent: running twice in a row produces zero changes on the second run.
 */
import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as path from "node:path";
import { readMarkdown } from "./markdown/index.js";
import type { Frontmatter } from "../types/document.js";

export interface SyncReport {
  inserted: string[];   // filepaths
  updated: string[];
  skipped: string[];
  orphaned: string[];   // rows whose file disappeared
  errors: { filepath: string; error: string }[];
}

export function syncWorkspace(db: Database.Database, katanaDir: string): SyncReport {
  const report: SyncReport = { inserted: [], updated: [], skipped: [], orphaned: [], errors: [] };
  const onDisk = walk(katanaDir);                            // recursive .md walk
  const rows = db.prepare("SELECT filepath, file_hash FROM documents").all() as
    { filepath: string; file_hash: string }[];
  const rowMap = new Map(rows.map((r) => [r.filepath, r.file_hash]));

  const tx = db.transaction(() => {
    for (const fp of onDisk) {
      try {
        const doc = readMarkdown(fp);
        const prev = rowMap.get(fp);
        if (!prev) { upsert(db, doc); report.inserted.push(fp); }
        else if (prev !== doc.file_hash) { upsert(db, doc); report.updated.push(fp); }
        else { report.skipped.push(fp); }
        rowMap.delete(fp);
      } catch (e: any) {
        report.errors.push({ filepath: fp, error: String(e.message ?? e) });
      }
    }
    for (const orphan of rowMap.keys()) {
      db.prepare("UPDATE documents SET archived = 1 WHERE filepath = ?").run(orphan);
      report.orphaned.push(orphan);
    }
  });
  tx();
  return report;
}

function walk(root: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(root)) return out;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const fp = path.join(dir, ent.name);
      if (ent.isDirectory()) stack.push(fp);
      else if (ent.isFile() && fp.endsWith(".md")) out.push(fp);
    }
  }
  return out;
}

function upsert(db: Database.Database, doc: ReturnType<typeof readMarkdown>) {
  const { frontmatter: fm, body, filepath, file_hash } = doc;
  const now = Date.now() / 1000;

  // Parse tags and blocked_by from frontmatter for secondary table inserts
  const tags = fm.tags || [];
  const blockedBy = fm.blocked_by || [];

  db.prepare(`
    INSERT INTO documents (
      filepath, id, title, document_type, short_code, subtype, phase,
      parent_short_code, archived, exit_criteria_met, pass, model_tier,
      scaffold_task, story_id, strategy_id, initiative_id, created_at,
      updated_at, file_hash, frontmatter_json, body
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(filepath) DO UPDATE SET
      id = excluded.id,
      title = excluded.title,
      document_type = excluded.document_type,
      short_code = excluded.short_code,
      subtype = excluded.subtype,
      phase = excluded.phase,
      parent_short_code = excluded.parent_short_code,
      archived = excluded.archived,
      exit_criteria_met = excluded.exit_criteria_met,
      pass = excluded.pass,
      model_tier = excluded.model_tier,
      scaffold_task = excluded.scaffold_task,
      story_id = excluded.story_id,
      strategy_id = excluded.strategy_id,
      initiative_id = excluded.initiative_id,
      updated_at = excluded.updated_at,
      file_hash = excluded.file_hash,
      frontmatter_json = excluded.frontmatter_json,
      body = excluded.body
  `).run(
    filepath,
    fm.id,
    fm.title,
    fm.level,
    fm.short_code,
    fm.subtype ?? null,
    fm.phase,
    fm.parent ?? null,
    fm.archived ? 1 : 0,
    fm.exit_criteria_met ? 1 : 0,
    fm.pass ?? null,
    fm.model_tier ?? null,
    fm.scaffold_task ?? null,
    fm.story_id ?? null,
    fm.strategy_id ?? null,
    fm.initiative_id ?? null,
    fm.created_at,
    fm.updated_at,
    file_hash,
    JSON.stringify(fm),
    body,
  );

  // Sync tags: delete old, insert new
  db.prepare("DELETE FROM document_tags WHERE document_filepath = ?").run(filepath);
  if (tags.length > 0) {
    const insertTag = db.prepare("INSERT INTO document_tags (document_filepath, tag) VALUES (?, ?)");
    for (const tag of tags) {
      insertTag.run(filepath, tag);
    }
  }

  // Sync blocked_by: delete old, insert new
  db.prepare("DELETE FROM document_blocked_by WHERE document_filepath = ?").run(filepath);
  if (blockedBy.length > 0) {
    const insertBlocked = db.prepare("INSERT INTO document_blocked_by (document_filepath, blocker_short_code) VALUES (?, ?)");
    for (const blocker of blockedBy) {
      insertBlocked.run(filepath, blocker);
    }
  }
}
