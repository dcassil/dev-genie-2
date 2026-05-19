---
id: validation-gates
level: initiative
title: "Validation Gates and Completeness Checks"
short_code: "KAT-I-0002"
created_at: 2026-05-09T16:15:00.000000+00:00
updated_at: 2026-05-09T16:15:00.000000+00:00
parent: KAT-V-0001
blocked_by: [document-templates-and-schema]
archived: false

tags:
  - "#initiative"
  - "#phase/completed"


exit_criteria_met: false
estimated_complexity: M
strategy_id: NULL
initiative_id: validation-gates
---

# Validation Gates and Completeness Checks Initiative

## Context

Templates without enforcement are suggestions. Katana relies on gates to keep agents from advancing half-baked work. Two gate categories:

1. **Template gates** — a document is "complete" only when its required sections are filled (no placeholder strings, no template boilerplate left, all required frontmatter present).
2. **Workflow gates** — phase transitions and decompositions blocked unless conditions are met (parent published, child docs exist, exit criteria checked, etc.).

Gate behavior must be deterministic and explainable: when a gate fails, the agent gets a structured reason it can act on, not a vague "not ready."

## Scope

- Gate engine: pure functions that take a doc (or doc + workspace context) and return `{ok, reasons[]}`.
- Built-in gate library:
  - Template completeness (no `{placeholder}` strings, all `[REQUIRED]` sections non-empty).
  - Frontmatter schema validation.
  - Parent-readiness (e.g. epic must be in `ready` or beyond before user stories can be created under it).
  - Decomposition gate (story must satisfy story-level completeness before tasks can be created).
  - Phase-transition exit-criteria (each phase declares what must be true to leave it).
- Gate composition — workflows compose gates from the library; gates are first-class config.
- Hookable: gate definitions belong in config so non-engineers can add or relax gates per project.
- Pluggable gate backend interface (so future gates can call out to LLMs for "is this section actually meaningful?").

## Out of scope

- The actual workflow loop that consumes gate results (covered by workflow-engine initiative).
- Authoring the templates the gates validate against (covered by templates initiative).

## Open questions

- Do we want LLM-based "semantic completeness" gates in MVP, or only mechanical (string/structure) gates? Lean MVP: mechanical only; design the interface so LLM gates can be added later.
- How do we report gate failures to the agent — structured JSON via MCP response, or a markdown checklist? Probably both: JSON for machines, markdown for humans.

## Exit criteria

- Gate engine implemented with mechanical gate library.
- All built-in gates have unit tests with passing/failing fixtures.
- Gate config schema documented; example katana config shows how to add/disable gates.
- Gate failures produce structured, actionable output.
