---
id: roleinvocation-roleresult-schemas
level: task
title: "RoleInvocation & RoleResult Schemas + TS Bindings"
short_code: "DGOS-T-0018"
created_at: 2026-05-23T18:56:10.938174+00:00
updated_at: 2026-05-23T19:54:20.336581+00:00
parent: DGOS-I-0001
blocked_by: []
archived: false

tags:
  - "#task"
  - "#phase/completed"


exit_criteria_met: false
strategy_id: NULL
initiative_id: DGOS-I-0001
---

# RoleInvocation & RoleResult Schemas + TS Bindings

## Parent Initiative

[[DGOS-I-0001]] — completes the v1 catalog with the typed Role-call envelopes, the contract behind every model-backed Role invocation per ADR-1 and ADR-2.

## Objective

Author the **`RoleInvocation`** and **`RoleResult`** schemas (typed payloads under the shared envelope) with generated TS bindings, per **ADR-2 (Role Invocation Convention)** and **ADR-1**'s Role-result schema. `RoleInvocation` is the typed input envelope for a Role call (context bundle + source artifacts + scope); `RoleResult` is the typed output (`produced`/`skipped`/`blocked`/`needs_human` with `confidence`, `missing_context`, `human_review_required`, `source_artifacts`, `output_artifacts`, optional `skip_reason`). These are what the Protocol Proof MVP (DGOS-I-0013) and the Roles initiative (DGOS-I-0010) build on, and what daimyo's DecisionProvider maps its `DecisionVerdict` to/from.

## Acceptance Criteria

## Acceptance Criteria

## Acceptance Criteria

- [ ] **`RoleInvocation`** schema: typed payload under the envelope carrying the Role identity/version, the context bundle reference(s), source artifact refs, decision scope, and whatever ADR-2's Role Invocation Convention requires (read ADR-2 and conform).
- [ ] **`RoleResult`** schema: typed payload capturing ADR-1's canonical Role output — outcome `produced | skipped | blocked | needs_human`, plus `confidence`, `missing_context`, `human_review_required`, `source_artifacts`, `output_artifacts`, and optional `skip_reason` — all machine-readable.
- [ ] Both extend the shared envelope from [[DGOS-T-0014]] (no envelope-field redefinition).
- [ ] The `RoleResult` schema is consistent with the `DecisionVerdict ↔ Role-result` mapping daimyo's DecisionProvider performs (coordinate with [[DGOS-T-0017]]): the mapping must be expressible between the two schemas.
- [ ] TS bindings generated via the T-0013 pipeline; drift check passes.
- [ ] `valid/`/`invalid/` fixtures cover each `RoleResult` outcome (`produced`/`skipped`/`blocked`/`needs_human`) and a representative `RoleInvocation`, run by the harness.
- [ ] ADR-2 and ADR-1 are cited in the schema docs; any place the schema must extend beyond them is recorded.

## Implementation Notes

### Technical Approach

- Read **ADR-2 (Role Invocation Convention)** and **ADR-1**'s Role section first; these define the convention this schema formalizes. The schema is the machine-readable encoding of those decided conventions.
- Coordinate the `RoleResult` shape with [[DGOS-T-0017]] so daimyo's existing `DecisionVerdict`→Role-result mapping (`produced/skipped/blocked/needs_human` with confidence/missing_context/human_review_required) maps cleanly — daimyo already references this canonical shape.
- Keep `missing_context` and `skip_reason` structured (not free prose) so Roles' skip/block behavior is observable per ADR-1.

### Dependencies

- **Upstream:** [[DGOS-T-0013]] (pipeline/harness), [[DGOS-T-0014]] (envelope), ADR-1 + ADR-2 (conventions). Coordinates with [[DGOS-T-0017]] on the mapping.
- **Downstream:** [[DGOS-T-0019]] (daimyo's Role-result mapping conforms), [[DGOS-T-0020]] (compat/fixtures), and future [[DGOS-I-0010]]/[[DGOS-I-0013]].

### Risk Considerations

- **Drift from ADR-1/ADR-2** would make the protocol contradict decided conventions. Mitigation: cite and conform; record any necessary extension explicitly.
- **RoleResult/DecisionVerdict mapping mismatch** would break daimyo's DecisionProvider adapter. Mitigation: coordinate shapes with T-0017; fixtures exercise each outcome.

### Execution Profile

**Recommended Agent: opus + medium.** Two payload schemas formalizing already-decided ADR-1/ADR-2 conventions onto the fixed envelope; the reasoning is faithful encoding + keeping the RoleResult/DecisionVerdict mapping coherent, not new design.

## Status Updates

*To be added during implementation.*

### 2026-05-23

- Added `protocol` RoleInvocation and RoleResult envelope-composed schemas with generated TypeScript bindings.
- Added valid/invalid fixture coverage for representative RoleInvocation and RoleResult `produced`, `skipped`, `blocked`, and `needs_human` outcomes.
- Documented ADR-1/ADR-2 alignment and the schema extension decisions in `protocol/README.md`.
- Verification passed from `protocol/`: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, `npm run check:codegen`.

### 2026-05-23 (orchestrator verification)

- Re-ran typecheck/lint/test/build + check:codegen — all green (36 fixture tests). Both schemas extend the envelope via `allOf` (no field redefinition). RoleResult covers `produced`/`skipped`/`blocked`/`needs_human` with structured confidence/missing_context/human_review_required/source_artifacts/output_artifacts/optional skip_reason + an optional DecisionVerdict projection (coordinated with T-0017). Fixtures include the `failed-is-not-role-status` invalid, enforcing the documented decision that runner/process failure is carried via envelope diagnostics, not a 5th Role status. ADR-1/ADR-2 cited in README. No escape hatches. **exit_criteria_met: true.** Completed.