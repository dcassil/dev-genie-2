# Katana Additions Beyond Metis

## A1: Two-pass task model

- **What it is:** A document hierarchy that distinguishes high-pass tasks (scaffold generation by a stronger model) from low-pass tasks (implementation fill-in by a faster/cheaper model), with each as a distinct document type so the workflow knows which model to dispatch and what to validate. The vision describes it: "LLMs produce dramatically better code when they're given... a constrained scaffold to fill in (interfaces, types, comments, file stubs)... followed by a low-pass task... that fills in the implementation."

- **Why not in metis:** Metis is single-pass and model-agnostic; it treats all tasks identically. Metis has no concept of model tier, no scaffold/fill-in distinction, and no differentiated validation per task type.

- **MVP-required:** Yes. Vision: "Katana operationalizes this with a **two-pass task model**: a **high-pass** task run by a stronger model... followed by a **low-pass** task... Each task type is a distinct document so the workflow knows which model to dispatch and what to validate."

- **Touches metis-survey rows:** 
  - KAT-T-0040 (persistence): adds two new document types to the schema
  - KAT-T-0041 (rules): phase machine must support distinct phase sets for Task[high-pass] vs Task[low-pass]
  - KAT-T-0043 (agent integration): requires new templates for each task type with scaffold vs. fill-in expectations

- **Inheritance impact:** The phase machine (from KAT-T-0041) must be extended to accept and track `Task[high-pass]` and `Task[low-pass]` as distinct document types with independent phase transitions. The sqlite schema must add two new rows to the `document_types` table. Document storage (from KAT-T-0040) must preserve frontmatter with a new `task_type` field or similar to distinguish them.

- **Open questions:**
  - Do Task[high-pass] and Task[low-pass] have identical phase sets, or different ones? (e.g., does high-pass skip certain phases?)
  - Is there a parent-child relationship between a high-pass and its corresponding low-pass task, or are they independent?
  - What validation / lint rules are specific to each?

---

## A2: Pluggable agent-platform adapter

- **What it is:** A common interface behind which Claude / Cursor / Codex (or other agent platforms) implement their touchpoints — slash commands for Claude, `.cursor/rules/` files for Cursor, etc. — so the same katana workflow runs unchanged regardless of which agent platform is calling it. Vision: "A pluggable agent-platform adapter (Claude slash commands and skills, Cursor rules, OpenAI/Codex equivalents, etc.) so the same workflow runs anywhere."

- **Why not in metis:** Metis is Claude-Code-native and hardcoded to Claude; it has no abstraction layer for agent platforms. Agent integration in metis is entirely Claude-specific (`CLAUDE.md` injection, Claude Code skills).

- **MVP-required:** Yes. Vision: "The same katana workflow runs unchanged on Claude Code, Cursor, and at least one OpenAI/Codex-like surface" is a success criterion.

- **Touches metis-survey rows:**
  - KAT-T-0043 (agent integration): the agent-rules-generation capability (CLAUDE.md, Cursor rules) must become an interface with multiple implementations

- **Inheritance impact:** The agent-integration layer (from KAT-T-0043) must be refactored from hardcoded CLAUDE.md + Cursor rules generation into an abstract adapter interface, with concrete implementations for each platform. MCP (from KAT-T-0044) becomes the canonical interface; platform-specific adapters invoke MCP endpoints. Skills/slash commands become platform-specific wrappers.

- **Open questions:**
  - What is the contract of a platform adapter? (Is it just "expose these MCP tools via your agent's native mechanism"?)
  - How are platform-specific extensions (e.g., Cursor AI edits) surfaced if the core workflow is platform-agnostic?
  - Is there a discovery/registration mechanism for plugging in a new platform?

---

## A3: Pluggable kanban-board adapter

- **What it is:** A common interface for syncing katana work items to external kanban boards (Jira, Linear, etc.) with a default internal board implementation, so teams can use their existing tracking system without duplication. Vision: "A pluggable kanban board (internal-default, swappable to Jira/Linear/etc.)."

- **Why not in metis:** Metis has no kanban board integration at all; it is document-centric only. Metis does not expose a board adapter interface or a default board implementation.

- **MVP-required:** No. Vision: "MVP does not include Jira/Linear integration or import-from-existing-board (deferred but interface must accommodate it)."

- **Touches metis-survey rows:** Greenfield — no metis row touched. This is entirely new functionality.

