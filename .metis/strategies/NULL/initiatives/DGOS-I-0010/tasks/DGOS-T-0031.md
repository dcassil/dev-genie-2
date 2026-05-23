---
id: author-protocol-schemas-for-the
level: task
title: "Author protocol schemas for the Planner and Quality Governor Role artifacts"
short_code: "DGOS-T-0031"
created_at: 2026-05-23T23:39:53.298041+00:00
updated_at: 2026-05-23T23:39:53.298041+00:00
parent: DGOS-I-0010
blocked_by: []
archived: false

tags:
  - "#task"
  - "#phase/todo"


exit_criteria_met: false
strategy_id: NULL
initiative_id: DGOS-I-0010
---

# Author protocol schemas for the Planner and Quality Governor Role artifacts

## Parent Initiative

[[DGOS-I-0010]] — Role Contracts & Autonomy. The v1 Role set adds two Roles whose output artifact types do not yet exist in the protocol catalog. Because JSON Schema is the source of truth (and TS is generated), those artifact types must be authored as protocol schemas — with fixtures, generated bindings, and compatibility baseline — before the Planner and Quality Governor Roles can produce and validate them. This task does that schema work in the `protocol` package only.

## Objective

Add two new artifact types to the `protocol` package: a Planner output artifact (`PlanProposal`) and a Quality Governor output artifact (`ReviewJudgment`), each as an envelope-composed JSON Schema (`allOf` over `artifact-envelope.schema.json`, like the existing `architecture-impact.schema.json`), each with valid/invalid fixtures, regenerated TypeScript bindings, and an updated compatibility baseline. After this task the protocol catalog can express what the Planner and Quality Governor Roles produce, so [[DGOS-T-0032]]/[[DGOS-T-0033]] can validate their outputs against the real schema instead of hand-rolling types.

## Acceptance Criteria

- [ ] `protocol/schemas/plan-proposal.schema.json` exists, envelope-composed via `allOf` over `artifact-envelope.schema.json`, `artifact_type` const `PlanProposal`, with a `payload` capturing at minimum: an ordered list of proposed tasks (title, body/objective, acceptance criteria, optional dependencies/ordering), `confidence`, `missing_context`, `review_required`, and reason codes — shaped to map onto daimyo's `PlannedTask`/`PlanningResult` (`daimyo/src/core/ports/capabilities.ts`) so the Planner Role can feed the `RolesPlanning` port without lossy translation.
- [ ] `protocol/schemas/review-judgment.schema.json` exists, envelope-composed, `artifact_type` const `ReviewJudgment`, with a `payload` capturing a review verdict (a `pass`/`fail`/`needs_human`-style status), per-criterion findings, `blocking_reason_codes`, `confidence`, `review_required`, and `human_review_required` — shaped to interoperate with the existing `validation-report.schema.json` completion-decision vocabulary (`can_mark_complete`, `parent_authoritative`, `blocking_reason_codes`) so the Quality Governor's review composes cleanly with the validation substrate.
- [ ] Both schemas reuse shared `$defs` from `artifact-envelope.schema.json` (`artifactReference`, `confidence`, review-required, ownership, etc.) rather than redefining them, matching how `architecture-impact`/`role-result` compose.
- [ ] Valid + invalid fixtures exist for each new type under `protocol/fixtures/plan-proposal/` and `protocol/fixtures/review-judgment/` (at least one `valid/` and one `invalid/` each), and the existing `protocol/tests/fixtures.test.ts` corpus picks them up and passes.
- [ ] Codegen is re-run so `protocol/src/generated/artifacts.ts` exports `PlanProposal`/`PlanProposalPayload` and `ReviewJudgment`/`ReviewJudgmentPayload` (and any sub-types), and they are re-exported from `protocol/src/index.ts`. `npm run check:codegen` reports no drift.
- [ ] The compatibility baseline (`protocol/compatibility/baseline/schemas/` + `versions.json`) is updated so `check:compatibility` passes; adding two new artifact types is an additive (non-breaking) change and is recorded as such.
- [ ] `protocol` `npm run typecheck`/`lint`/`test`/`build`/`check:codegen`/`check:compatibility` all clean; `protocol` version bumped (minor — additive new artifact types) per repo rules, `package.json` + `.claude-plugin/plugin.json` both updated.

## Implementation Notes

### Technical Approach

- Model both new schemas on `protocol/schemas/architecture-impact.schema.json` and `role-result.schema.json`: top-level `allOf` of `{ $ref: artifact-envelope }` + `{ properties: { artifact_type: const, payload: { $ref } } }`, with the payload defined under `$defs` with `additionalProperties: false` and explicit `required`.
- For `PlanProposal`, deliberately align field names/shapes with daimyo's `PlannedTask` (`title`, `body`, `acceptanceCriteria`, `metadata`) and `PlanningResult` (`tasks`, `decisions`) so [[DGOS-T-0035]]'s adapter can convert with minimal mapping. Use protocol snake_case (e.g. `acceptance_criteria`) per the envelope convention; the adapter handles the camelCase boundary.
- For `ReviewJudgment`, reuse the `completion_decision`/`blocking_reason_codes` vocabulary from `validation-report.schema.json` so the Quality Governor's judgment is interpretable by the same consumers that read `ValidationReport`.
- Run the existing codegen pipeline (`protocol/scripts/codegen.ts` via the package's build/codegen scripts) — do not hand-edit `src/generated/artifacts.ts`.
- Keep the change additive; do not modify existing artifact schemas. If a shared `$def` is missing in the envelope, add it to the envelope (and regenerate) rather than inlining a divergent copy.

### Dependencies

- **Upstream:** none in this initiative (pure `protocol` work); can run in parallel with [[DGOS-T-0029]]/[[DGOS-T-0030]].
- **Downstream:** [[DGOS-T-0032]] (Planner consumes `PlanProposal`), [[DGOS-T-0033]] (Quality Governor consumes `ReviewJudgment`). Both are blocked on this task.

### Risk Considerations

- **Schema shape that does not map onto daimyo's planning/validation vocab**, forcing lossy translation later. Mitigation: design `PlanProposal` against `PlannedTask`/`PlanningResult` and `ReviewJudgment` against `ValidationReport`'s completion-decision now; the adapter tasks (T-0032/T-0033/T-0035) are the proof the shapes fit.
- **Breaking the compatibility gate.** Mitigation: keep strictly additive, update the baseline deliberately, and record the additive classification; `check:compatibility` is the gate.
- **Codegen drift slipping in.** Mitigation: `check:codegen` must be green before done; never hand-edit generated TS.

### Execution Profile

**Recommended Agent: opus + high.** These schemas become the source-of-truth contract two downstream Roles and a daimyo adapter consume; a wrong field shape ripples into Planner, Quality Governor, and the daimyo planning port. Schema-design groundwork that other tasks depend on, touching codegen and the compatibility baseline.

## Status Updates

*To be added during implementation.*
