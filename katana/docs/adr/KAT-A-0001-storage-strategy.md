# KAT-A-0001 — Storage Strategy: Fork-and-Adapt

## Status
Accepted (2026-05-09)

## Context
Katana needs document persistence (Product Doc → Epic → User Story → Task[high-pass|low-pass|ui])
mirroring metis's sqlite + markdown approach. Three options were surveyed
(see .metis/strategies/NULL/initiatives/metis-feature-parity-survey/notes/survey-persistence.md):
1. Depend on metis at runtime
2. Greenfield
3. Fork-and-adapt — copy a minimal subset of metis storage, simplified for katana doc-types.

## Decision
Fork-and-adapt. Katana ships a self-contained storage layer; no runtime metis dependency.

## Tech stack (locked)
- Runtime:  Node.js >= 20, TypeScript (strict).
- MCP:      `@modelcontextprotocol/sdk` (server transport: stdio).
- SQLite:   `better-sqlite3` (synchronous; single-process server).
- YAML:     `gray-matter` for frontmatter parse/serialize.
- Hashing:  Node `crypto` SHA-256 for `file_hash`.
- Test:     `vitest`.
- Workspace root: host repo's `.katana/` directory (mirrors metis `.metis/`).

## Module layout (locked — propagate to every implementation task)
- src/storage/port.ts
- src/storage/sqlite/index.ts
- src/storage/sqlite/migrations/   (numbered .sql files)
- src/storage/markdown/             (file IO, frontmatter codec)
- src/storage/sync.ts               (reconciliation engine)
- src/short-code/                   (allocator)
- src/mcp/server.ts                 (entry point)
- src/mcp/tools/                    (one file per MCP tool)
- src/types/document.ts             (shared types)
- tests/integration/round-trip.test.ts

## MCP tool surface (locked, MVP = 8)
1. create_document
2. read_document
3. edit_document
4. list_documents
5. search_documents
6. transition_phase
7. validate_document  (delegates to gate engine; KAT-I-0002)
8. decompose_document

## Consequences
- Pros: independent release cadence; smaller surface; we own the schema.
- Cons: divergence from metis over time; we re-implement bug fixes if they appear there.
- Mitigation: keep the schema close to metis's so a future "depend" pivot stays cheap.

## Out of scope
- Archive (deferred per capability table row 4).
- Reassign-parent, lint_document, lint_workspace, arch_lint (deferred per rows 23–26).
