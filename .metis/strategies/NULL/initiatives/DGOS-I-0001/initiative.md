---
id: artifact-protocol-shared-schemas
level: initiative
title: "Artifact Protocol & Shared Schemas"
short_code: "DGOS-I-0001"
created_at: 2026-05-21T17:42:28.218354+00:00
updated_at: 2026-05-23T18:52:03.542097+00:00
parent: DGOS-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/decompose"


exit_criteria_met: false
estimated_complexity: L
strategy_id: NULL
initiative_id: artifact-protocol-shared-schemas
---

# Artifact Protocol & Shared Schemas Initiative

## Context

The original `I-0002` combined two different concerns: the cross-primitive artifact contract and the document-layer storage/schema substrate. The recreation plan now separates them so protocol work can evolve without being tied to Katana document internals.

This initiative owns the shared artifact contract for runtime primitives. It defines the machine-readable envelopes and metadata that make Engines, Roles, and Loops interoperable, inspectable, and resumable.

## Goals & Non-Goals

**Goals:**
- Define shared artifact metadata across runtime primitives.
- Define schemas for `ExecutionRecord`, `ValidationReport`, `DecisionRequest`, `DecisionRecord`, `RoleInvocation`, and `RoleResult`.
- Standardize ownership metadata, source/output references, and content-hash expectations.
- Make completion, skip, confidence, and missing-context signals machine-readable.

**Non-Goals:**
- Own markdown/frontmatter storage details for Katana documents.
- Implement validation logic itself.
- Decide package boundaries for every artifact producer.

## Architecture

### Overview

The protocol layer sits above storage and below runtime behavior. Engines, Roles, and Loops all consume and emit artifacts through this shared contract, while the Document Engine persists those artifacts in repo-native form.

### Component Diagrams

Core components are: artifact schema definitions, artifact reference and hashing rules, ownership and provenance fields, and compatibility/versioning rules for producers and consumers.

### Sequence Diagrams

A typical sequence is: Role or Loop receives input refs -> emits a typed artifact -> Validation Engine evaluates the artifact or its outputs -> parent Loop records the result in durable state.

## Detailed Design

Every shared artifact should declare a stable identity, source artifact refs, output artifact refs, ownership metadata, confidence, missing context, human review requirement, and diagnostics where relevant.

The highest-priority artifacts are:

- `ExecutionRecord`: durable execution evidence and write-back from leaf work.
- `ValidationReport`: authoritative validation result used for completion decisions.
- `DecisionRequest`: a typed escalation from executing work.
- `DecisionRecord`: the routed answer with scope and follow-up instructions.
- `RoleInvocation` and `RoleResult`: typed envelopes for Role calls.
- ownership-surface and touch-report metadata: declared `owns_files`, `owns_interfaces`, `owns_data`, `owns_workflow_steps`, optional `depends_on`, and leaf-reported touched surfaces for parent-side sibling checks

Versioning rules should allow producers to evolve while preserving compatibility guarantees for downstream consumers. Hashes and provenance need to be strong enough for validation, diffing, supersession, and replay.

### Approved design direction

This initiative will use one shared artifact envelope with typed payloads.

The envelope should carry required cross-primitive fields such as:

- `artifact_id`
- `artifact_type`
- `schema_version`
- `protocol_version`
- `producer`
- `created_at`
- `source_refs`
- `output_refs`
- `ownership`
- `confidence`
- `review_required`
- `diagnostics`

Each concrete artifact type then provides a typed payload body under that shared envelope.

The initial v1 artifact catalog should be:

- `ExecutionRecord`
- `ValidationReport`
- `DecisionRequest`
- `DecisionRecord`
- `RoleInvocation`
- `RoleResult`

The design should use:

- `schema_version` for type-specific schema evolution
- `protocol_version` for cross-artifact compatibility expectations
- shared sub-schemas for ownership metadata and touch-report data rather than promoting them to standalone primary artifacts in v1

Schema authoring uses **JSON Schema as the single source of truth, with a generated TypeScript binding** (decision recorded 2026-05-23, superseding the earlier "JSON Schema + Rust types in lockstep" direction):

- JSON Schema is the portable, authoritative contract for validation, fixtures, persistence, and cross-package adapters.
- The TypeScript types are **generated/reconciled from the JSON Schema**, not authored independently — they are the implementation-facing binding for the runtime code (notably the already-built `daimyo` Loop substrate, which is TypeScript).
- **Rust is dropped for v1.** The original Rust direction predated the DGOS-A-0005 execution-substrate decision; the substrate (`daimyo`, DGOS-I-0011) shipped in TypeScript, so a Rust binding has no current consumer. JSON Schema keeps the contract language-portable, so a Rust (or other) binding can be added later without re-authoring the contract.
- **Reconciliation obligation:** `daimyo/src/core/domain.ts` already hand-rolled TypeScript types for several v1 artifacts (`DecisionRequest`, `DecisionRecord`, `DecisionVerdict`, execution evidence, ownership-surface, touch-report). This initiative must make those conform to (ideally be generated from) the JSON Schema source of truth rather than fork from it — see the decomposition's reconciliation task.

