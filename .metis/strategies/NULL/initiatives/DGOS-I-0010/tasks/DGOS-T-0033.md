---
id: implement-and-register-the-quality
level: task
title: "Implement and register the Quality Governor Role"
short_code: "DGOS-T-0033"
created_at: 2026-05-23T23:39:53.298041+00:00
updated_at: 2026-05-24T00:19:07.513882+00:00
parent: DGOS-I-0010
blocked_by: []
archived: false

tags:
  - "#task"
  - "#phase/completed"


exit_criteria_met: false
strategy_id: NULL
initiative_id: DGOS-I-0010
---

# Implement and register the Quality Governor Role

## Parent Initiative

[[DGOS-I-0010]] — Role Contracts & Autonomy. The Quality Governor is the third v1 Role. It proves the Roles layer covers a *review* decision scope (`scope_type: "review"`) and the human-review escalation path (`human_review_required`, `needs_human`), which is distinct from the produce-a-new-artifact shape of the Architect and Planner. It is the Role that exercises the autonomy-integration seam most directly.

## Objective

Implement the Quality Governor Role in `roles/` as a registered `RoleDefinition`: a versioned prompt that, given a target artifact and its acceptance criteria/context, produces a `ReviewJudgment` artifact (from [[DGOS-T-0031]]) carrying a pass/fail/needs-human verdict, per-criterion findings, and blocking reason codes. Use the shared `RoleRunner`/registry/assembler unchanged. Tag the autonomy domain `engineering`, and ensure `human_review_required`/`needs_human` flow correctly into the `RoleResult` so daimyo's Decision Policy Engine can escalate.

## Acceptance Criteria

## Acceptance Criteria

## Acceptance Criteria

- [ ] A versioned Quality Governor prompt exists (`roles/src/prompts/quality-governor-role.ts`, namespaced `dev-genie.quality-governor-role@1.0.0`) instructing the model to return exactly one `ReviewJudgment` JSON artifact judging the target against supplied acceptance criteria, with machine-readable status + `blocking_reason_codes`, no prose, and to set `human_review_required`/`review_required` when it cannot confidently judge.
- [ ] A Quality Governor `RoleDefinition` is registered: `role_id` `dev-genie.quality-governor-role`, `role_version` `1.0.0`, `supported_operations` (e.g. `review_artifact`, `govern_quality`), `expected_output_artifact_type` `ReviewJudgment`, the `ReviewJudgment` `StructuredModelSchema` (schema + parser from the protocol schema), a `normalize` hook, a `context_profile` surfacing the target artifact + acceptance criteria + `scope_type: "review"`, and `domain: "engineering"`.
- [ ] End-to-end through the unchanged shared `RoleRunner`: a fake model returning a schema-valid passing `ReviewJudgment` → `produced` `RoleResult` with `human_review_required` reflecting the judgment; a failing judgment with blocking reason codes → `produced` `RoleResult` whose `review_required.required` and `blocking_reason_codes` are populated; a judgment that declares it cannot judge → the runner surfaces `needs_human` (or a `produced` result with `human_review_required: true`, whichever the design in [[DGOS-T-0029]] dictates for review Roles) — and this mapping is explicitly tested.
- [ ] The produced `ReviewJudgment` validates against the protocol schema and the `RoleResult` against `role-result.schema.json`, via the `roles/` validation wiring; no hand-rolled types.
- [ ] Adding the Quality Governor required no change to `RoleRunner` core (only registration + Role-specific profile/normalize); called out in a status update. If the review-status → `RoleResult.status` mapping needed a small shared-runner addition, that addition is generic (applies to any review Role), documented, and covered by a test.
- [ ] `roles/` `npm run typecheck`/`lint`/`test`/`build` clean; no rule disabled; no escape hatches; `roles` version bumped (minor).

## Implementation Notes

### Technical Approach

- Reuse the Role pattern from [[DGOS-T-0032]]. The key new dimension is mapping a *review verdict* onto the `RoleResult` status + `review_required` + `human_review_required` fields. Decide the mapping once in the shared runner if it is generic to review Roles (e.g. `ReviewJudgment.status == needs_human` → `RoleResult.status == needs_human`); keep it data-driven via the `RoleDefinition`, not Quality-Governor-special-cased.
- Reuse the `completion_decision`/`blocking_reason_codes` vocabulary baked into `ReviewJudgment` by [[DGOS-T-0031]] so the judgment is consumable by the same code paths that read daimyo's `ValidationReport` (`completion_decision.can_mark_complete`, `parent_authoritative`).
- Keep the Quality Governor one-shot and stateless (ADR-1): it judges and returns; it does not loop, re-run validation, or own state. The recursive govern-verify *loop* is a daimyo concern; this Role provides one bounded judgment within it.
- The autonomy `domain` tag plus `human_review_required` are the signals daimyo's `evaluateAutonomyThreshold` consumes ([[DGOS-T-0035]]); this Role only *emits* them and never decides ask-vs-proceed itself.

### Dependencies

- **Upstream:** [[DGOS-T-0029]], [[DGOS-T-0030]], [[DGOS-T-0031]] (`ReviewJudgment` schema + type).
- **Downstream:** [[DGOS-T-0035]] (autonomy integration consumes the Quality Governor's `human_review_required`/domain), [[DGOS-T-0036]] (e2e harness runs the review Role).

### Risk Considerations

- **The review-verdict → RoleResult-status mapping leaking Quality-Governor specifics into the shared runner.** Mitigation: express it as a generic per-Role mapping rule on the `RoleDefinition`; if it must touch the shared runner, make it apply to any review Role and test it as such.
- **`ReviewJudgment` schema not expressive enough for real findings.** Mitigation: fix the schema in [[DGOS-T-0031]] + regenerate, do not fork.

### Execution Profile

**Recommended Agent: opus + medium.** Multi-file, pattern-following work, but with one genuinely new reasoning concern (mapping a review verdict onto `RoleResult` status + human-review signals) that must stay generic. Bounded by the established pattern yet touches the autonomy-signal contract.

## Status Updates

*To be added during implementation.*

- 2026-05-23: Started implementation. Existing `RoleRunner`/assembler pattern supports additive role registration; current plan is prompt + `RoleDefinition` + protocol `ReviewJudgment` validation wiring + parity tests without touching `protocol-proof`.
- 2026-05-23: Completed implementation in `roles/` without `RoleRunner`, assembler, `protocol/`, or `protocol-proof` edits. Added Quality Governor prompt/definition/schema wiring/tests, bumped roles to `0.4.0`, rebuilt `dist/`, and verified `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build` all pass from `roles/`.
- 2026-05-24 (orchestrator verification): re-ran roles typecheck/lint/test/build — green (24 tests across Architect/Planner/Quality Governor; QG covers pass, fail+blocking_reason_codes, cannot-judge→needs_human (produced with human_review_required), wrong role/version/op skips, no-tier needs_human, schema-invalid/throw blocked). `dev-genie.quality-governor-role@1.0.0` → `ReviewJudgment`, additive registration, **no runner/assembler/protocol/protocol-proof edits** — third Role on the same seam. **v1 Role set complete (Architect, Planner, Quality Governor).** roles 0.3.0 → 0.4.0. No escape hatches. **exit_criteria_met: true.** Completed.