# Agent-Integration Layer Survey

## C1: Document templates

- **What metis provides:** Markdown skeleton templates with YAML frontmatter and Tera template variables injected on `metis create <TYPE>`. Each document type (vision, initiative, task, adr, specification) has a built-in `content.md` template defining required headings and structure. Templates support variable substitution: `{{ title }}`, `{{ short_code }}`, `{{ parent_title }}`, etc. Required sections are enforced by frontmatter schema (vision, initiative, task, adr, specification all have type-specific required fields).

- **Implementation:** Template loading via `TemplateLoader` service in metis-docs-core. Three-tier fallback: (1) project-level `.metis/templates/{type}/content.md`, (2) global `~/.config/metis/templates/{type}/content.md`, (3) compiled-in defaults. Embedded defaults in `metis-docs-core/src/domain/documents/{type}/content.md` and `acceptance_criteria.md`. On `metis create`, frontmatter schema (`DocumentType` enum + field validation) enforces required fields per type. Tera templating engine processes variables.

- **Evidence:**
  - Built-in task template: `/Users/danielcassil/plugins/metis/crates/metis-docs-core/src/domain/documents/task/content.md` contains `## Parent Initiative`, `## Objective`, `## Acceptance Criteria`, `## Implementation Notes`, `## Status Updates`
  - Real task file: `/Users/danielcassil/Code/katana/.metis/strategies/NULL/initiatives/metis-feature-parity-survey/tasks/KAT-T-0040.md` shows frontmatter fields: `id`, `level`, `title`, `short_code`, `created_at`, `updated_at`, `parent`, `archived`, `tags`, `exit_criteria_met`
  - DocumentType enum in `/Users/danielcassil/plugins/metis/crates/metis-docs-core/src/domain/documents/types.rs` defines exactly five types: Vision, Initiative, Task, Adr, Specification
  - TemplateLoader in `/Users/danielcassil/plugins/metis/crates/metis-docs-core/src/application/services/template.rs` implements fallback chain; default templates are `include_str!()` embedded

- **Katana need:** MVP. Two-pass task model (high-pass, low-pass gates) requires task templates with gate-related acceptance criteria. Templates are the primary way katana injects gate semantics into document creation.

- **Decision:** Inherit

- **Rationale:** Template engine + fallback chain is exactly what katana needs to add new doc types (Product Doc, Epic, User Story, Task[high-pass], Task[low-pass]) without forking core metis. Built-in defaults + project-level override allows katana to define custom templates while keeping metis sources clean. Tera substitution handles gate metadata injection.

- **Katana extensions needed:** New templates for:
  - Product Doc — high-level product context
  - Epic — gate-scoped collection of user stories
  - User Story — product-oriented narrative
  - Task[high-pass] — gate check, discovery, risk assessment
  - Task[low-pass] — implementation, testing, delivery

- **If Inherit — files/modules to copy:**
  - `metis-docs-core/src/application/services/template.rs` — TemplateLoader, template fallback logic
  - `metis-docs-core/src/domain/documents/types.rs` — DocumentType enum (will extend to support new types)
  - All files in `metis-docs-core/src/domain/documents/{type}/` for each existing type
  - Template embedding approach (`include_str!()` macro)

- **Risks / open questions:**
  - Does the template engine support adding new doc types without forking metis? **YES** — DocumentType is an enum in metis source code, so katana must fork and extend the enum. But: project-level `.metis/templates/` directory allows new templates without modifying Rust. However, CLI create command and MCP tools explicitly check `DocumentType` enum, so **forking is required** to add new types. Workaround: use generic `Task` variant with tag-based differentiation (e.g., `tags: ["#task/high-pass"]`).
  - Frontmatter schema validation: is it tied to the enum, or can project-level config add fields? Appears to be enum-based; custom fields require forking.
  - Template variables available — are they extensible without code changes? Only if defined in the crate; project templates cannot add new variables unless hardcoded in TemplateLoader.

## C2: Configuration presets

- **What metis provides:** Three presets: `streamlined` (Vision → Initiative → Task), `direct` (Vision → Task), and deprecated `full` (alias to streamlined). Presets control `initiatives_enabled` boolean in `FlightLevelConfig`. Configuration stored in `.metis/config.toml` ([flight_levels] section) and sqlite. The config can also be toggled per-project via `metis config set --preset {streamlined|direct}` or `--initiatives {true|false}`.