This is preferred over separate top-level schemas because Loop, Policy, Validation, and Role handoffs all need a stable common contract surface across packages.

### Schema examples

The first concrete protocol addition should be ownership-surface metadata plus a leaf touch report.

Example ownership surface:

```json
{
  "artifact_id": "story-admin-settings-data",
  "ownership": {
    "owns_files": [
      "src/features/admin/settings/data/**"
    ],
    "owns_interfaces": [
      "GET /api/admin/settings",
      "PUT /api/admin/settings"
    ],
    "owns_data": [
      "table:admin_settings",
      "config:admin.settings.*"
    ],
    "owns_workflow_steps": [
      "admin-settings:load",
      "admin-settings:save"
    ],
    "depends_on": [
      "interface:auth-admin-session",
      "workflow:admin-shell-navigation"
    ]
  }
}
```

Example leaf touch report:

```json
{
  "task_id": "task-admin-settings-save",
  "report_type": "touch_report",
  "touched_files": [
    "src/features/admin/settings/data/save.ts",
    "src/routes/api/admin/settings.ts"
  ],
  "touched_interfaces": [
    "PUT /api/admin/settings"
  ],
  "touched_data": [
    "table:admin_settings"
  ],
  "touched_workflow_steps": [
    "admin-settings:save"
  ]
}
```

Example parent conflict evaluation:

```json
{
  "parent_id": "story-admin-settings",
  "child_id": "task-admin-settings-save",
  "conflict_class": "soft_conflict",
  "matched_siblings": [
    "story-admin-settings-shell"
  ],
  "matched_surfaces": [
    "workflow:admin-shell-navigation"
  ],
  "decision": "load_sibling_context"
}
```

These examples are illustrative rather than final field names, but they establish the required shape: declared ownership, runtime touch evidence, and parent-owned conflict decisions.

## Alternatives Considered

- Keep protocol and document-engine work in one initiative: rejected because protocol contracts and document substrate work have different ownership surfaces and decompose into different tasks.
- Let each primitive define its own artifact shapes: rejected because it would reintroduce weak contracts and prose parsing.
- Focus only on execution artifacts first: rejected because Role and validation envelopes are part of the same interoperability boundary.

## Implementation Plan

- [ ] Define shared artifact metadata fields and compatibility rules.
- [ ] Specify schemas for `ExecutionRecord`, `ValidationReport`, `DecisionRequest`, and `DecisionRecord`.
- [ ] Specify `RoleInvocation` and `RoleResult` in the shared protocol catalog.
- [ ] Define hashing, provenance, ownership-surface conventions, and leaf touch-report fields.
- [ ] Add fixture-based tests for schema validation and compatibility checks.

## Decomposition (decided 2026-05-23)

Decomposed into 8 tasks. Representation: **JSON Schema source-of-truth + generated TS binding**, reconciling daimyo's already-shipped types (Rust dropped for v1). Packaging: a new top-level sibling **`protocol`** package (JSON Schemas + generated TS binding) that daimyo depends on. Dependency order (→ = depends on):

| Task | Title | Depends on | Agent |
|------|-------|-----------|-------|
| [[DGOS-T-0013]] | `protocol` scaffold + JSON-Schema→TS codegen + fixture harness | — | opus + high |
| [[DGOS-T-0014]] | Shared artifact envelope + versioning/compat rules | T-0013 | opus + high |
| [[DGOS-T-0015]] | Shared sub-schemas: ownership-surface + touch-report | T-0013, T-0014 | opus + medium |
| [[DGOS-T-0016]] | ExecutionRecord + ValidationReport schemas + TS bindings | T-0014, T-0015 | opus + medium |
| [[DGOS-T-0017]] | DecisionRequest/Record/Verdict schemas + TS bindings (reconcile daimyo) | T-0014 | opus + high |
| [[DGOS-T-0018]] | RoleInvocation + RoleResult schemas + TS bindings | T-0014 | opus + medium |
| [[DGOS-T-0019]] | Reconcile daimyo onto the protocol | T-0015, T-0016, T-0017, T-0018 | opus + high |
| [[DGOS-T-0020]] | Compatibility/versioning enforcement + fixture corpus | T-0016, T-0017, T-0018, T-0019 | opus + medium |

**Critical path:** T-0013 → T-0014 → {T-0015, T-0017, T-0018} → T-0016 → T-0019 → T-0020. The two load-bearing tasks are T-0017 and T-0019 (the daimyo reconciliation). Decomposition itself is opus + high.