# Query Layer Survey

## C1: Search

- **What metis provides:** Full-text search across document content, titles, and document types using FTS5 (Full-Text Search 5) virtual table. Supports Porter stemmer tokenization with Unicode61 collation for flexible matching. Query sanitization prevents FTS5 syntax errors (e.g., automatically quotes queries containing hyphens like "PROJ-I-0001"). Available through CLI (`metis search <QUERY>`) with output formats: table, compact, or JSON. Limit results via `--limit` flag.

- **Implementation:** CLI subcommand: `metis search [OPTIONS] <QUERY>` (file: `/Users/danielcassil/plugins/metis/crates/metis-docs-cli/src/commands/search.rs`). MCP tool: `search_documents` (file: `/Users/danielcassil/plugins/metis/crates/metis-docs-mcp/src/tools/search_documents.rs`). SQLite virtual table: `document_search` using FTS5 with tokenizer `tokenize='porter unicode61'`. Core query logic: `repository::search_documents()` and `repository::search_documents_unarchived()` via Diesel ORM.

- **Evidence:** 
  - Schema definition in metis.db: `CREATE VIRTUAL TABLE document_search USING fts5(document_filepath UNINDEXED, content, title, document_type, tokenize='porter unicode61')`
  - CLI help: `metis search --help` shows query argument, limit/format options
  - Repository implementation: `/Users/danielcassil/plugins/metis/crates/metis-docs-core/src/dal/database/repository.rs` (methods `search_documents()`, `search_documents_unarchived()`)
  - MCP schema hints indicate read-only, idempotent, not destructive

- **Katana need:** MVP. Agent loops require text-based document discovery (e.g., finding related work by content keyword). Humans also need semantic search to navigate a large project repository.

- **Decision:** Inherit

- **Rationale:** The FTS5 implementation with Porter stemmer is production-ready and well-tested in Metis. Inheriting avoids reimplementing full-text search indexing from scratch. The tokenizer configuration (porter + unicode61) provides both English morphological support and Unicode text handling, suitable for agent-driven discovery of work items. Query sanitization already handles edge cases.

- **If Inherit — files/modules to copy:**
  - Database schema trigger migrations: `documents_ai`, `documents_au`, `documents_ad` (automatic index updates on insert/update/delete) from metis.db schema
  - FTS5 virtual table definition with exact tokenizer config
  - Query sanitization logic from `SearchDocumentsTool::sanitize_search_query()` — prevents FTS5 syntax errors for short queries and hyphens
  - Repository methods `search_documents()` and `search_documents_unarchived()` from metis-docs-core
  - Limit/format handling patterns from CLI command

- **Risks / open questions:**
  - FTS5 rebuild cost if content corpus grows very large (performance testing needed)
  - Query sanitization may be over-protective for agent-driven workflows (consider relaxing if agents reliably escape queries)
  - No stemming configuration for non-English content; consider multilingual needs if Katana expands internationally

---

## C2: List

- **What metis provides:** Structured document listing with optional filtering by document type (`--document-type vision|initiative|task|adr|specification`), phase (`--phase`), all-or-filtered mode (`--all`), and archived-document inclusion (`--include-archived`). Supports multiple output formats: table (human-readable), compact (single-line per document, machine-friendly), and JSON. Default format is table; JSON output includes type, code, title, and phase fields.

- **Implementation:** CLI subcommand: `metis list [OPTIONS]` (file: `/Users/danielcassil/plugins/metis/crates/metis-docs-cli/src/commands/list.rs`). MCP tool: `list_documents` (file: `/Users/danielcassil/plugins/metis/crates/metis-docs-mcp/src/tools/list_documents.rs`). Core filtering logic: `repository::find_by_type()`, `repository::find_by_type_and_phase()`, `repository::find_by_phase()`, `repository::find_all_documents()` from Diesel ORM layer.

- **Evidence:**
  - CLI help: `metis list --help` lists all filter options and output formats
  - Live output example: `metis list -f json` produces JSON array with `type`, `code`, `title`, `phase` fields
  - MCP tool schema: `ListDocumentsTool` with `project_path` and `include_archived` parameters
  - Repository index: `idx_documents_type`, `idx_documents_phase` on documents table support fast filtering
  - Sorting logic in list.rs: by type order (vision → specification → initiative → task → adr), then by short_code

- **Katana need:** MVP. Agent loops need cheap, structured queries by phase (e.g., "get all todo tasks") and document type to drive workflow state machines. Humans need this for kanban views and backlog review. JSON format is essential for programmatic consumption.

- **Decision:** Inherit

- **Rationale:** The filtering and sorting logic is minimal and stable, focused on querying the database via indexed fields (type, phase). The multi-format output (JSON, compact, table) already supports agent integration. No custom query DSL needed; standard filters (type/phase) align with Katana's document hierarchy. Database indexes (`idx_documents_type`, `idx_documents_phase`) ensure O(log n) lookups even at scale.

