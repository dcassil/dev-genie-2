/**
 * SqliteStorage — default StoragePort backend.
 * - sqlite via better-sqlite3 (synchronous; wrap in async for port shape)
 * - markdown files on disk via src/storage/markdown
 * - short codes via src/short-code
 *
 * NOTE: sync engine (src/storage/sync.ts) reconciles file<->row drift; this
 * module always writes both the file and the row in one transaction.
 */
import Database from "better-sqlite3";
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Look up the seed body for a new document of `level` by reading the
 * level's `_base.md` template from the katana plugin's `templates/`
 * directory. We strip the YAML frontmatter — the storage layer writes
 * its own — and return only the markdown body.
 *
 * Templates ship inside the katana repo at `<repo>/templates/<level>/_base.md`.
 * Resolution is relative to this source file via import.meta.url so it
 * works when the plugin is installed at ${CLAUDE_PLUGIN_ROOT}/katana too.
 */
function loadTemplateBody(level: string): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // src/storage/sqlite/ -> repo root is three levels up.
  const repoRoot = path.resolve(here, "..", "..", "..");
  const tmplPath = path.join(repoRoot, "templates", level, "_base.md");
  if (!fs.existsSync(tmplPath)) return null;
  const raw = fs.readFileSync(tmplPath, "utf8");
  // Strip leading frontmatter block: `---\n...\n---\n?`.
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  return m ? m[1]!.trim() : raw.trim();
}
import { applyMigrations } from "./migrations/index.js";
import { createAllocator } from "../../short-code/index.js";
import { readMarkdown, writeMarkdown, computeHash, serialize } from "../markdown/index.js";
import {
  type StoragePort,
  type CreateDocumentInput,
  type ListFilter,
  type SearchFilter,
  type SearchHit,
  DocumentNotFound,
  DuplicateShortCode,
} from "../port.js";
import {
  type Document,
  type DocumentSummary,
  type Frontmatter,
  type ShortCode,
  PHASES_BY_LEVEL,
  TYPE_CODE_BY_LEVEL,
  asShortCode,
} from "../../types/document.js";

export interface SqliteStorageOptions {
  /** Workspace root (host repo root). The .katana/ subfolder is managed here. */
  workspaceRoot: string;
}

