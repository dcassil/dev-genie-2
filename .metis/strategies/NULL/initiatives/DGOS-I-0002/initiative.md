---
id: document-engine-katana-schema-layer
level: initiative
title: "Document Engine & Katana Schema Layer"
short_code: "DGOS-I-0002"
created_at: 2026-05-21T17:42:28.238769+00:00
updated_at: 2026-05-21T17:42:28.238769+00:00
parent: DGOS-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/discovery"


exit_criteria_met: false
estimated_complexity: L
strategy_id: NULL
initiative_id: document-engine-katana-schema-layer
---

# Document Engine & Katana Schema Layer Initiative

## Context

Katana is the document-scoped package in the target architecture. It owns repo-native documents, frontmatter and schema rules, indexing, cross-links, templates, and the persistence layer that makes those artifacts durable and searchable.

The original `I-0002` mixed that substrate work with the cross-primitive artifact protocol. This split keeps the Document Engine focused on document semantics and storage concerns.

## Goals & Non-Goals

**Goals:**
- Define the document-layer schema and storage model for repo-native artifacts.
- Own markdown/frontmatter validation, indexing, migrations, and cross-links.
- Preserve Katana's role as the document substrate for execution and planning work.
- Support durable references between strategic `.metis` artifacts and execution-layer documents.

**Non-Goals:**
- Own cross-primitive protocol contracts such as `RoleResult` semantics.
- Own completion authority or validation policy logic.
- Own strategy selection or orchestration.

## Architecture

### Overview

The Document Engine persists repo-native documents and validates their structure. It provides the substrate on which Katana documents, references, templates, and searches operate.

### Component Diagrams

Core components are: markdown/frontmatter schema definitions, index and search layer, cross-link/reference resolution, migration utilities, and document validation hooks.

### Sequence Diagrams

A common sequence is: create or update document -> validate frontmatter and structure -> update indexes and links -> expose searchable and addressable state to tools and loops.

## Detailed Design

The Document Engine should own:

- canonical document schemas for the Katana and Metis layers where applicable
- frontmatter validation rules and migrations
- reference resolution between artifacts and work documents
- indexing/search support for orchestration and context loading
- template compatibility and upgrade paths

It should remain explicitly document-scoped: document storage, schema, references, and discoverability. It should not become the place where runtime completion or orchestration logic accumulates.

### Proposed design direction

The Document Engine should persist shared artifacts as addressable repo-native records with lightweight references from work documents, rather than embedding full runtime payloads directly inside every planning document.

The default storage direction should be:

- work documents keep human-readable summaries, current status, and stable artifact references
- typed artifact payloads are persisted as separate repo-native records under a dedicated Katana-owned artifact subtree
- indexes and cross-links resolve from work documents to artifact records and back again
- migrations operate on the persisted artifact records and document frontmatter independently, with explicit compatibility rules between them

This keeps Katana responsible for persistence, search, and document navigation without turning the document layer into the owner of loop policy, completion authority, or decision semantics.

To keep AI and human discovery reliable even with a dedicated artifact subtree:

- every work document should carry explicit pointers to the latest relevant artifacts such as `latest_validation_ref`, `latest_execution_ref`, and `open_decision_ref` where applicable
- every work document should include a short human-readable current-state summary derived from the latest relevant artifacts
- deep runtime history stays in artifact records, while work documents expose the current surface area needed for fast orientation

### Record model

The document layer should distinguish between:

- work documents: initiatives, tasks, ADRs, and other planning/execution-facing markdown documents
- artifact records: typed persisted records such as `ExecutionRecord`, `ValidationReport`, `DecisionRequest`, `DecisionRecord`, `RoleInvocation`, and `RoleResult`
- indexes and link tables: searchable metadata that connect documents, artifacts, phases, and ownership surfaces

Artifact persistence should use one file per artifact record inside the dedicated artifact subtree.

This is preferred over batched or log-oriented files because:

- artifact identity, linking, and replacement are simpler
- migrations can target individual records without rewriting unrelated history
- indexing and diffing stay straightforward
- AI and human inspection can open the exact record referenced by a work document without scanning a mixed log file

### Schema examples

Example work-document reference block:

```yaml
artifact_refs:
  - validation-parent-story-admin-settings-save-002
  - execution-task-admin-settings-save-run-003
latest_validation_ref: validation-parent-story-admin-settings-save-002
latest_execution_ref: execution-task-admin-settings-save-run-003
```

Example persisted artifact record metadata:

```yaml
artifact_id: validation-parent-story-admin-settings-save-002
artifact_type: ValidationReport
protocol_version: 1
schema_version: 1
producer: validation-engine
subject_ref: story-admin-settings-save
linked_documents:
  - DGOS-T-0042
  - DGOS-T-0043
```

Example index entry direction:

```json
{
  "artifact_id": "validation-parent-story-admin-settings-save-002",
  "artifact_type": "ValidationReport",
  "linked_documents": [
    "DGOS-T-0042",
    "DGOS-T-0043"
  ],
  "ownership_surfaces": [
    "workflow:admin-settings:save",
    "interface:PUT /api/admin/settings"
  ]
}
```

These examples are directional rather than final filenames or field names, but they establish the intended split: documents summarize and point, artifact records persist typed runtime evidence, and indexes make both discoverable to tools and loops.

## Alternatives Considered

- Keep protocol and document concerns together: rejected because cross-primitive contracts and storage substrate work change for different reasons and decompose differently.
- Push document schema rules entirely into Katana with no shared engine framing: rejected because the architectural model benefits from a named document-layer owner.
- Treat markdown files as untyped and validate only at read time: rejected because migrations, indexing, and tool correctness need stronger contracts.

## Implementation Plan

- [ ] Define document-layer schema ownership and boundaries.
- [ ] Specify frontmatter and markdown structure rules for persisted artifacts.
- [ ] Add indexing and cross-link requirements for runtime consumers.
- [ ] Define migration and compatibility strategy for schema evolution.
- [ ] Add fixture coverage for schema validation, indexing, and migration paths.