- **If Inherit — files/modules to copy:**
  - Repository methods: `find_by_type()`, `find_by_phase()`, `find_by_type_and_phase()`, `find_all_documents()` from metis-docs-core
  - OutputFormat enum (Table, Compact, Json) and display logic for each format from list.rs
  - Database indexes on `document_type` and `phase` columns
  - Filter pipeline logic: `include_archived` flag handling, sort-by-type order logic

- **Risks / open questions:**
  - No full-text search integration with filtering (e.g., "list tasks matching 'query'") — separate search and list commands
  - Phase filtering assumes phase names are standardized across project; divergence would break queries
  - Performance of `find_all_documents()` for 10k+ documents may require pagination in future

---

## C3: Status

- **What metis provides:** Actionable-items roll-up view that lists documents prioritized by phase and recency. Prioritizes blocked documents first (phase="blocked"), then todo, then active, then planning phases (discovery/shaping/design), then staged phases (ready/decompose), then review, then completed. Within priority tier, sorts by most recently updated (`updated_at` descending). Supports `--include-archived` flag and multiple output formats: table (human-formatted with columns for code/title/type/phase/updated), compact (single-line per document for scripts), and JSON (structured data with code, title, type, phase, blocked_by, updated fields). **Important:** Status is currently human-formatted; the JSON output does include machine-readable phase and updated fields, but `blocked_by` field is typically empty/omitted and "updated" uses relative timestamps ("2 minutes ago") which are computed client-side and not machine-parseable timestamps.

- **Implementation:** CLI subcommand: `metis status [OPTIONS]` (file: `/Users/danielcassil/plugins/metis/crates/metis-docs-cli/src/commands/status.rs`). No MCP tool equivalent. Core sorting logic: `StatusCommand::sort_documents_by_priority()` with `get_action_priority()` method that maps phases to numeric priority tiers (blocked=0, todo=1, discussion=2, active=3, discovery/shaping/design=4, ready/decompose=5, review=6, decided/published/completed=7, other=8).

- **Evidence:**
  - CLI help: `metis status --help` shows `--include-archived` and `--format` options only
  - Live output: `metis status -f json` returns array of objects with code, title, type, phase, blocked_by, updated; `metis status -f compact` shows `CODE PHASE TITLE` on single lines
  - Source code: `get_action_priority()` in status.rs defines priority tier mapping; `sort_documents_by_priority()` handles tiered sort with updated_at fallback
  - No `status` entry in `/Users/danielcassil/plugins/metis/docs/reference/mcp-tools.md` — status is CLI-only
  - Database queries: loop through all document types (vision, specification, initiative, task, adr), filter by archived flag, apply sort

- **Katana need:** MVP for human consumption, Post-MVP for agent loops. Humans need status for standup reports and priority review. Agents need blocked/todo/active counts and true timestamps (ISO 8601) for state-machine transitions, but current implementation uses relative time strings ("1 minute ago") that are lossy and environment-dependent.

- **Decision:** Depend

- **Rationale:** The priority tier logic is useful, but the human-formatted relative timestamps ("2 minutes ago") are not machine-parseable. For agent loops, Katana would need to either: (a) consume the JSON format but compute absolute timestamps from phase + updated_at database column, or (b) extend metis status to support `--format=agent-json` with ISO 8601 timestamps. Depending on metis status avoids reimplementing phase-to-priority mapping; Katana can layer agent-specific output on top. The CLI interface is stable and the filtering logic (archived, include-archived) is reusable.

- **If Inherit — files/modules to copy:** Not applicable for "Inherit" decision.

- **If Depend — how Katana would consume:**
  - Call `metis status -f json` and parse JSON array
  - Map each document's `phase` field to internal agent state machine (blocked → BLOCKED, todo → READY, active → IN_PROGRESS, etc.)
  - Use `code` field for workflow routing; use `updated_at` from database (not relative timestamp) for SLA tracking
  - For true agent-driven loop, Katana should request metis to add `--format=agent-json` option returning ISO 8601 timestamps instead of relative strings

- **Risks / open questions:**
  - **Blocker for agent loops:** Relative timestamps are lossy; agent needs true updated_at (ISO 8601). Workaround: query database directly or request metis add timestamp option.
  - `blocked_by` field is not populated in current status output — no dependency tracking visible at status level (stored in database but not surfaced)
  - Status does not include completed/archived count summary useful for reporting
  - No metrics (count by phase) in status output — agent loops need to compute this from the array

---

## Cross-references

- Sibling survey tasks: KAT-T-0040 (persistence layer: storage, short codes, sync, archive), KAT-T-0041 (rules layer: phase machine, lint, validate), KAT-T-0043 (agent-integration layer: templates, presets, agent rules, code-index), KAT-T-0044 (MCP tool surface).
- Metis source directories:
  - CLI commands: `/Users/danielcassil/plugins/metis/crates/metis-docs-cli/src/commands/`
  - MCP tools: `/Users/danielcassil/plugins/metis/crates/metis-docs-mcp/src/tools/`
  - Core database: `/Users/danielcassil/plugins/metis/crates/metis-docs-core/src/dal/database/`
- Database schema: `/Users/danielcassil/Code/katana/.metis/metis.db` (SQLite)
- MCP reference: `/Users/danielcassil/plugins/metis/docs/reference/mcp-tools.md`