- **Inheritance impact:** A new subsystem independent of metis's existing layers. MCP (from KAT-T-0044) surfaces board operations (list work items, create card, update status); board adapters implement this interface. No impact on persistence, rules, query, or agent integration.

- **Open questions:**
  - What is the minimal set of board operations needed? (create, list, update status, delete?)
  - How does document archive/decompose/transition map to board state?
  - Is board sync one-way (katana → board) or bidirectional?
  - What happens to a work item if it exists in the board but has been deleted from katana?

---

## A4: Pluggable storage backend

- **What it is:** An abstraction for the storage layer so that sqlite+markdown is the default but alternative backends (e.g., PostgreSQL + JSON, Git-backed storage, etc.) can be plugged in, with a contract defining how to store/retrieve documents, manage short codes, and sync. Vision: "A pluggable storage backend (sqlite+md by default, other backends possible)."

- **Why not in metis:** Metis is hardcoded to sqlite+markdown as its sole backend; there is no abstraction layer or interface for alternative storage.

- **MVP-required:** No. Vision: "MVP does not include... other backends" is implicit in the constraints; the vision says "sqlite+md by default" without requiring alternatives for MVP.

- **Touches metis-survey rows:** 
  - KAT-T-0040 (persistence): the storage layout, short codes, sync, and archive all depend on the backend; each must be reimplemented per adapter

- **Inheritance impact:** The persistence layer (from KAT-T-0040) must be refactored into an abstract backend interface. Metis's sqlite+md implementation becomes one concrete adapter. Sync (metis sync) becomes backend-specific; archive layout becomes backend-specific. The phase machine and lint (from KAT-T-0041) remain backend-agnostic.

- **Open questions:**
  - What is the contract? (store document, retrieve by id, search FTS, allocate short code, list all, archive, sync?)
  - How is short-code uniqueness enforced across different backends?
  - Does the abstract interface support the full set of metis queries (search, list with filters, status)?
  - Is there a schema-migration story for backends?

---

## A5: Gate engine as first-class composable config

- **What it is:** An extensible, human-authorable configuration system for gates — rules that block decomposition (pre-decomposition gates), phase transitions (exit-criteria gates), or downstream work (parent-readiness gates) — where gate logic is defined as markdown + config rather than hardcoded, so non-engineers can author new gates. Vision: "Gates that block downstream decomposition until upstream docs meet completeness criteria, and that block phase progression until exit criteria are satisfied" and "Gate engine as first-class composable config" and "Templates and gates must be authorable by humans without changing code (markdown + config)."

- **Why not in metis:** Metis has phase transitions and exit criteria (checked at transition time), but gates are validation rules embedded in the transition logic, not a separate configurable subsystem. There is no pre-decomposition gate system or parent-readiness gate system; no human-editable gate configuration.

- **MVP-required:** Yes. Vision: "Gates that block downstream decomposition until upstream docs meet completeness criteria" and success criterion "A team can... produce a Product Doc → Epic → Stories → Tasks tree without writing custom code" both imply gates must be configurable without code changes.

- **Touches metis-survey rows:**
  - KAT-T-0041 (rules): exit-criteria gating is part of phase transitions in metis; must be extracted and made pluggable
  - KAT-T-0043 (agent integration): gate logic (especially completeness criteria) may reference template required-sections

- **Inheritance impact:** The phase machine (from KAT-T-0041) must be refactored to invoke an abstract gate-check hook before allowing transitions. A new subsystem (gate engine) evaluates gate rules (loaded from config) and returns pass/fail with diagnostics. Exit-criteria tags in frontmatter become one gate type; pre-decomposition and parent-readiness gates are new. Templates (from KAT-T-0043) may define gate rules in their metadata.

- **Open questions:**
  - What is the gate rule syntax? (YAML? Markdown frontmatter? DSL?)
  - Can gates reference other documents? (e.g., "block phase transition until parent is in published?")
  - Are gates sync'd to the sqlite schema or stored separately?
  - How does an agent interact with a gate failure — does it get a suggestion to fix it?

---

## A6: Work-eval-gate-loop runtime per task

- **What it is:** A workflow loop (similar to Ralph-style agent loops) that drives a single task through its phases, evaluating its output at each step (via a model call or validation), checking gates before advancement, and looping until the task is complete or blocked. This is the active runtime that executes katana work, distinct from the document model itself. Vision: "A workflow loop (work → eval → gate → loop → done) that drives a doc through its phases with the right model for each step."

- **Why not in metis:** Metis is a document-centric system; it does not have an execution engine or workflow loop. Metis is passive — documents are created and transitioned by external agents (CLI, MCP calls, skills). There is no built-in runtime that intelligently orchestrates work through phases.