- **Implementation:** `FlightLevelConfig` struct in metis-docs-core with `streamlined()` and `direct()` factory methods. Preset name stored in config.toml under `[flight_levels] strategies_enabled = false` (always false now that strategies were removed). `metis config set` command reads preset name, constructs FlightLevelConfig, saves to database and config.toml. Create/transition commands check `is_document_type_allowed()` against the config. No custom presets; only two fixed options.

- **Evidence:**
  - Config command: `/Users/danielcassil/plugins/metis/crates/metis-docs-cli/src/commands/config.rs` lines 60–75 show `match preset_name.as_str()` with hardcoded "streamlined" and "direct" cases; lines 105–107 show `FlightLevelConfig::streamlined()` and `FlightLevelConfig::direct()`
  - FlightLevelConfig in metis-docs-core defines: `initiatives_enabled: bool` only; all other document types (Vision, Task, Adr, Specification) are unconditionally allowed
  - Project config: `/Users/danielcassil/Code/katana/.metis/config.toml` shows `[flight_levels] strategies_enabled = false, initiatives_enabled = true` (streamlined preset)
  - Help output: `metis config set --help` shows only `--preset {streamlined|direct}` options

- **Katana need:** Post-MVP. Katana needs per-document-type flight-level control (e.g., enable Epic but not Initiative), but presets alone cannot do this. Preset selection is a convenient DX feature but not required for MVP.

- **Decision:** Defer

- **Rationale:** Presets are a fixed, read-only config option in metis. They cannot be extended or customized (no user-defined presets). Katana's gate model may require a different level structure than Vision → Initiative → Task. Deferred to post-MVP when katana has determined its final doc-type hierarchy. For MVP, use `streamlined` and optionally fork config logic to add dynamic presets.

- **Risks / open questions:**
  - Can presets be extended without forking metis? No — hardcoded in match statement.
  - Is the `strategies_enabled` field still used, or is it vestigial? Appears vestigial (no strategies in streamlined/direct).
  - Will katana's gate model fit within Preset/Initiatives toggle, or does it need finer-grained control per doc type?

## C3: Agent-rules generation

- **What metis provides:** **NONE.** Metis does not provide CLAUDE.md injection, `metis cursor init`, Cursor rules generation, or any agent-rules platform. The MCP tools list (initialize_project, create_document, read_document, edit_document, transition_phase, list_documents, search_documents, archive_document, reassign_parent, index_code) does not include any agent-rules generation. Metis README mentions "agent integration" but only in the context of the MCP server itself — agents call metis MCP tools; metis does not generate agent configuration.

- **Implementation:** Not implemented. No CLI subcommand, no MCP tool, no template files for agent rules, no Cursor `.mdc` rule generation.

- **Evidence:**
  - MCP tools directory: `/Users/danielcassil/plugins/metis/crates/metis-docs-mcp/src/tools/` lists 13 tools; none named `agent_rules`, `generate_rules`, `cursor_*`, or similar
  - CLI commands: `/Users/danielcassil/plugins/metis/crates/metis-docs-cli/src/commands/` lists 12 command handlers; no `agent.rs`, `cursor.rs`, or `rules.rs`
  - Metis README (agent platform section) describes MCP server integration and `/metis-ralph` skill, but does not mention rule generation
  - Grep search: no matches for "CLAUDE.md", "agent.*rule", "Cursor", or ".mdc" in the metis codebase

- **Katana need:** MVP. Agent rules are critical to Katana's pluggable platform model. Katana wants to define once (gate config, task structure) and inject into Claude, Cursor, Codex agent contexts automatically.

- **Decision:** Skip

- **Rationale:** Metis does not provide this capability. Katana must build agent-rules generation as a first-class feature — likely a post-init step that reads Katana config and emits CLAUDE.md snippets, Cursor `.mdc` rules, etc. This is not something to inherit from metis. However, consider: agents will interact with Katana via MCP tools (like metis does), so the rule format may be "call MCP tool X with context Y"; in that case, rules are thin wrappers around the MCP surface, not documents metis manages.

- **Pluggability impact:** Inheriting nothing. Katana must design a pluggable adapter interface for Claude/Cursor/Codex. Metis does not have this, so no coupling is forced. Design: (1) Katana config defines doc-type hierarchy and gate rules, (2) platform-adapter plugins (claude-adapter, cursor-adapter, codex-adapter) read config and emit platform-specific rule files, (3) each adapter is a separate binary or script, not embedded in metis.

