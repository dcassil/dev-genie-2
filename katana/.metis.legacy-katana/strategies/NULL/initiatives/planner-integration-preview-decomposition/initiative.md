---
id: planner-integration-preview-decomposition
level: initiative
title: "Planner Integration and Preview Decomposition"
short_code: "KAT-I-0009"
created_at: 2026-05-18T00:00:00+00:00
updated_at: 2026-05-18T00:00:00+00:00
parent: KAT-V-0001
blocked_by: [devgenie-architecture-and-integration]
archived: false

tags:
  - "#initiative"
  - "#phase/discovery"


exit_criteria_met: false
estimated_complexity: L
strategy_id: NULL
initiative_id: planner-integration-preview-decomposition
---

# Planner Integration and Preview Decomposition

## Context

Katana currently owns workflow execution: document hierarchy, gates, phase transitions, board state, MCP tools, and task execution loops. The emerging dev-genie ecosystem needs a separate Planner capability that classifies work, selects planning patterns, performs preview decomposition, detects conflicts, and produces structured planning artifacts that Katana can consume.

This initiative integrates Katana with Planner without moving Katana's execution responsibilities into Planner. Planner should decide what preview decomposition means and whether formal decomposition is ready. Katana should enforce those decisions at workflow boundaries and convert approved formal decomposition into visible Katana documents.

The key new distinction is:

```text
preview decomposition:
  internal, replaceable, hidden by default, used for planning and conflict discovery

formal decomposition:
  user-visible, tracked, gated, executable, converted into Katana docs/tasks
```

## Goals & Non-Goals

**Goals:**
- Add Planner artifact support to Katana documents or workspace metadata.
- Trigger preview decomposition when a Katana initiative, epic, or story is created or materially edited.
- Supersede stale preview artifacts when source content changes.
- Keep preview candidate children off the normal board and out of the executable backlog.
- Add gates that block formal decomposition when the preview is missing, stale, or has unresolved conflicts.
- Convert approved formal decomposition output into Katana documents through the existing MCP/decompose path.
- Link formal child documents back to the Planner artifact that produced them.
- Support initial planning and delta replanning for long-running epics/projects.

**Non-Goals:**
- Do not implement Planner core inside Katana.
- Do not make Planner a hard runtime dependency until the boundary and artifact schema are stable.
- Do not expose preview candidate tasks as normal user-managed work items.
- Do not replace Katana's existing phase machine, board, storage, MCP, or high-pass/low-pass task execution loop.

## Detailed Design

Planner artifacts should be attached to Katana scopes by reference rather than copied into every child document. Candidate storage options:

- `.katana/planner/previews/` for Katana-local Planner artifacts.
- `.planner/` for a standalone Planner workspace.
- Frontmatter pointers on Katana documents: `planning_preview_id`, `planning_preview_hash`, `planning_status`.

The first implementation can support a Katana-local artifact store while keeping the artifact shape compatible with a future standalone Planner service.

Preview metadata should include:

```yaml
preview_id: PLAN-PREV-0001
source_ref: KAT-I-0009
source_hash: sha256-of-source-document-and-relevant-context
generated_at: 2026-05-18T00:00:00Z
status: current | superseded
visibility: internal
pattern: greenfield | feature | refactor | port | mixed
domain_schema: agent-workflow
conflicts: []
candidate_children: []
formal_decomposition_status: not_started | ready | created | stale
```

Katana should update or invalidate the preview when:

- the source document body changes;
- planning-relevant frontmatter changes;
- parent context changes;
- a related dependency changes;
- the selected pattern or schema changes.

New gates:

- `preview.current` — the source hash matches the current source.
- `preview.conflicts-reviewed` — conflicts are empty or explicitly acknowledged.
- `formal-decomposition.ready` — Planner says candidate children are ready to commit.
- `formal-decomposition.not-stale` — no source edits have happened after preview generation.

The formal decomposition path remains Katana-owned. The Planner output is an input to `decompose_document`, not a replacement for storage, short-code allocation, document writing, or board state.

## Requirements

### Functional Requirements

- REQ-001: Katana can store or reference a Planner preview artifact for an initiative, epic, or story.
- REQ-002: Katana can determine whether a preview artifact is current by comparing source hashes.
- REQ-003: Katana can mark previous preview artifacts as superseded when a source document is edited.
- REQ-004: Katana blocks formal decomposition when no current preview exists unless the user explicitly forces the operation.
- REQ-005: Katana blocks formal decomposition when Planner reports unresolved conflicts.
- REQ-006: Katana converts approved formal decomposition output into visible documents using existing document creation and short-code rules.
- REQ-007: Katana links created documents to the Planner artifact used to create them.

### Non-Functional Requirements

- NFR-001: Preview artifacts must not appear as executable board cards.
- NFR-002: Re-running preview generation must be idempotent for unchanged source content.
- NFR-003: Stale speculative previews must not be fed into normal task execution context.
- NFR-004: The integration must work without assuming a web-app domain vocabulary.

## Architecture

Planner remains a separate conceptual component. Katana integrates through an adapter boundary:

```text
Katana document change
-> Planner adapter generates or refreshes preview
-> Katana stores/links preview artifact
-> Katana gates formal decomposition
-> Katana creates visible docs/tasks from approved formal output
```

The initial adapter may be a local stub that reads/writes Planner-compatible JSON. A later adapter can call a Planner MCP server or shared library.

## Alternatives Considered

- **Put all planning logic inside Katana.** Rejected because dev-genie, guardrails, audit, and future tools also need planning intelligence.
- **Make Planner create Katana documents directly.** Rejected because Katana owns workflow state, short-code allocation, storage, and board projection.
- **Show preview tasks on the board.** Rejected because speculative children create user and agent confusion.
- **Keep every stale preview active for history.** Rejected because stale speculative context is dangerous for agents. Superseded previews may be archived, but only the current preview should participate in planning.

## Implementation Plan

1. Finalize the Planner artifact schema needed by Katana: preview metadata, conflicts, candidate children, dependencies, and formal readiness.
2. Add Katana document metadata or sidecar storage for Planner preview references.
3. Implement source hashing and stale-preview detection.
4. Add preview lifecycle helpers: create, supersede, read current, mark formal decomposition created.
5. Add planning-readiness gates before `decompose_document`.
6. Update `decompose_document` to accept or resolve approved Planner formal decomposition output.
7. Add board filtering so preview artifacts never show as normal cards.
8. Add unit and integration tests covering current preview, stale preview, unresolved conflicts, and successful formal decomposition.
9. Document the Katana/Planner ownership boundary and the preview-vs-formal decomposition lifecycle.

## Exit Criteria

- Katana has a documented integration contract for Planner artifacts.
- Preview decomposition can be generated or stubbed for a Katana initiative/story and stored without appearing on the board.
- Editing the source document supersedes the old preview and marks formal decomposition stale.
- Formal decomposition is blocked when preview state is missing, stale, or conflicted.
- Approved formal decomposition creates normal Katana child documents and links them back to the Planner artifact.
