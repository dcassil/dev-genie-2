# MCP Tool Surface Survey

## Summary table
| Tool | CLI counterpart | Need | Decision | Katana name |
|------|-----------------|------|----------|-------------|
| initialize_project | metis init | MVP | Inherit | katana_initialize_project |
| create_document | metis create | MVP | Inherit | katana_create_document |
| read_document | (none — read-only introspection) | MVP | Inherit | katana_read_document |
| edit_document | metis edit | MVP | Inherit | katana_edit_document |
| list_documents | (none — introspection) | MVP | Inherit | katana_list_documents |
| search_documents | (none — introspection) | MVP | Inherit | katana_search_documents |
| transition_phase | metis transition | MVP | Inherit | katana_transition_phase |
| archive_document | (implicit in metis archive) | MVP | Inherit | katana_archive_document |
| reassign_parent | (implicit; no direct CLI) | Post-MVP | Defer | katana_reassign_parent |
| lint_document | metis lint <id> | Post-MVP | Defer | katana_lint_document |
| lint_workspace | metis lint (root) | Post-MVP | Defer | katana_lint_workspace |
| arch_lint | (metis audit equivalent) | Post-MVP | Skip | (monitor for future need) |
| list_patterns | (introspection only) | Post-MVP | Inherit | katana_list_patterns |

## Per-tool detail

### initialize_project
- **What it does:** Creates a new Metis project by setting up a `.metis` subdirectory with configuration, short-code prefix, and baseline structure.
- **Inputs / outputs:** 
  - Inputs: `project_path` (string, required), `prefix` (string, optional, defaults to "PROJ", max 6 chars)
  - Outputs: Creates `.metis/` folder and initializes config
- **CLI counterpart:** `metis init`
- **Katana need:** MVP
- **Decision:** Inherit
- **Rationale:** Core operation; generic enough for Katana to mirror cleanly. Not tightly coupled to metis-specific doc types beyond the concept of a "project" root. Katana will initialize its own project structure with its own document types and phase machine.
- **Katana name suggestion:** `katana_initialize_project`
- **Risks / open questions:**
  - Verify Katana's document-type schema (doc types, phase names, exit criteria) differs enough from metis to justify a separate implementation.
  - Confirm prefix length and character constraints match Katana naming conventions.

### create_document
- **What it does:** Creates a new document (vision, strategy, initiative, task, adr, or backlog item) with a unique short code and optional metadata (parent, complexity, risk, stakeholders, etc.).
- **Inputs / outputs:**
  - Inputs: `project_path`, `document_type`, `title`, `parent_id` (optional), `complexity` (optional), `risk_level` (optional), `decision_maker` (optional), `stakeholders` (optional array), `backlog_category` (optional: bug/feature/tech-debt)
  - Outputs: Newly created document with generated short code
- **CLI counterpart:** `metis create`
- **Katana need:** MVP
- **Decision:** Inherit
- **Rationale:** Core CRUD operation; moderately coupled to metis document types (vision/strategy/initiative/task/adr). Katana will likely have its own document types and hierarchy; this tool's contract (accept type, parent, title, metadata) is generic enough to adapt.
- **Katana name suggestion:** `katana_create_document`
- **Risks / open questions:**
  - Katana's document types (and their phase models) must be defined before implementing. Document-type coupling is the main risk.
  - Confirm whether Katana supports backlog-style items or adheres strictly to hierarchy.

### read_document
- **What it does:** Retrieves full content and structure of a document by short code. Used for introspection and external integrations.
- **Inputs / outputs:**
  - Inputs: `project_path`, `short_code`
  - Outputs: Document YAML frontmatter + markdown body
- **CLI counterpart:** (no direct CLI; introspection only)
- **Katana need:** MVP
- **Decision:** Inherit
- **Rationale:** Essential read-only operation; completely generic. No coupling to metis document types beyond the concept of "document." Katana's document structure may differ but the read contract is universal.
- **Katana name suggestion:** `katana_read_document`
- **Risks / open questions:**
  - Confirm Katana document storage format (YAML + markdown) matches metis or requires adaptation.
  - Verify short-code scheme works identically in Katana.

### edit_document
- **What it does:** Edits document content via search-and-replace. Finds first (or all) occurrence of a search string and replaces it.
- **Inputs / outputs:**
  - Inputs: `project_path`, `short_code`, `search` (string), `replace` (string), `replace_all` (boolean, optional)
  - Outputs: Modified document
