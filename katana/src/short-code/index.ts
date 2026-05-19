import type Database from "better-sqlite3";
import {
  type DocumentType,
  type ShortCode,
  type TypeCode,
  TYPE_CODE_BY_LEVEL,
  asShortCode,
} from "../types/document.js";

/**
 * Allocator returns the next short code for `level`.
 * Atomic: increments `short_code_counters.next_n` in the same transaction
 * as the caller's INSERT. Caller MUST run inside `db.transaction(...)`.
 */
export interface ShortCodeAllocator {
  /** Allocate next short_code for a level using the configured prefix. */
  allocate(level: DocumentType): ShortCode;
  /** Read the configured workspace prefix (e.g. 'KAT'). */
  prefix(): string;
}

const PREFIX_KEY = "project.prefix";
const PREFIX_REGEX = /^[A-Z][A-Z0-9]{1,9}$/;

export function createAllocator(db: Database.Database): ShortCodeAllocator {
  const getPrefixStmt = db.prepare("SELECT value FROM configuration WHERE key = ?");
  const incrStmt = db.prepare(
    "UPDATE short_code_counters SET next_n = next_n + 1 WHERE type_code = ? RETURNING next_n - 1 AS allocated",
  );
  return {
    prefix(): string {
      const row = getPrefixStmt.get(PREFIX_KEY) as { value: string } | undefined;
      const p = row?.value ?? "KAT";
      if (!PREFIX_REGEX.test(p)) throw new Error(`Invalid prefix in configuration: ${p}`);
      return p;
    },
    allocate(level: DocumentType): ShortCode {
      const code: TypeCode = TYPE_CODE_BY_LEVEL[level];
      if (!code) throw new Error(`Unknown level: ${level}`);
      const row = incrStmt.get(code) as { allocated: number } | undefined;
      if (!row) throw new Error(`No counter row for type_code=${code}`);
      if (row.allocated > 9999) throw new Error(`Short-code overflow for ${code}`);
      const n = String(row.allocated).padStart(4, "0");
      return asShortCode(`${this.prefix()}-${code}-${n}`);
    },
  };
}

export function setPrefix(db: Database.Database, prefix: string): void {
  if (!PREFIX_REGEX.test(prefix)) throw new Error(`Invalid prefix: ${prefix}`);
  db.prepare(
    `INSERT INTO configuration (key, value, updated_at)
     VALUES (?, ?, julianday('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = julianday('now')`,
  ).run("project.prefix", prefix);
}