- **Risks / open questions:**
  - How will agents invoke Katana workflows? Via MCP tools (like metis does) or via native gate/task APIs? If MCP, then rules are simple tool descriptions.
  - Should agent rules be version-controlled (in .katana/ or .cursor/rules/) or regenerated on each init? Version-controlled allows manual tweaks; regenerated ensures consistency.
  - Cursor `.mdc` rule syntax — is it standardized, or does it vary by Cursor version? Need to track Cursor SDK as Katana evolves.

## C4: Code-index

- **What metis provides:** The `metis:code-index` skill and `.metis/code-index.md` artifact for AI agent codebase navigation. Two-layer index: (1) **Structural** — automated, deterministic symbol extraction via tree-sitter (functions, structs, traits, classes, interfaces, visibility, line numbers, file paths), generated by `metis index` CLI or `index_code` MCP tool, (2) **Semantic** — AI-generated module-level summaries explaining abstractions, symbol relationships, internal flow, and mixed concerns, generated by a background `code-index-summarizer` subagent. Incremental indexing via BLAKE3 file hashing skips unchanged files.

- **Implementation:** CLI subcommand `metis index [--incremental]` (no args = full index, `--incremental` = skip unchanged files). MCP tool `index_code` delegates to the same logic. Structural indexing implemented in `metis-code-index` crate with language-specific tree-sitter extractors (Rust, Python, TypeScript/JavaScript, Go). Output written to `.metis/code-index.md` in markdown format with structure: `## Modules` section containing `### module/path` headings, optional AI-generated summaries between module heading and first file heading, then `#### module/path/file.rs` subheadings with symbol listings. Semantic summaries are generated by the `code-index-summarizer` subagent invoked via the plugin's Skill tool.

- **Evidence:**
  - Skill definition: `/Users/danielcassil/plugins/metis/plugins/metis/skills/code-index/SKILL.md` provides full documentation of the two-layer index, file structure, semantic summary process, and incremental indexing
  - Code extraction crate: `/Users/danielcassil/plugins/metis/crates/metis-code-index/src/lib.rs` exports `SourceFile`, `Symbol`, `SymbolKind`, `ParsedFile`, and language-specific extractors (RustExtractor, PythonExtractor, TypeScriptExtractor, GoExtractor)
  - MCP tool: `/Users/danielcassil/plugins/metis/crates/metis-docs-mcp/src/tools/index_code.rs` implements the `index_code` MCP tool
  - CLI: `/Users/danielcassil/plugins/metis/crates/metis-docs-cli/src/commands/index.rs` (17KB file) implements `metis index --incremental` with BLAKE3 hashing and dirty-file tracking

- **Katana need:** Post-MVP. Code indexing is useful for agents navigating large codebases, but is not required for MVP gate/task workflow. Can be deferred until Katana agents need codebase context.

- **Decision:** Defer

- **Rationale:** Code-index is a well-isolated, self-contained feature (separate crate, separate skill, MCP tool, CLI command). Inheriting it is straightforward, but Katana's MVP should focus on gate/task workflow first. Deferred to post-MVP when agents need guided codebase exploration. The structural indexing (tree-sitter extraction) is language-agnostic and reusable; semantic summarization depends on AI models and can be plugged in later.

- **Risks / open questions:**
  - Does the incremental indexing track only file content changes, or also directory structure? If only content, restructuring dirs might produce stale index.
  - How does the code-index-summarizer interact with context windows? For large modules, can it read all source files or does it sample?
  - Supported languages: currently Rust, Python, TypeScript, JavaScript, Go. Katana will need to extend to other languages (C#, Java, etc.) if needed.

## Cross-references

- Initiatives that will consume these decisions:
  - KAT-I-0006 (mcp-server-and-storage) — will implement storage backend and MCP surface for C1 templates (likely extend DocumentType enum), C2 presets (likely skip or replace with custom flight-level config), and defer C4 code-index.
  - KAT-I-0002 (document-templates-and-schema) — will define frontmatter fields and extend C1 templates for new doc types (Product Doc, Epic, User Story, Task variants).
  - KAT-I-0001 (workflow-engine-and-loops) — will use C1 templates for gate task structure and C2 config for flight-level routing.
  - Agent platform initiative (not yet listed) — will design and implement C3 agent-rules generation as a pluggable platform adapter.
