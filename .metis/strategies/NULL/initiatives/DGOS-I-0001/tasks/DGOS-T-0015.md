---
id: shared-sub-schemas-ownership
level: task
title: "Shared Sub-Schemas: Ownership-Surface & Touch-Report"
short_code: "DGOS-T-0015"
created_at: 2026-05-23T18:56:07.150192+00:00
updated_at: 2026-05-23T18:56:07.150192+00:00
parent: DGOS-I-0001
blocked_by: []
archived: false

tags:
  - "#task"
  - "#phase/todo"


exit_criteria_met: false
strategy_id: NULL
initiative_id: DGOS-I-0001
---

# Shared Sub-Schemas: Ownership-Surface & Touch-Report

## Parent Initiative

[[DGOS-I-0001]] — authors the two reusable sub-schemas (ownership-surface metadata and leaf touch-report) that the envelope's `ownership` field and the execution artifacts reference. Per the design direction these stay shared sub-schemas in v1, not standalone primary artifacts.

## Objective

Define the **ownership-surface** sub-schema (`owns_files`, `owns_interfaces`, `owns_data`, `owns_workflow_steps`, optional `depends_on`) and the **touch-report** sub-schema (concrete touched files/interfaces/data/workflow-steps a leaf reports), as JSON Schemas referenced by the envelope and execution artifacts. These are the contract behind ADR-3's parent-side sibling-conflict checks, and they already exist informally in `daimyo` (T-0011 added touch-report fields to `domain.ts`) and ADR-3 — this task makes them the authoritative shared schema.

## Acceptance Criteria

- [ ] An **ownership-surface** JSON Schema defines `owns_files`, `owns_interfaces`, `owns_data`, `owns_workflow_steps` (arrays of string surface identifiers) and optional `depends_on`, matching the shapes in the initiative's example and ADR-3.
- [ ] A **touch-report** JSON Schema defines `touched_files`, `touched_interfaces`, `touched_data`, `touched_workflow_steps` (and a `task_id`/`report_type` as appropriate), matching the initiative's example.
- [ ] Both are authored as reusable `$ref`-able sub-schemas (not top-level artifacts); the envelope's `ownership` field (from [[DGOS-T-0014]]) references the ownership-surface sub-schema.
- [ ] Surface-identifier conventions are documented (e.g. `interface:`, `table:`, `config:`, `workflow:` prefixes seen in the examples) so producers/consumers agree on identifier semantics for conflict matching.
- [ ] TS bindings generated via the T-0013 pipeline; drift check passes.
- [ ] `valid/`/`invalid/` fixtures cover both sub-schemas (including the prefixed-identifier conventions), run by the harness.
- [ ] The shapes are checked against `daimyo`'s existing ownership/touch-report TS types so [[DGOS-T-0019]]'s reconciliation is minimal; any divergence is recorded for T-0019 (schema is authoritative).

## Implementation Notes

### Technical Approach

- Author both as standalone `.schema.json` files referenced by `$ref`; keep them payload-agnostic so ExecutionRecord ([[DGOS-T-0016]]) and parent conflict-evaluation records can reuse them.
- Cross-check field names against `daimyo/src/core/domain.ts` (ownership surface + touch-report fields added in T-0011/T-0015-era work) and ADR-3's `owns_*` field list; converge names, and where daimyo diverges, note it for [[DGOS-T-0019]].
- Document surface-identifier prefix conventions explicitly — conflict detection (daimyo's wave logic) matches on these strings, so the convention is part of the contract, not cosmetic.

### Dependencies

- **Upstream:** [[DGOS-T-0013]] (pipeline + harness), [[DGOS-T-0014]] (envelope references `ownership`).
- **Downstream:** [[DGOS-T-0016]] (ExecutionRecord references touch-report/ownership), [[DGOS-T-0019]] (daimyo conforms), [[DGOS-T-0020]] (fixtures/compat).

### Risk Considerations

- **Identifier-convention drift:** if surface-identifier prefixes aren't standardized, sibling-conflict matching silently mismatches. Mitigation: document and fixture the conventions.
- **Divergence from daimyo:** daimyo's touch-report fields may differ slightly from the initiative examples. Mitigation: converge here, record divergence, let T-0019 reconcile against the authoritative schema.

### Execution Profile

**Recommended Agent: opus + medium.** Focused schema-authoring of two well-specified sub-schemas with clear examples in the initiative and ADR-3; the only real reasoning is converging identifier conventions and aligning with daimyo's existing fields. Follows the T-0013/T-0014 pattern.

## Status Updates

*To be added during implementation.*
