---
id: document-templates-and-schema
level: initiative
title: "Document Templates and Schema"
short_code: "KAT-I-0001"
created_at: 2026-05-09T16:15:00.000000+00:00
updated_at: 2026-05-09T16:15:00.000000+00:00
parent: KAT-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/completed"


exit_criteria_met: false
estimated_complexity: M
strategy_id: NULL
initiative_id: document-templates-and-schema
---

# Document Templates and Schema Initiative

## Context

Katana's value comes from doc-driven flow: every step in the workflow is grounded in a document with a template, required fields, and a gate. Before any engine, MCP, or board work happens, we need to lock down the document hierarchy and what each document type *is*.

The hierarchy:

```
Product Doc           (architecture | system-design | UI variants)
  └── Epic            (architecture | major-feature | UI variants)
       └── User Story (architecture | interface-contract | UI variants)
            ├── Task[high-pass]   — strong-model: scaffolds, types, contract comments
            ├── Task[low-pass]    — cheap-model: implementation against scaffold
            └── Task[UI] (opt)    — UI-specific work
```

Each document level can have multiple "shapes" (architecture / UI / contract / etc.). Templates must declare required vs. conditional sections so the workflow can validate completeness without forcing irrelevant fields.

## Scope

- Define the canonical document types and their relationships (frontmatter schema).
- Author markdown templates for each type and each shape, marking required and conditional sections explicitly.
- Define short-code conventions (e.g. `KAT-PD-####`, `KAT-E-####`, `KAT-US-####`, `KAT-TH-####`, `KAT-TL-####`).
- Decide how variants are tagged (subtype field in frontmatter vs. separate templates).
- Provide example "filled-in" docs for each type as fixtures for downstream tests.

## Out of scope

- The validation engine itself (covered by validation-gates initiative).
- Storage and persistence (covered by MCP/storage initiative).
- Phase machine details (covered by workflow-engine initiative).

## Open questions

- Should "shapes" (architecture/UI/contract) be subtypes of one doc, or distinct doc types? Lean: subtype field, one template family per level.
- High-pass vs low-pass: separate doc types, or one task type with a `pass` field? Spec says separate documents — confirm during decomposition.
- Do we want a "spec" or "ADR" doc layer, or fold those into Epic/Story? Defer.

## Exit criteria

- All template files exist and are reviewed.
- A worked example exists for each level (Product Doc → Epic → Story → both task passes).
- Frontmatter schema is documented (which fields, required/optional, validation rules).
- Short-code convention is decided and documented.