- **CLI counterpart:** `metis edit`
- **Katana need:** MVP
- **Decision:** Inherit
- **Rationale:** Core mutation operation; completely generic. Search-and-replace is storage-agnostic. No coupling to doc types or phases.
- **Katana name suggestion:** `katana_edit_document`
- **Risks / open questions:**
  - Verify the search-and-replace semantics (e.g., whitespace handling, multiline matching) match Katana's editing needs.
  - Consider whether YAML frontmatter should be editable via MCP or only via dedicated metadata operations.

### list_documents
- **What it does:** Returns all non-archived documents (optionally including archived) in the project, with short codes and metadata.
- **Inputs / outputs:**
  - Inputs: `project_path`, `include_archived` (optional boolean)
  - Outputs: List of documents with short_code, type, title, parent_id, phase, etc.
- **CLI counterpart:** (introspection only; no direct CLI)
- **Katana need:** MVP
- **Decision:** Inherit
- **Rationale:** Essential introspection operation; completely generic. Filtering by archive status is a simple boolean toggle. No coupling to document types or phases.
- **Katana name suggestion:** `katana_list_documents`
- **Risks / open questions:**
  - Verify output schema (fields, nesting) is sufficient for Katana's UI and integrations.
  - Confirm whether filtering by type or phase should be added to MVP or deferred.

### search_documents
- **What it does:** Full-text search across document content with optional filtering by type or archive status. Returns matching documents and their short codes.
- **Inputs / outputs:**
  - Inputs: `project_path`, `query` (required string), `document_type` (optional), `include_archived` (optional), `limit` (optional)
  - Outputs: List of documents matching query, ordered by relevance
- **CLI counterpart:** (introspection only)
- **Katana need:** MVP
- **Decision:** Inherit
- **Rationale:** Essential search capability; completely generic. Full-text search is storage-agnostic. Filtering by type is decoupled from type-specific logic.
- **Katana name suggestion:** `katana_search_documents`
- **Risks / open questions:**
  - Verify search engine (ripgrep) and indexing strategy are appropriate for Katana.
  - Confirm whether scoring/ranking algorithm should be customized for Katana.

### transition_phase
- **What it does:** Moves a document to the next (or specified) phase in its state machine. Can force transition even if exit criteria aren't met.
- **Inputs / outputs:**
  - Inputs: `project_path`, `short_code`, `phase` (optional string), `force` (optional boolean)
  - Outputs: Document with updated phase
- **CLI counterpart:** `metis transition`
- **Katana need:** MVP
- **Decision:** Inherit
- **Rationale:** Core workflow operation; tightly coupled to metis's phase machine concept. However, the operation itself (accept short code, navigate state machine) is generic. Katana's phase machine may differ, but the MCP contract is phase-agnostic.
- **Katana name suggestion:** `katana_transition_phase`
- **Risks / open questions:**
  - Katana's phase definitions (per document type) must be finalized before MCP tool design. Major design dependency.
  - Verify whether exit criteria checking logic should be mirrored in Katana or deferred to an `arch_lint`-style validation tool.

### archive_document
- **What it does:** Archives a document and all its children, moving them to an archived folder and marking them as archived.
- **Inputs / outputs:**
  - Inputs: `project_path`, `short_code`
  - Outputs: Document and children marked as archived
- **CLI counterpart:** (implicit in metis archive, no separate subcommand)
- **Katana need:** MVP
- **Decision:** Inherit
- **Rationale:** Core document lifecycle operation; generic concept (mark as inactive, move to archive). Not tightly coupled to specific doc types, though cascade behavior (archive children) assumes hierarchical structure.
- **Katana name suggestion:** `katana_archive_document`
- **Risks / open questions:**
  - Confirm Katana supports parent-child relationships and cascade archival. If Katana's hierarchy differs, this may need adaptation.
  - Verify whether archived documents should be queryable or completely hidden.

### reassign_parent
- **What it does:** Moves a task to a different parent initiative or to the backlog. Modifies the parent_id field.
- **Inputs / outputs:**
  - Inputs: `project_path`, `short_code`, `new_parent_id` (optional), `backlog_category` (optional: bug/feature/tech-debt)
  - Outputs: Task with updated parent_id
- **CLI counterpart:** (implicit; no direct CLI)
- **Katana need:** Post-MVP
- **Decision:** Defer
- **Rationale:** Specialized operation tied to metis's task/initiative/backlog hierarchy and backlog-category enum. Useful for workflow but not essential to MVP. Defer until Katana's backlog and task-reassignment semantics are finalized.
- **Katana name suggestion:** `katana_reassign_parent`
- **Risks / open questions:**
  - Backlog categories (bug/feature/tech-debt) are metis-specific; Katana may use different taxonomy.
  - Verify whether Katana supports moving items out of initiatives (into backlog) or uses a different lifecycle.