- **MVP-required:** Yes. Vision: "A workflow loop (work → eval → gate → loop → done)..." is part of the "Future State" description, and success criterion "The two-pass execution measurably improves weak-model output quality vs. one-pass on identical specs" requires a runtime to execute the two-pass model.

- **Touches metis-survey rows:**
  - KAT-T-0041 (rules): transition logic becomes part of the loop; gates are invoked before advancement
  - KAT-T-0044 (MCP): the loop must invoke MCP tools to mutate documents; may be driven by MCP calls itself

- **Inheritance impact:** The phase machine (from KAT-T-0041) becomes a state-machine input to the loop runtime; the loop consumes phase definitions and implements the transition logic. Agents call into the loop (as a skill or MCP tool, depending on platform); the loop calls back out to the agent model (or validation function) for evaluation. The loop is a new top-level orchestration subsystem.

- **Open questions:**
  - Is the loop a Claude Code skill, an MCP tool, or a separate service?
  - What is the eval step? (a model call? a linter run? both?)
  - How are loop parameters (model tier, temperature, max tokens) specified per task?
  - Can a loop be paused/resumed, or is it atomic per phase?
  - What diagnostics/logs does the loop emit?

---

## A7: New document hierarchy

- **What it is:** An extended document hierarchy — Product Doc → Epic → User Story → Task[high-pass] → Task[low-pass] → optional Task[UI] — where each level has template expectations and parent-readiness gates, allowing product-level planning to flow down through design and story levels before task-level execution begins. Vision: "A document hierarchy (Product Doc → Epic → User Story → Task[high-pass] → Task[low-pass]) with template files and required-field validation" and "The same hierarchy may include optional Task[UI] for UI-specific tasks."

- **Why not in metis:** Metis supports Vision → Strategy → Initiative → Task, a four-level hierarchy. Katana replaces and extends this with a seven-level hierarchy (Product Doc replaces Vision, Epic / User Story are new, Task splits into two). Metis's hierarchy and parent types are hardcoded; Katana's must be reconfigurable.

- **MVP-required:** Yes. Vision: "A document hierarchy (Product Doc → Epic → User Story → Task[high-pass] → Task[low-pass]) with template files and required-field validation" is part of the "Future State."

- **Touches metis-survey rows:**
  - KAT-T-0040 (persistence): adds four new document types to the schema and the parent-type constraints
  - KAT-T-0041 (rules): phase sets differ per doc type; readiness gates enforce parent type constraints
  - KAT-T-0043 (agent integration): requires new templates for each of the four new types
  - KAT-T-0044 (MCP): decompose/create tools must respect the new hierarchy

- **Inheritance impact:** The sqlite `documents` table must add a `document_type` enum (or similar) with seven values instead of the current five. The phase machine (from KAT-T-0041) must define phase sets per type. Parent validation (from gates) must enforce: Product Doc can only have Epic children, Epic can only have User Story children, User Story can only have Task children, Task can only have Task[low-pass] children. Templates, lint rules, and decompose logic all become type-specific.

- **Open questions:**
  - Is Task[UI] always optional, or is it required for certain initiative types?
  - Can a User Story have both a high-pass task *and* a low-pass task, or must they be sequential?
  - Does the hierarchy map 1:1 to metis's hierarchy, or does it require a migration/mapping strategy if a repo already uses metis?
  - What document types are *terminal* (cannot be decomposed further)?

---

## Cross-references

- **A1 (Two-pass task model)** drives the MCP server initiative (decompose must handle two distinct task types).
- **A2 (Agent-platform adapter)** drives the agent-platform initiative (Cursor / OpenAI / generic MCP client support).
- **A3 (Kanban-board adapter)** is a post-MVP feature; deferred but interface constraint is MVP.
- **A4 (Storage backend)** is a post-MVP feature; inheritance of metis persistence layer must anticipate the abstraction.
- **A5 (Gate engine)** drives the gate subsystem initiative; affects rules layer integration and template design.
- **A6 (Work-eval-gate-loop runtime)** is the execution engine; drives orchestration/workflow initiative.
- **A7 (New document hierarchy)** is the structural foundation; affects storage schema, phase machine, templates, and MCP contract. All downstream initiatives depend on this.

---

## Candidate additions (not in vision)

None identified. All seven additions above are explicitly mentioned in the Katana vision file or derived directly from its principles and success criteria.
