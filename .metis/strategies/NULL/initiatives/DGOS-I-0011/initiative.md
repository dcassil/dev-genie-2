---
id: recursive-govern-verify-execution
level: initiative
title: "Recursive Govern-Verify Execution Loop"
short_code: "DGOS-I-0011"
created_at: 2026-05-21T17:47:46.045546+00:00
updated_at: 2026-05-22T22:09:28.838972+00:00
parent: DGOS-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/completed"


exit_criteria_met: false
estimated_complexity: L
strategy_id: NULL
initiative_id: recursive-govern-verify-execution
---

# Recursive Govern-Verify Execution Loop Initiative

## Context

The new ADR defines one recursive execution model, but that still needs to be decomposed into implementation work: leaf behavior, inner-node governance, durable records, rework loops, and child-to-parent contracts.

This initiative is the implementation owner for the recursive loop model and replaces the old split between developer-loop, orchestration, wave, and runtime-decision initiatives.

**Substrate decision (DGOS-A-0005).** The execution substrate for this Loop is decided in **ADR DGOS-A-0005 — "Loop Execution Substrate: Out-of-Process Supervisor and Pluggable Agent Transport."** The Loop is implemented by a new top-level sibling plugin, **`daimyo`**: an out-of-process deterministic Supervisor (not an in-context agent) that drives disposable Claude agents via a hexagonal core with three ports (AgentTransport, WorkSource, DecisionProvider) plus capability adapters (Validation, Repo Intelligence, Context, Roles) that ship as trivial built-ins standalone and are swapped for dev-genie's real Engines/Roles when injected. Decomposition of this initiative MUST follow that ADR; in particular, **the first task is an SDK spike** to verify that sub-agent (Task-spawned) tool-permission requests reliably surface to the parent session's `canUseTool`/hooks against a pinned SDK version — ADR-3's recursion and the AgentTransport `needs_permission` event depend on this, with a PTY fallback if it does not hold.

## Goals & Non-Goals

**Goals:**
- Implement leaf and inner-node behavior under one Loop contract.
- Implement `done`, `needs-decision`, and `failed` child return semantics.
- Support parent-owned authoritative validation and rework handling.
- Support multi-agent waves as a recursive case rather than a separate architecture.

**Non-Goals:**
- Reintroduce separate loop families.
- Let leaf nodes own completion authority.
- Collapse specialist Role reasoning into the Loop itself.

## Architecture

### Overview

The Loop has two node types:

- leaf nodes: bounded implementation and local validation
- inner nodes: governance, authoritative validation, rework, and upward completion

### Sequence Diagrams

Task assigned to leaf -> leaf edits and validates locally -> returns `done`, `needs-decision`, or `failed` -> parent validates or routes decisions -> rework or completion propagates upward.

## Detailed Design

Key concerns are:

- durable state and resume semantics
- child invocation and tracking
- parent-child return contract
- decision routing through Roles
- rework loop after authoritative validation fails
- quiesce and resume behavior when shared contracts change during parallel work
- parent-side sibling impact detection from ownership surfaces and runtime touch reports

The initiative should keep decomposition aligned with capability or contract boundaries so parent validation scopes remain coherent.

### Record examples

The first concrete loop records should cover node state, upward escalation, and parent conflict handling.

Example leaf Loop state:

```json
{
  "loop_id": "task-admin-settings-save",
  "node_type": "leaf",
  "status": "waiting_for_parent_validation",
  "parent_loop_id": "story-admin-settings-save",
  "assigned_scope": {
    "owns_files": [
      "src/features/admin/settings/data/save.ts",
      "src/routes/api/admin/settings.ts"
    ],
    "owns_interfaces": [
      "PUT /api/admin/settings"
    ],
    "owns_data": [
      "table:admin_settings"
    ],
    "owns_workflow_steps": [
      "admin-settings:save"
    ]
  },
  "local_validation": {
    "status": "passed",
    "report_ref": "validation-local-task-admin-settings-save"
  },
  "execution_record_ref": "execution-task-admin-settings-save-run-003",
  "touch_report_ref": "touch-task-admin-settings-save-run-003",
  "next_action": "bubble_done_to_parent"
}
```

Example `needs-decision` escalation record:

```json
{
  "loop_id": "task-admin-settings-save",
  "return_type": "needs-decision",
  "decision_request_ref": "decision-request-admin-settings-save-004",
  "reason": "shared contract ambiguity",
  "summary": "Changing the save route may affect sibling work that still assumes the old response shape.",
  "suspected_impacts": {
    "interfaces": [
      "PUT /api/admin/settings"
    ],
    "siblings": [
      "story-admin-settings-shell"
    ]
  },
  "next_action": "bubble_to_parent"
}
```

Example parent conflict-resolution record:

```json
{
  "parent_loop_id": "story-admin-settings",
  "child_loop_id": "task-admin-settings-save",
  "conflict_evaluation": {
    "conflict_class": "hard_conflict",
    "matched_siblings": [
      "task-admin-settings-shell"
    ],
    "matched_surfaces": [
      "interface:PUT /api/admin/settings"
    ]
  },
  "parent_decision": {
    "action": "quiesce_sibling_and_reissue",
    "quiesced_siblings": [
      "task-admin-settings-shell"
    ],
    "follow_up": "refresh sibling assumptions against updated response contract"
  }
}
```

These examples are illustrative rather than final field names, but they establish the required shape: leaves emit durable state and escalations, parents evaluate sibling impact, and only parents decide quiesce, resume, or re-issue behavior.

## Alternatives Considered

- Keep separate loop initiatives: rejected because the recursive model is now the architectural baseline.
- Build waves first and generalize later: rejected because wave behavior should inherit from the recursive contract, not define it.
- Let parent nodes reason directly instead of routing to Roles: rejected because governance and specialist reasoning should stay separate.

## Implementation Plan

- [ ] Define Loop state and resume records for leaf and inner nodes.
- [ ] Implement child return handling for `done`, `needs-decision`, and `failed`, with leaves always bubbling decisions to parents.
- [ ] Wire parent validation and rework behavior into the loop lifecycle.
- [ ] Add parent-side sibling impact checks using ownership surfaces, dependency references, and leaf touch reports.
- [ ] Add quiesce/resume semantics for hard-conflict shared-contract changes in parallel work.
- [ ] Add fixture coverage for single-leaf, multi-child, retry, and escalation cases.

## Decomposition (decided 2026-05-22)

Decomposed into 12 tasks per [[DGOS-A-0005]]. Dependency order (→ = depends on):

| Task | Title | Depends on | Agent |
|------|-------|-----------|-------|
| [[DGOS-T-0001]] | SDK Spike: Sub-Agent Permission Surfacing | — | opus + high |
| [[DGOS-T-0002]] | Package Scaffold, Core Types, Port Interfaces & Engine Primitives | T-0001 | opus + high |
| [[DGOS-T-0003]] | Execution-State Store & Resume/Recovery | T-0002 | opus + high |
| [[DGOS-T-0004]] | AgentTransport Port Contract & Claude SDK Adapter | T-0001, T-0002 | opus + high |
| [[DGOS-T-0005]] | WorkSource Port, Markdown Floor & JSON Adapter | T-0002 | opus + medium |
| [[DGOS-T-0006]] | Validation Port & Command-Runner Built-In | T-0002 | opus + medium |
| [[DGOS-T-0007]] | DecisionProvider: Tiered (0/1/3) & DecisionVerdict | T-0002, T-0003 | opus + high |
| [[DGOS-T-0008]] | Supervisor Core Loop: Node Tree & Return Contract | T-0003, T-0004, T-0005, T-0007 | opus + high |
| [[DGOS-T-0009]] | Decision Actions & Tier-2 Investigating Agent | T-0004, T-0007, T-0008 | opus + medium |
| [[DGOS-T-0010]] | Checkpoint Reconciliation & Mid-Execution Superseded | T-0005, T-0008 | opus + high |
| [[DGOS-T-0011]] | Recursive Multi-Child Waves & Quiesce-Resume | T-0008, T-0009, T-0010 | opus + high |
| [[DGOS-T-0012]] | Standalone Packaging & Dev-Genie Integration | T-0004–T-0007 (hard); T-0008–T-0011 (full run) | opus + medium |

**Critical path:** T-0001 → T-0002 → T-0003/T-0004 → T-0007 → T-0008 → T-0010 → T-0011. T-0005 and T-0006 parallelize after T-0002. T-0001 gates the transport path (SDK vs PTY fallback).