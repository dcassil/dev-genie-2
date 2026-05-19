# KAT-A-0003 — Universal vs Platform-Specific Command Split

## Status
Accepted (2026-05-09)

## Context
Katana must run on multiple agent platforms (Claude Code, Cursor, Codex) via pluggable adapters.
Each platform has different affordances: slash commands, rule-triggered actions, direct MCP calls.
Without a contract, adapters may expose conflicting command names or argument shapes, breaking portability.

## Decision
Define a **universal command set** that every PlatformAdapter MUST expose identically.

### Universal Commands (Required)
Every adapter surfaces exactly these four commands with locked names and argument shapes, mapping 1:1 to MCP tools (per KAT-A-0001):

1. **`decompose <parent-short-code>`** → MCP tool `decompose_document`
   - Decomposes a parent initiative into child tasks.
   - Input: parent document short code (e.g., `KAT-I-0001`).
   - Output: structured list of created task short codes and metadata.

2. **`work <task-short-code>`** → Implicit (host platform's work loop)
   - Selects a task and starts the execution loop on the host platform.
   - Input: task document short code (e.g., `KAT-T-0001`).
   - Output: activates the task and starts the agent's work phase.

3. **`board [--level <level>] [--phase <phase>]`** → MCP tool `list_documents`
   - Presents a kanban board view filtered by level (vision/initiative/task) and phase.
   - Arguments: optional `--level` (vision|initiative|task), optional `--phase` (todo|active|completed).
   - Output: structured kanban data (groupings by phase, card metadata).

4. **`validate <short-code>`** → MCP tool `validate_document`
   - Validates a document against its template and gate rules.
   - Input: document short code.
   - Output: validation result (pass/fail + diagnostics).

### Platform-Specific Commands (Optional)
Adapters MAY expose additional commands (e.g., `/katana-init` in Claude Code) but MUST NOT:
- Rename the universal four.
- Alter their argument shapes or semantics.

Examples of optional platform-specific commands:
- Claude Code: `/katana-edit-hook` (configure edit-time lint).
- Cursor: inline rule-triggered gates.
- Codex: `AGENTS.md` documented fallback-to-raw-MCP invocations.

## Rationale
- **Portability:** A user can learn four commands and use them on any platform.
- **Fallback:** If an adapter is incomplete, a user can always invoke the MCP tools directly using the documented tool names.
- **Scope control:** Restricting to four prevents command explosion and keeps adapters maintainable.

## Consequences
- Every adapter must implement these four, even if the host platform doesn't support direct CLI / slash commands.
- The universal set is immutable without a breaking change (new major version).
- Adapters that add more than the four must clearly document which are universal vs. optional.

## Alternatives Considered
- **A-1 (Rejected):** No universal set; each adapter exposes whatever feels native. ✗ Breaks portability; users must re-learn per platform.
- **A-2 (Rejected):** Six or more universal commands (add `edit`, `archive`, `lint`). ✗ Premature scope; first priority is the four core workflows.

## Drives
- KAT-I-0006 (Agent Platform Strategy Pattern) — defines the adapter lifecycle and initialization contract.
- KAT-T-0141 (interface task) — implements the adapter interfaces to enforce the universal four.

## Related
- KAT-A-0001 (Storage Strategy) — locks the eight MCP tools that the universal commands wrap.
- KAT-V-0001 (Katana Vision) — platform-agnostic pluggable agent-platform adapter principle.
