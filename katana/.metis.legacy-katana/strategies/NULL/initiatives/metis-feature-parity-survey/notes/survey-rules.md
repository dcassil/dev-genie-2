# Rules Layer Survey

## C1: Phase machine

- **What metis provides:** A forward-only state machine that enforces phase transitions per document type. Each document type (vision, strategy, initiative, task, ADR) has a fixed set of allowed phases and can only transition forward through them. Vision phases: `draft` → `review` → `published`. Strategy phases: `shaping` → `design` → `ready` → `active` → `completed`. Initiative phases: `discovery` → `design` → `ready` → `decompose` → `active` → `completed`. Task phases: `todo` → `active` → `completed`. ADR phases: `draft` → `discussion` → `decided` → `superseded`. Transitions block backward movement and skip phases. Each document's current phase is stored in the `phase` column of the `documents` table and denoted in markdown via a `#phase/<name>` tag in the frontmatter `tags` array.

- **Implementation:** CLI subcommand `metis transition <SHORT_CODE> [PHASE]` (optional `PHASE` argument transitions to next valid phase automatically); `#phase/<phase>` tags in frontmatter (validated via `lint` to match the `phase` field); frontmatter field `phase: <name>` stored in `documents.phase` column (TEXT NOT NULL DEFAULT 'draft'); SQLite index on `phase` column for query efficiency. Exit criteria gating via `exit_criteria_met` boolean field in frontmatter (stored as `exit_criteria_met BOOLEAN NOT NULL DEFAULT FALSE` in database).

- **Evidence:** 
  - CLI: `metis transition --help` confirms optional phase arg.
  - Frontmatter tags: Observed in KAT-T-0041.md, KAT-I-0008.md tags include `#phase/todo`, `#phase/discovery`, `#phase/published`.
  - Database schema: `CREATE TABLE documents(...phase TEXT NOT NULL DEFAULT 'draft'...)` in metis.db.
  - Database content: Query `SELECT DISTINCT document_type, phase FROM documents` shows vision→published, initiative→discovery, task→todo. Gaurd-rails example shows initiative→active/completed, task→completed patterns.
  - Lint validation: `metis lint` output shows warnings for phase tags not matching frontmatter; `No issues found` on valid documents (KAT-V-0001).

- **Katana need:** MVP. The Katana vision emphasizes a two-pass task model (high-pass strategic / low-pass operational) and a gate engine as first-class composable config. Both depend on reliable phase progression and exit-criteria gating to enforce workflow. The vision explicitly lists "Two-pass task model" and "Gate engine" as capabilities Katana adds, implying phase enforcement is foundational.

- **Decision:** Inherit

- **Rationale:** The metis phase machine is well-designed, database-backed, and enforces forward-only constraints that map cleanly to Katana's gating model. However, Katana must extend the phase machine for new document types (Product Doc, Epic, User Story, Task[high-pass], Task[low-pass]) not present in metis. Inheriting the mechanism and extending the configuration is more maintainable than reimplementing from scratch. Exit-criteria gating is native to metis and directly supports Katana's gate engine vision.

- **Phase-machine extension required for Katana?** Yes. Katana must add phases for:
  - **Product Doc**: likely `draft` → `review` → `published` (analogous to Vision).
  - **Epic**: likely `discovery` → `ready` → `active` → `completed` (analogous to Strategy/Initiative).
  - **User Story**: likely `backlog` → `ready` → `active` → `completed` (or similar).
  - **Task[high-pass]**: likely `todo` → `active` → `completed` (same as current Task).
  - **Task[low-pass]**: likely `backlog` → `todo` → `active` → `completed` (or two-level, with early exit criteria for high-pass gate).
  - The hard-coded phases per doc type are configured in metis source, not in `config.toml`. To extend, Katana must either fork metis and add new doc types / phase sets, or Depend on metis and implement a thin wrapper that injects custom doc types into the allowed phase graph at runtime (more risky).

- **If Inherit — files/modules to copy:** Unknown — to investigate in inheritance initiative. Likely involves Rust source modules handling phase transitions and validation (metis is a binary, not a library currently exposed for direct inheritance).

- **Risks / open questions:**
  - Phase machine phases are hard-coded in metis binary; Katana must determine whether to fork metis Rust source or rely on metis and wrap. Forking may incur maintenance burden; wrapping risks compatibility breaks.
  - Exit-criteria gating is stored as a boolean (`exit_criteria_met`); unclear if metis enforces exit-criteria checks before allowing transitions or if it's advisory only. Must test before relying.
  - Are custom phases (beyond the 5–6 standard ones) supported in metis config, or must source be modified?
  - Do phase tags in frontmatter auto-update when `metis transition` is called, or must they be manually kept in sync?

## C2: Lint

- **What metis provides:** Workspace-wide linting with configurable severity levels (error, warning, info) and rule-based validation of document frontmatter and content. Rules include checks for placeholder text, required sections, phase tags matching frontmatter phase field, parent existence, short-code validity, and custom rules defined in `config.toml` under `[lint.rules]`. The `metis lint [SHORT_CODE]` command lints a single document or workspace; `metis lint --severity <LEVEL>` filters output by severity. The MCP tools `lint_document` and `lint_workspace` expose the same functionality for external integrations.

- **Implementation:** CLI subcommand `metis lint [SHORT_CODE]` with optional `--severity <SEVERITY>` flag (default: error, options: error/warning/info); extends standard rule set via `[lint.extends = "standard"]` in `config.toml`; custom rules in `[lint.rules]` and `[lint.phase_gates]` sections of config; rule identifiers like `parent-exists`, `no-placeholder-text`. MCP tools `lint_document` (short code) and `lint_workspace` (all documents) callable via `metis mcp` server.