export function openSqliteStorage(opts: SqliteStorageOptions): StoragePort {
  const root = path.resolve(opts.workspaceRoot, ".katana");
  fs.mkdirSync(root, { recursive: true });

  const db = new Database(path.join(root, "katana.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const migrationsDir = path.join(path.dirname(new URL(import.meta.url).pathname), "migrations");
  applyMigrations(db, migrationsDir);

  const allocator = createAllocator(db);

  // Prepared statements
  const readStmt = db.prepare(
    "SELECT * FROM documents WHERE short_code = ? AND archived = 0",
  );
  const insertStmt = db.prepare(
    `INSERT INTO documents (
      filepath, id, title, document_type, short_code, subtype, phase,
      parent_short_code, archived, exit_criteria_met, pass, model_tier,
      scaffold_task, story_id, strategy_id, initiative_id, created_at,
      updated_at, file_hash, frontmatter_json, body
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )`,
  );
  const listStmt = db.prepare(
    `SELECT short_code, document_type AS level, title, phase,
            parent_short_code AS parent, archived, datetime(updated_at) AS updated_at
       FROM documents
      WHERE (:level IS NULL OR document_type = :level)
        AND (:phase IS NULL OR phase = :phase)
        AND (:parent IS NULL OR parent_short_code = :parent)
        AND (:include_archived = 1 OR archived = 0)
      ORDER BY updated_at DESC
      LIMIT :limit OFFSET :offset`,
  );
  const searchStmt = db.prepare(
    `SELECT d.short_code, d.document_type AS level, d.title, d.phase,
            d.parent_short_code AS parent, d.archived, datetime(d.updated_at) AS updated_at,
            bm25(document_search) AS rank,
            snippet(document_search, -1, '<<', '>>', '...', 12) AS snippet
       FROM document_search
       JOIN documents d ON d.filepath = document_search.document_filepath
      WHERE document_search MATCH :query
        AND (:level IS NULL OR d.document_type = :level)
        AND (:include_archived = 1 OR d.archived = 0)
      ORDER BY rank
      LIMIT :limit`,
  );
  const childrenStmt = db.prepare(
    `SELECT short_code, document_type AS level, title, phase,
            parent_short_code AS parent, archived, datetime(updated_at) AS updated_at
       FROM documents WHERE parent_short_code = ? AND archived = 0
      ORDER BY short_code`,
  );
  const updateFrontmatterStmt = db.prepare(
    `UPDATE documents
        SET frontmatter_json = @frontmatter_json,
            title             = @title,
            phase             = @phase,
            archived          = @archived,
            exit_criteria_met = @exit_criteria_met,
            subtype           = @subtype,
            pass              = @pass,
            model_tier        = @model_tier,
            scaffold_task     = @scaffold_task,
            parent_short_code = @parent_short_code,
            updated_at        = julianday('now')
      WHERE short_code = @short_code`,
  );
  const editBodyStmt = db.prepare(
    "UPDATE documents SET body = ?, file_hash = ?, updated_at = julianday('now') WHERE short_code = ?",
  );

  function getFilepath(level: string, short_code: string, initiative_id?: string): string {
    if (level === "product-doc") {
      return path.join(root, "product-docs", `${short_code}.md`);
    }
    const levelPlural =
      level === "epic"
        ? "epics"
        : level === "user-story"
          ? "user-stories"
          : level === "task-high-pass"
            ? "tasks-high-pass"
            : level === "task-low-pass"
              ? "tasks-low-pass"
              : level === "task-ui"
                ? "tasks-ui"
                : `${level}s`;
    return path.join(
      root,
      "strategies",
      "NULL",
      "initiatives",
      initiative_id || "default",
      levelPlural,
      `${short_code}.md`,
    );
  }

  function rowToSummary(row: any): DocumentSummary {
    return {
      short_code: asShortCode(row.short_code),
      level: row.level,
      title: row.title,
      phase: row.phase,
      parent: row.parent ? asShortCode(row.parent) : undefined,
      archived: row.archived === 1,
      updated_at: row.updated_at,
    };
  }

  function rowToDocument(row: any): Document {
    const fm = JSON.parse(row.frontmatter_json) as Frontmatter;
    return {
      frontmatter: fm,
      body: row.body,
      filepath: row.filepath,
      file_hash: row.file_hash,
    };
  }

  function sanitizeQuery(q: string): string {
    return q.replace(/[^A-Za-z0-9_ "]/g, " ").replace(/\s+/g, " ").trim();
  }

  function validatePhase(level: string, phase: string): void {
    const validPhases = PHASES_BY_LEVEL[level as any];
    if (!validPhases || !validPhases.includes(phase)) {
      throw new Error(`Invalid phase '${phase}' for level '${level}'`);
    }
  }

  return {
    async create(input: CreateDocumentInput): Promise<Document> {
      return new Promise((resolve, reject) => {
        try {
          const result = db.transaction(() => {
            const short_code = allocator.allocate(input.level);
            const now = Date.now() / 1000;
            const id = short_code.toLowerCase().replace(/-/g, "_");

            validatePhase(input.level, PHASES_BY_LEVEL[input.level][0]);

            const filepath = getFilepath(
              input.level,
              short_code as string,
              input.initiative_id,
            );

            const fm: Frontmatter = {
              id,
              level: input.level,
              title: input.title,
              short_code,
              subtype: input.subtype ?? null,
              created_at: new Date(now * 1000).toISOString(),
              updated_at: new Date(now * 1000).toISOString(),
              archived: false,
              tags: [`#${input.level}`, `#phase/${PHASES_BY_LEVEL[input.level][0]}`],
              exit_criteria_met: false,
              phase: PHASES_BY_LEVEL[input.level][0],
              parent: input.parent,
              pass: input.pass,
              model_tier: input.model_tier,
              scaffold_task: input.scaffold_task,
              strategy_id: input.strategy_id ?? undefined,
              initiative_id: input.initiative_id,
            };

            const body =
              input.body ??
              loadTemplateBody(input.level) ??
              `# ${input.title}\n`;
            const { file_hash, bytesWritten } = writeMarkdown(filepath, fm, body);

            insertStmt.run(
              filepath,
              id,
              input.title,
              input.level,
              short_code,
              input.subtype ?? null,
              fm.phase,
              input.parent ?? null,
              0,
              0,
              input.pass ?? null,
              input.model_tier ?? null,
              input.scaffold_task ?? null,
              null,
              input.strategy_id ?? null,
              input.initiative_id ?? null,
              now,
              now,
              file_hash,
              JSON.stringify(fm),
              body,
            );

            return {
              frontmatter: fm,
              body,
              filepath,
              file_hash,
            };
          })();
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });
    },

    async read(short_code: ShortCode): Promise<Document> {
      return new Promise((resolve, reject) => {
        try {
          const row = readStmt.get(short_code);
          if (!row) {
            reject(new DocumentNotFound(short_code));
            return;
          }
          resolve(rowToDocument(row));
        } catch (e) {
          reject(e);
        }
      });
    },

    async edit(
      short_code: ShortCode,
      search: string,
      replace: string,
      replace_all: boolean = false,
    ): Promise<Document> {
      return new Promise((resolve, reject) => {
        try {
          const result = db.transaction(() => {
            const row = readStmt.get(short_code);
            if (!row) {
              throw new DocumentNotFound(short_code);
            }
            let newBody = row.body;
            if (replace_all) {
              newBody = newBody.split(search).join(replace);
            } else {
              const idx = newBody.indexOf(search);
              if (idx === -1) {
                throw new Error(`Search text not found in document ${short_code}`);
              }
              newBody =
                newBody.slice(0, idx) +
                replace +
                newBody.slice(idx + search.length);
            }

            const fm = JSON.parse(row.frontmatter_json) as Frontmatter;
            const { file_hash } = writeMarkdown(row.filepath, fm, newBody);
            editBodyStmt.run(newBody, file_hash, short_code);

            return rowToDocument({
              ...row,
              body: newBody,
              file_hash,
            });
          })();
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });
    },

    async patchFrontmatter(
      short_code: ShortCode,
      patch: Partial<Frontmatter>,
    ): Promise<Document> {
      return new Promise((resolve, reject) => {
        try {
          const result = db.transaction(() => {
            const row = readStmt.get(short_code);
            if (!row) {
              throw new DocumentNotFound(short_code);
            }

            const fm = JSON.parse(row.frontmatter_json) as Frontmatter;
            const updated = { ...fm, ...patch };

            if (patch.phase && patch.phase !== fm.phase) {
              validatePhase(fm.level, patch.phase);
            }

            updated.updated_at = new Date().toISOString();

            const { file_hash } = writeMarkdown(row.filepath, updated, row.body);
            updateFrontmatterStmt.run({
              frontmatter_json: JSON.stringify(updated),
              title: updated.title,
              phase: updated.phase,
              archived: updated.archived ? 1 : 0,
              exit_criteria_met: updated.exit_criteria_met ? 1 : 0,
              subtype: updated.subtype ?? null,
              pass: updated.pass ?? null,
              model_tier: updated.model_tier ?? null,
              scaffold_task: updated.scaffold_task ?? null,
              parent_short_code: updated.parent ?? null,
              short_code,
            });

            return rowToDocument({
              ...row,
              frontmatter_json: JSON.stringify(updated),
              file_hash,
            });
          })();
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });
    },

    async list(filter?: ListFilter): Promise<DocumentSummary[]> {
      return new Promise((resolve, reject) => {
        try {
          const limit = filter?.limit ?? 100;
          const offset = filter?.offset ?? 0;
          const rows = listStmt.all({
            level: filter?.level ?? null,
            phase: filter?.phase ?? null,
            parent: filter?.parent ?? null,
            include_archived: filter?.include_archived ? 1 : 0,
            limit,
            offset,
          });
          resolve(rows.map((row: any) => rowToSummary(row)));
        } catch (e) {
          reject(e);
        }
      });
    },

    async search(filter: SearchFilter): Promise<SearchHit[]> {
      return new Promise((resolve, reject) => {
        try {
          const sanitized = sanitizeQuery(filter.query);
          if (!sanitized) {
            resolve([]);
            return;
          }
          const limit = filter.limit ?? 100;
          const rows = searchStmt.all({
            query: sanitized,
            level: filter.level ?? null,
            include_archived: filter.include_archived ? 1 : 0,
            limit,
          });
          resolve(
            rows.map((row: any) => ({
              ...rowToSummary(row),
              rank: row.rank,
              snippet: row.snippet,
            })),
          );
        } catch (e) {
          reject(e);
        }
      });
    },

    async children(parent: ShortCode): Promise<DocumentSummary[]> {
      return new Promise((resolve, reject) => {
        try {
          const rows = childrenStmt.all(parent);
          resolve(rows.map((row: any) => rowToSummary(row)));
        } catch (e) {
          reject(e);
        }
      });
    },

    close(): void {
      db.close();
    },
  };
}
