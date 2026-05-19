/** Migration runner. Reads numbered .sql files and applies any not in schema_migrations. */
import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as path from "node:path";

export interface Migration { version: number; sql: string; filename: string; }

export function loadMigrations(dir: string): Migration[] {
  return fs.readdirSync(dir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort()
    .map((f) => ({
      version: parseInt(f.slice(0, 4), 10),
      sql: fs.readFileSync(path.join(dir, f), "utf8"),
      filename: f,
    }));
}

export function applyMigrations(db: Database.Database, migrationsDir: string): number[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY NOT NULL,
    applied_at REAL NOT NULL DEFAULT (julianday('now'))
  );`);
  const applied = new Set<number>(
    db.prepare("SELECT version FROM schema_migrations").all().map((r: any) => r.version),
  );
  const runs: number[] = [];
  for (const m of loadMigrations(migrationsDir)) {
    if (applied.has(m.version)) continue;
    db.exec("BEGIN");
    try { db.exec(m.sql); db.exec("COMMIT"); runs.push(m.version); }
    catch (e) { db.exec("ROLLBACK"); throw e; }
  }
  return runs;
}
