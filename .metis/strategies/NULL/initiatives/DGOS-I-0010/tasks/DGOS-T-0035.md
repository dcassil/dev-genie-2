---
id: wire-the-roles-layer-into-daimyo-s
level: task
title: "Wire the Roles layer into daimyo's RolesPlanning port with autonomy domain tagging"
short_code: "DGOS-T-0035"
created_at: 2026-05-23T23:39:53.298041+00:00
updated_at: 2026-05-24T00:30:04.769964+00:00
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

# Wire the Roles layer into daimyo's RolesPlanning port with autonomy domain tagging

## Parent Initiative

[[DGOS-I-0010]] — Role Contracts & Autonomy. This task closes the loop with the execution substrate: it makes daimyo's currently-trivial `RolesPlanning` capability port actually invoke the new Roles layer, and it wires the Role-emitted autonomy signals (`human_review_required`, autonomy `domain`) into daimyo's existing ADR-4 Decision Policy Engine (`TieredDecisionProvider` + `evaluateAutonomyThreshold`). This is where Roles + autonomy meet.

## Objective

Implement a daimyo adapter for the `RolesPlanning` port (`daimyo/src/core/ports/capabilities.ts`) that runs the Planner Role from the `roles/` layer and converts its `PlanProposal` → `PlanningResult` (`PlannedTask[]` + `DecisionRequest[]`), wired in at `daimyo/src/standalone/composition.ts` (not in `src/core`, preserving import purity). Ensure each Role/operation's autonomy `domain` and `human_review_required` flow into the decision-routing path so `evaluateAutonomyThreshold` makes the ask-vs-proceed call using the ADR-4 profile. Roles never decide ask-vs-proceed themselves.

## Acceptance Criteria

## Acceptance Criteria

## Acceptance Criteria

- [ ] A `RolesPlanning` adapter exists (e.g. `daimyo/src/adapters/roles-planning.ts` or in `roles/` as a daimyo-port adapter — decide and justify, keeping it out of `daimyo/src/core`) that, given a `PlanningRequest`, builds a `RoleInvocation` for the Planner, runs it via the `roles/` layer (in-process `RoleRunner` or the [[DGOS-T-0034]] subprocess CLI — choose and document), and maps the resulting `PlanProposal` payload to a `PlanningResult` (`tasks: PlannedTask[]`, `decisions: DecisionRequest[]`).
- [ ] The mapping is faithful and lossless given the [[DGOS-T-0031]] schema alignment: `PlanProposal` task entries → `PlannedTask` (`title`/`body`/`acceptanceCriteria`/`metadata`); `PlanProposal` decisions → daimyo `DecisionRequest`s routed through the existing `DecisionProvider`.
- [ ] The `daimyo/src/standalone/composition.ts` wiring optionally accepts a `RolesPlanning` implementation (injected like `validation`/`decisionProvider` already are) and defaults appropriately; daimyo's `src/core` is untouched and the `cross-port-boundary` test still passes (no new sibling import in core — the `roles` adapter lives at the composition/adapter layer, like `ClaudeSdkAgentTransport`).
- [ ] Autonomy integration: each Role carries an autonomy `domain` (set on the `RoleDefinition` in [[DGOS-T-0032]]/[[DGOS-T-0033]]); when a Role result carries `human_review_required` or a decision is surfaced, the adapter populates the `DecisionRequest.context` (`domain`, `scope`) so daimyo's `decisionPolicyContext`/`evaluateAutonomyThreshold` (in `daimyo/src/decision/autonomy.ts`) classify and escalate correctly. A test shows: a Role result with `human_review_required` under an `always_in_loop`/non-local profile escalates; under `delegate` with low risk it proceeds — using the *existing* daimyo threshold logic, not a reimplementation.
- [ ] The Roles layer does NOT re-implement autonomy policy; it only emits `domain` + `human_review_required` + `confidence`. The ask/proceed/stop decision stays entirely in daimyo's `TieredDecisionProvider`. This separation is asserted by a test and noted in a status update.
- [ ] **ADR-4 dependency check:** ADR-4 (`DGOS-A-0004`) is consumed only via its stable three-domain / three-level shape already implemented in `daimyo/src/decision/autonomy.ts`. Before this task is marked complete, confirm ADR-4 has been moved out of `draft` (to `discussion`/`decided`) OR record an explicit blocking note that the autonomy contract here depends on the as-yet-draft ADR-4 and must be revisited if ADR-4 changes the domain/level model. Do not silently depend on undecided ADR-4 details (storage format, prompt wording, thresholds).
- [ ] `daimyo` `npm run typecheck`/`lint`/`test`/`build` clean (full suite green, no test weakened); `roles/` clean. Both packages' versions bumped per repo rules (`daimyo` minor for the new adapter/wiring; `roles` if its surface changed); `daimyo` `dist/` rebuilt + committed.

## Implementation Notes

### Technical Approach

