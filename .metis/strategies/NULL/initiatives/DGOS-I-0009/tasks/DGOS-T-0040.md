---
id: conflict-class-and-ownership
level: task
title: "Conflict-class and ownership-surface evaluator for sibling impact"
short_code: "DGOS-T-0040"
created_at: 2026-05-24T19:02:47.986724+00:00
updated_at: 2026-05-24T19:48:52.890253+00:00
parent: DGOS-I-0009
blocked_by: []
archived: false

tags:
  - "#task"
  - "#phase/completed"


exit_criteria_met: false
strategy_id: NULL
initiative_id: DGOS-I-0009
---

# Conflict-class and ownership-surface evaluator for sibling impact

## Parent Initiative

[[DGOS-I-0009]] — Decision Policy & Governance. This task implements the **conflict-class and ownership-surface evaluator** that the initiative body and ADR-3 require: `hard_conflict` / `soft_conflict` / `no_conflict` for sibling impact. It is the third deterministic evaluation input the verdict assembler composes, and it realizes ADR-3's "explicit ownership surfaces + runtime touch reports + conservative parent-side conflict checks" model deterministically.

## Objective

Implement a deterministic, pure conflict evaluator in `engines/src/decision-policy/` that, given a `PolicyDecisionInput` (the deciding node's `ownership_scope`, `touched_surfaces`, optional `matched_dependencies`) plus the declared ownership surfaces of sibling work items, returns a `ConflictAssessment` (`{ conflict_class: "no_conflict" | "soft_conflict" | "hard_conflict"; affected_siblings: string[]; rationale: string }`). This maps onto the ADR-3 ownership-surface fields (`owns_files`, `owns_interfaces`, `owns_data`, `owns_workflow_steps`, `depends_on`) and the protocol `ownership-surface.schema.json` / `touch-report.schema.json` artifacts. No model call, no I/O.

## Acceptance Criteria

## Acceptance Criteria

## Acceptance Criteria

- [ ] A `SiblingOwnership` input type is defined (or reused from `protocol`'s `ownership-surface.schema.json` generated binding) capturing `owns_files`/`owns_interfaces`/`owns_data`/`owns_workflow_steps`/`depends_on`, and the evaluator accepts a list of sibling ownership surfaces alongside the deciding input's touched surfaces (grounded in `protocol/schemas/touch-report.schema.json`).
- [ ] A pure function `assessConflict(input, siblings): ConflictAssessment` implements the ADR-3 rules: **hard_conflict** = direct ownership overlap (a touched surface is owned by a sibling) or a shared-contract/interface change another sibling owns; **soft_conflict** = no confirmed overlap but the touched surface intersects a sibling's `depends_on` (dependency risk, matching the initiative's `matched_dependencies` example); **no_conflict** = neither. Each branch records which siblings triggered it in `affected_siblings`.
- [ ] Surface comparison is structured, not string-equality-only: `interface:`/`config:`/`file:`/`workflow:`/`data:` prefixes are compared within their kind, and `config:` wildcard ownership (e.g. `config:admin.audit.*`) is matched as a prefix/glob against concrete touched config keys (the initiative's audit example must classify as hard/over-scoped, not no_conflict).
- [ ] The evaluator is **total and conservative**: when ownership data is incomplete it errs toward the safer (higher) conflict class with a rationale, never silently returns `no_conflict` on ambiguous overlap (ADR-3 "conservative parent-side conflict checks").
- [ ] Unit tests cover: the three initiative-body examples (copy → `no_conflict`; save with `interface:PUT /api/admin/settings` + `matched_dependencies: [story-admin-settings-shell]` → `soft_conflict` with that sibling; audit `config:admin.audit.*` overlapping a sibling → `hard_conflict`); direct file overlap → hard; depends_on-only → soft; disjoint surfaces → no_conflict; incomplete-data conservative case; and config-wildcard matching.
- [ ] `engines/` typecheck/lint/test/build pass clean; no escape hatches; evaluator is synchronous and pure.

### Open question for implementation

- [ ] **Where do sibling ownership surfaces come from at evaluation time?** The Engine is pure and must receive them as input. Document in a status update how the daimyo adapter (DGOS-T-0043) will source siblings — for v1 this is from the `WorkSource`/execution context the Supervisor already holds (ADR-5 ownership surfaces are declared at decomposition), passed into `PolicyDecisionInput`. If siblings are unavailable, the evaluator degrades to `no_conflict` with an explicit "no sibling data" rationale and the assembler may raise review based on scope alone. Confirm this degradation is acceptable or flag it.

## Implementation Notes

### Technical Approach

- Implement as a pure module independent of classifier (DGOS-T-0038) and rules (DGOS-T-0039); the assembler (DGOS-T-0041) composes the three. Reuse `protocol`'s `ownership-surface`/`touch-report` generated types rather than hand-rolling surface shapes (JSON Schema is source of truth, per DGOS-T-0029's rule).
- Normalize surfaces into `{kind, identifier}` pairs before comparison so prefix/glob logic is centralized and testable. Treat `depends_on` strictly as the soft-conflict signal, ownership overlap as the hard-conflict signal, per ADR-3's distinction.

### Dependencies

- **Upstream:** [[DGOS-T-0037]] (package + types + `ownership-surface`/`touch-report` protocol bindings available). Hard blocker.
- **Downstream:** [[DGOS-T-0041]] (assembler folds `conflict_class` into the final `PolicyVerdict`'s `conflict_class`/`route_to`); [[DGOS-T-0043]] (adapter sources sibling ownership from the Supervisor's WorkSource context).

### Risk Considerations

- **Missing/incomplete sibling data producing false `no_conflict`** is the dangerous failure (a hidden cross-cutting change proceeds). Mitigation: conservative default + explicit "no sibling data" rationale + the open-question handling above.
- **Surface-kind mismatch** (comparing a `file:` to an `interface:`) producing false negatives. Mitigation: compare within kind, with the config-wildcard test as a guard.

### Execution Profile

**Recommended Agent: opus + medium.** Substantive deterministic logic realizing an ADR-3 contract with real conservatism/safety reasoning, plus one genuine integration question (sibling sourcing) to settle. Single focused module within an established package, so below the load-bearing-architecture tier but above mechanical.

## Status Updates

*To be added during implementation.*

- 2026-05-24: Implemented the pure `engines/src/decision-policy/conflict.ts` evaluator. It accepts explicit sibling ownership surfaces as input, reuses protocol `OwnershipSurface`/`TouchReport` types, normalizes prefixed surface identifiers before comparison, treats direct ownership and shared contract overlap as `hard_conflict`, dependency intersection and caller-provided `matched_dependencies` as `soft_conflict`, degrades absent siblings to scope-only `no_conflict`, and treats present but incomplete sibling data conservatively as `hard_conflict`. DGOS-T-0043 should source sibling ownership from the Supervisor `WorkSource`/execution context where ADR-5 says ownership surfaces are declared at decomposition time; when that context has no siblings available, the adapter can pass no siblings and let this evaluator return the explicit no-sibling-data rationale.
- 2026-05-24 (orchestrator verification): re-ran engines typecheck/lint/test/build — green (36 tests). Pure conflict evaluator: hard (direct ownership / shared-contract / config-wildcard overlap, or incomplete sibling data — conservative), soft (depends_on overlap + caller matched_dependencies), no_conflict (disjoint or absent siblings → scope-only). Reuses protocol OwnershipSurface/TouchReport + prefix conventions; no model/IO. engines-only. engines 0.3.0 → 0.4.0. No escape hatches. **exit_criteria_met: true.** Completed.