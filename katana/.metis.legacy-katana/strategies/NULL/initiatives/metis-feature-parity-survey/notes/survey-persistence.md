# Persistence Layer Survey

## C1: Document storage layout

- **What metis provides:** Markdown files with YAML frontmatter in `.metis/strategies/<STRATEGY>/<TYPE>/<INSTANCE>/`, mirrored to sqlite (`metis.db`). The `documents` table indexes files for search, phase tracking, and metadata (id, title, document_type, short_code, archived, phase, exit_criteria_met).

- **Implementation:** Documents in `.md` format with YAML frontmatter followed by content. SQLite `documents` table (filepath as PK) holds denormalized frontmatter: id, title, document_type, created_at, updated_at, archived, phase, short_code, file_hash. Indexed on type, phase, short_code; UNIQUE(document_type, short_code) constraint.

- **Evidence:** 
  - `.metis/strategies/NULL/initiatives/metis-feature-parity-survey/tasks/KAT-T-0040.md`
  - `sqlite3 .metis/metis.db ".schema documents"` 
  - `.metis/config.toml` prefix and flight_levels settings

- **Katana need:** MVP-required. Two-pass task model needs document hierarchy, short codes, and phase tracking for model dispatch and gates.

- **Decision:** Inherit

- **Rationale:** Markdown + sqlite mirror directly solves katana's doc-driven workflow need. Frontmatter provides rich metadata. Hierarchical layout matches Product Doc → Epic → Story → Task tree. Offline editing + version control friendly.

- **If Inherit — files/modules to copy:** Unknown — to investigate. Need: directory builder, frontmatter parser, sqlite migrations, sync logic.

- **Risks / open questions:**
  - How do two-pass task variants (high-pass, low-pass) map to document storage?
  - How does file_hash interact with agent-driven updates?
  - Is archive directory mirroring MVP or post-MVP?

## C2: Short codes

- **What metis provides:** Format `<PREFIX>-<TYPE>-<NNNN>` (e.g., KAT-V-0001, KAT-I-0008, KAT-T-0040). Prefix is global config; type segment (V, I, T) is per document_type; numeric suffix auto-incremented per type. UNIQUE(document_type, short_code) enforces per-type uniqueness. Indexed column for cross-references.

- **Implementation:** `short_code` column in `documents` table. Prefix from `.metis/config.toml` ([project] prefix). Type-scoped counter allocates next NNNN. Frontmatter includes short_code field; parent references use short_code (e.g., `parent: KAT-I-0008`).

- **Evidence:** 
  - `.metis/config.toml` prefix = "KAT"
  - `sqlite3 .metis/metis.db ".schema documents"` shows `UNIQUE(document_type, short_code)` and `idx_documents_short_code`
  - Observed: KAT-V-0001, KAT-I-0001–0008, KAT-T-0001–0046
  - Frontmatter: KAT-T-0040.md `parent: KAT-I-0008`

- **Katana need:** MVP-required. Enables stable cross-references, agent-friendly identifiers, decompose/search operations.

- **Decision:** Inherit

- **Rationale:** Allocation and per-type uniqueness solve katana's document-identity need. UNIQUE constraint prevents collisions. Prefix config supports multi-project instances. Simple human-readable format.

- **If Inherit — files/modules to copy:** Unknown. Need: format parser, per-type counter logic, uniqueness enforcement at create time.

- **Risks / open questions:**
  - Concurrent agent document creation: does UNIQUE constraint block or error?
  - How do two-pass task variants (HP, LP) map to short codes? Separate documents or format extension?
  - Counter storage location (configuration vs. separate table)?

## C3: Sync

- **What metis provides:** `metis sync` command (no args) reconciles on-disk markdown files with sqlite mirror. Scans `.metis/` tree, reads frontmatter/content, computes file hash, inserts or updates `documents` table. Idempotent; hash-based change detection. Triggers on documents table auto-sync changes to FTS index.

- **Implementation:** `metis sync` recursively scans `.metis/strategies/`, parses `.md` files' YAML frontmatter, upserts to documents table. `file_hash` column (MD5/SHA) detects changes; matching hash skips update. `updated_at` timestamp updated. Triggers (documents_ai, documents_au, documents_ad) sync to document_search FTS.

- **Evidence:** 
  - `metis sync --help` shows no args, idempotent operation
  - `documents` table has `file_hash TEXT NOT NULL` column
  - Triggers: `CREATE TRIGGER documents_au AFTER UPDATE ON documents` syncs to FTS
  - Directory: `.metis/strategies/NULL/initiatives/` with `tasks/` subdirs

- **Katana need:** MVP-required. Enables offline editing + version control, rebuilds index after bulk changes, git-friendly workflow.

- **Decision:** Inherit

- **Rationale:** Read-only, idempotent sync is essential for doc-driven workflows + git + CI/CD. Agents commit markdown; sync rebuilds index. Hash-based detection sufficient.

- **If Inherit — files/modules to copy:** Unknown. Need: directory scanner, YAML parser, file hash computation, upsert logic, FTS trigger integration.

- **Risks / open questions:**
  - File deletion handling: archived or deleted?
  - Frontmatter parse error handling?
  - Concurrent updates (agent + human): conflict detection?

## C4: Archive

- **What metis provides:** `metis archive <SHORT_CODE>` CLI command marks document archived in sqlite (boolean, default FALSE). Moves file from `.metis/strategies/NULL/initiatives/<ID>/` to mirrored `.metis/archived/` structure. Updates `archived` field in frontmatter to true. Optional `--document-type` flag for disambiguation.

- **Implementation:** `metis archive` takes SHORT_CODE arg + optional `--document-type`. Looks up document in documents table, reads file, updates `archived` boolean in frontmatter to true, moves file to mirrored `.metis/archived/` structure, updates documents row to archived=TRUE. Logical move (file system + database), not delete.

- **Evidence:** 
  - `metis archive --help` shows `<SHORT_CODE>` arg, `--document-type` option
  - `sqlite3 .metis/metis.db ".schema documents"` shows `archived BOOLEAN NOT NULL DEFAULT FALSE`
  - Frontmatter: KAT-T-0040.md line 11 `archived: false`
  - Archive directory: Not observed yet (no docs archived); structure mirrors `.metis/strategies/`

- **Katana need:** Post-MVP. Archive cleans up completed work; phase machine already marks "completed". Not required for MVP.

- **Decision:** Defer

- **Rationale:** Housekeeping operation; does not affect core workflow. MVP uses phase="completed" to hide finished work. Archive can be added post-MVP. Well-isolated (CLI command, table column, directory move); does not block other capabilities.

- **If Inherit — files/modules to copy:** N/A (deferred). Post-MVP: file-move logic, archived/ directory builder, frontmatter update, database update.

- **Risks / open questions:**
  - Parent archive cascades to children?
  - Archived documents unarchivable (terminal state)?
  - Archived/ directory indexed for search/recovery or file-cleanup only?

## Cross-references

- Initiatives that will consume these decisions: 
  - KAT-I-0006 (mcp-server-and-storage) — will implement storage backend and MCP surface for C1, C2, C3, and deferred C4.
  - KAT-I-0002 (document-templates-and-schema) — will define frontmatter fields and template enforcement on top of C1 storage.
  - KAT-I-0001 (workflow-engine-and-loops) — will use C2 short codes for decompose/reference operations and C3 sync to rebuild indexes between workflow steps.