### lint_document
- **What it does:** Runs lint checks on a single document, returning diagnostics with severity, rule ID, and message.
- **Inputs / outputs:**
  - Inputs: `project_path`, `short_code`
  - Outputs: List of diagnostics (severity, rule_id, message)
- **CLI counterpart:** `metis lint <id>`
- **Katana need:** Post-MVP
- **Decision:** Defer
- **Rationale:** Validation/quality tooling; not essential to MVP. Lint rules are highly coupled to metis's document-type definitions, exit criteria, and phase transitions. Defer until Katana's validation framework is designed.
- **Katana name suggestion:** `katana_lint_document`
- **Risks / open questions:**
  - Lint rules must be defined per Katana document type. Requires design of "valid document" criteria.
  - Decide whether linting is reactive (on-demand via MCP) or embedded in phase-transition gates.

### lint_workspace
- **What it does:** Runs lint checks on all non-archived documents, returning per-document diagnostics and a summary.
- **Inputs / outputs:**
  - Inputs: `project_path`
  - Outputs: Map of documents to diagnostics, plus summary statistics
- **CLI counterpart:** `metis lint` (root)
- **Katana need:** Post-MVP
- **Decision:** Defer
- **Rationale:** Batch validation operation; not essential to MVP. Same coupling issues as `lint_document`. Defer until linting framework is established.
- **Katana name suggestion:** `katana_lint_workspace`
- **Risks / open questions:**
  - Same as `lint_document`, but at scale. Performance considerations for large workspaces.
  - Decide whether to expose as MCP tool or as internal CLI only.

### arch_lint
- **What it does:** Validates project directory structure against an active architecture pattern. Reports missing directories and structural violations.
- **Inputs / outputs:**
  - Inputs: `project_path`, `pattern` (optional override)
  - Outputs: List of violations (missing dirs, structural issues)
- **CLI counterpart:** (guard-rails / audit integration; no direct metis CLI)
- **Katana need:** Post-MVP
- **Decision:** Skip
- **Rationale:** Specialized to code architecture validation (not document structure). Relies on metis's architecture-pattern registry and directory linting, which is tangential to Katana's document-management mission. If Katana adopts guard-rails or similar, revisit this decision.
- **Katana name suggestion:** (skip — monitor for future need)
- **Risks / open questions:**
  - If Katana integrates code auditing or architecture scanning, this may become relevant post-MVP.
  - Unclear whether Katana's scope includes architecture enforcement or is purely document-focused.

### list_patterns
- **What it does:** Lists all available architecture patterns (built-in and project-local) with metadata (pattern id, name, description, layer info).
- **Inputs / outputs:**
  - Inputs: (none)
  - Outputs: List of patterns with id, name, description, layers
- **CLI counterpart:** (introspection only; no dedicated CLI)
- **Katana need:** Post-MVP
- **Decision:** Inherit
- **Rationale:** Read-only introspection of available patterns. Completely generic; useful for UIs and pattern selection. If Katana adopts a pattern system (similar to metis), this tool's contract is universally applicable.
- **Katana name suggestion:** `katana_list_patterns`
- **Risks / open questions:**
  - Confirm Katana's pattern system (if any) shares metis's concept of "layers," "built-in," and "project-local."
  - Verify pattern metadata schema (name, description, layer count) is sufficient for Katana's needs.

## Cross-references
- **Document-type coupling:** `create_document`, `transition_phase`, `lint_document`, `lint_workspace` are tightly coupled to metis's document-type and phase definitions. These require Katana's doc-type schema to be finalized before MCP implementation.
- **Hierarchy coupling:** `reassign_parent`, `archive_document` assume a parent-child hierarchy. Verify Katana's document structure matches before inheriting.
- **Backlog concept:** `create_document` (backlog_category) and `reassign_parent` assume a backlog-item concept. Decide whether Katana uses backlog or a different organizational model.
- **Phase machine:** `transition_phase`, `lint_document`, and exit criteria all assume a state machine with defined phases. Katana's phase model must be designed before MPC implementation.
- **Architecture patterns:** `arch_lint` and `list_patterns` are orthogonal to core document management. Include only if Katana integrates code-architecture auditing.