- Keep daimyo's `src/core` pure. The adapter sits at the same layer as `ClaudeSdkAgentTransport`/`JsonWorkSource` and is wired in `composition.ts`. The `RolesPlanning` *port* already exists in core (`capabilities.ts`); this task provides a real *implementation* of it.
- Reuse the existing injection pattern in `createStandaloneDaimyo`: add an optional `rolesPlanning` (or `roles`) option, default to a constructed adapter when a model client is available, mirror the `decisionProvider`/`validation` optionality.
- For autonomy, do not touch `evaluateAutonomyThreshold` logic; only feed it the right `DecisionRequest.context` (`domain`, `scope`, `declared_risk`) derived from the Role result. The `domain` comes from the `RoleDefinition`; `scope` from the `RoleInvocation.decision_scope.scope_type`; risk/confidence from the Role result.
- Decide in-process vs subprocess invocation for the adapter: in-process `RoleRunner` is simpler and matches daimyo's existing in-process composition; the subprocess CLI ([[DGOS-T-0034]]) is the portability contract. Recommended: in-process for the daimyo standalone adapter, with the CLI as the documented cross-platform alternative. Document the choice.

### Dependencies

- **Upstream:** [[DGOS-T-0029]], [[DGOS-T-0030]] (runner+registry), [[DGOS-T-0031]] (`PlanProposal`), [[DGOS-T-0032]] (Planner Role), [[DGOS-T-0033]] (Quality Governor — for the autonomy/human-review test). [[DGOS-T-0034]] only if the adapter uses the subprocess path.
- **Downstream:** [[DGOS-T-0036]] (e2e harness exercises the full daimyo→Roles→autonomy path).
- **External:** ADR-4 (`DGOS-A-0004`) — see the ADR-4 dependency-check criterion.

### Risk Considerations

- **Breaking daimyo's core import purity / `cross-port-boundary` test.** Mitigation: keep the adapter at the composition/adapter layer; never import `roles` into `daimyo/src/core`; run the boundary test as the gate.
- **Reimplementing autonomy policy in the Roles layer or the adapter.** Mitigation: the adapter only fills `DecisionRequest.context`; all threshold logic stays in `daimyo/src/decision/autonomy.ts`; assert with a test that flips profile levels and observes escalate/proceed without new policy code.
- **Building on undecided ADR-4 details.** Mitigation: the explicit ADR-4 dependency-check criterion; flag rather than assume.
- **Regressing the large daimyo suite via a type/wiring change.** Mitigation: full suite is the gate; go incrementally; never weaken a test.

### Execution Profile

**Recommended Agent: opus + high.** This rewires the central execution substrate (daimyo) to consume the Roles layer and integrates the autonomy policy path while holding daimyo's large suite and core-purity boundary green; it spans two packages, the ADR-4 dependency, and a lossless artifact mapping. Cross-cutting, shipped-code-touching, and load-bearing for the initiative's "Roles feed the real substrate" thesis.

## Status Updates

### 2026-05-24 — Implementation status

- Implemented `daimyo/src/adapters/roles-planning.ts` as the in-process adapter for daimyo standalone composition. It invokes `roles` `PlannerRoleRunner`, captures the emitted `PlanProposal`, converts protocol snake_case fields to daimyo `PlannedTask` camelCase fields, and carries planner-only task fields through `metadata.plan_proposal`.
- Wired `createStandaloneDaimyo` to accept an injected `RolesPlanning` port or default to the Roles-backed adapter when using the standalone model client. `daimyo/src/core` remains import-pure; `roles` is imported only at the adapter/composition layer.
- Autonomy remains signal-only in the Roles path. The adapter tags `DecisionRequest.context` with the Planner RoleDefinition domain, daimyo policy scope, role scope type, `human_review_required`, confidence, and declared risk; ask/proceed escalation remains entirely in `TieredDecisionProvider` / `evaluateAutonomyThreshold`.
- Added tests showing PlanProposal mapping, injected standalone wiring, core boundary purity, and the same Role-emitted review decision escalating under `always_in_loop` while proceeding under `delegate` via the existing `TieredDecisionProvider` logic.
- Verification: `daimyo` `npm run typecheck`, `npm run lint`, `npm run test` (69 passed / 5 skipped), and `npm run build` all passed. `roles` `npm run typecheck`, `npm run lint`, `npm run test` (29 passed), and `npm run build` all passed against the current local roles package state.
- ADR-4 dependency note: DGOS-A-0004 is still `draft`; this implementation consumes only the already-encoded three-domain / three-level shape in `daimyo/src/decision/autonomy.ts`. Recommendation: move DGOS-A-0004 `draft -> decided` before closing the autonomy contract, and revisit this adapter if ADR-4 changes the domain/level model.
- 2026-05-24 (orchestrator verification): re-ran daimyo typecheck/lint/test/build — green, 69 passed / 5 skipped (was 66 — +3, no test dropped); roles still green (29). Confirmed `daimyo/src/core` has **zero `roles` imports** (`roles` only in `src/adapters/roles-planning.ts`); cross-port-boundary test 3/3. Adapter maps PlanProposal→PlannedTask + tags autonomy context; ask/proceed/stop stays in `TieredDecisionProvider` (tested escalate-under-always_in_loop / proceed-under-delegate). daimyo 0.12.0 → 0.13.0, `roles: file:../roles`. **ADR-4 still draft — finalization surfaced to the decision-maker.** No escape hatches. **exit_criteria_met: true** (with ADR-4 governance follow-up). Completed.