- **Evidence:**
  - CLI: `metis lint --help` confirms `[SHORT_CODE]` arg and `--severity <SEVERITY>` flag with default "error".
  - Lint output: Full workspace lint shows 35 errors, 0 warnings, 0 info in 32 documents, with error codes like `[parent-exists]`, `[no-placeholder-text]`.
  - Config: `/Users/danielcassil/Code/katana/.metis/config.toml` includes `[lint]` section with `extends = "standard"`, empty `[lint.rules]` and `[lint.phase_gates]`.
  - Single-document lint: `metis lint KAT-V-0001` returns "No issues found in 1 document(s)."
  - MCP availability: `metis mcp --help` confirms server launch; MCP tools documented in system-reminder.

- **Katana need:** MVP. Katana's gate engine and two-pass task model require automated validation of document completeness and correctness before phase transitions or task execution. Lint rules enforce that documentation requirements are met (e.g., all required sections filled, no placeholders, parent links valid) prior to workflow progression.

- **Decision:** Inherit

- **Rationale:** Metis lint is a robust, rules-based system with severity levels, custom rule support, and MCP exposure. It directly supports Katana's gate engine by validating document state before phase changes. Inheriting the lint engine and extending rules for new doc types / Katana-specific validations (e.g., gate execution order, two-pass consistency) is more efficient than building from scratch. The rule names are explicit and extensible via config.

- **If Inherit — files/modules to copy:** Unknown — to investigate in inheritance initiative. Likely Rust modules implementing rule parsing, severity classification, and CLI output formatting.

- **Risks / open questions:**
  - Lint rule evaluation order and composition: are rules applied in a fixed order, or can custom rules override standard ones?
  - Can lint rules reference custom frontmatter fields (e.g., a hypothetical `gate_result` field for Katana), or only standard metis fields?
  - How are `[lint.phase_gates]` used? Are they hard-coded phase transition guards, or pluggable?
  - Does metis lint support document-to-document cross-validation (e.g., checking that Task A references valid Initiative B)?

## C3: Validate

- **What metis provides:** Single-file frontmatter and structural validation (`metis validate <FILE_PATH>`) that confirms a document file is well-formed (valid YAML frontmatter, required fields present, document type recognized, short code unique and well-formed). Returns a success message (✓ Valid <TYPE> document) or error list. Unlike `lint`, which checks business rules and content, `validate` is a low-level format check.

- **Implementation:** CLI subcommand `metis validate <FILE_PATH>` (required file path argument, no batch mode); validates frontmatter YAML parsing, presence of required fields (`id`, `level`, `title`, `short_code`, `tags`, etc.), document type enum membership, and short-code format `<PREFIX>-<TYPE>-<NNNN>` and uniqueness constraint against database. Stored as raw frontmatter validation in metis binary (not exposed via MCP in current system-reminder, only `lint_document`/`lint_workspace` listed).

- **Evidence:**
  - CLI: `metis validate --help` confirms `<FILE_PATH>` argument (required).
  - Single-document validate: `metis validate /Users/danielcassil/Code/katana/.metis/strategies/NULL/initiatives/metis-feature-parity-survey/initiative.md` returns "✓ Valid initiative document: <path>".
  - Database schema: UNIQUE constraint on `(document_type, short_code)` ensures uniqueness per type; SQL `TRIGGER documents_ai AFTER INSERT ON documents` syncs validated docs to database.
  - No dedicated MCP tool listed in system-reminder for validate (only lint_document, lint_workspace for linting, not validation).

- **Katana need:** MVP (infrastructure level). Before any document can be ingested into the phase machine or lint checked, it must pass validation. This is a baseline requirement for document authoring automation and import; however, it is not a high-level business rule and could be satisfied by simple regex/schema checks.

- **Decision:** Depend

- **Rationale:** Metis validate provides the minimal format checking needed to ensure documents are machine-readable before further processing. Rather than fork the entire validation logic, Katana should depend on metis `validate` CLI for document acceptance. Katana's document import / authoring automation (templates, agent-integration) can call `metis validate` as a pre-flight check. If Katana extends document types, metis must be updated to recognize new types in validation; this is a light dependency and easier to manage than forking.

- **If Inherit — files/modules to copy:** Not applicable (Depend decision).

- **Risks / open questions:**
  - Is `metis validate` exposed via MCP, or only via CLI? Current system-reminder lists only `lint_document`/`lint_workspace`, not validate. If MCP expose is needed, that's a gap.
  - Does validate run sync automatically when files change, or only on explicit CLI call? If only on explicit call, Katana's file-watch integration must trigger validate.
  - Can validate be extended to accept custom frontmatter fields without forking metis, or is the allowed-field set hard-coded?
  - If a Katana document uses a new type (e.g., `Product Doc`) not in metis, will validate reject it?

## Cross-references

- **Phase machine** supports **Katana's gate engine** and **two-pass task model** (vision context).
- **Lint** enforces document completeness required by **gate engine** to make workflow decisions.
- **Validate** is a prerequisite for **lint** and the **phase machine** to operate on well-formed documents.
- All three depend on the **persistence layer** (KAT-T-0040) for document storage and short-code allocation.
- **MCP integration** (KAT-T-0044) must expose lint and validate for agent-driven workflows.
