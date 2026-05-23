---
id: implement-and-register-the-planner
level: task
title: "Implement and register the Planner Role"
short_code: "DGOS-T-0032"
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

# Implement and register the Planner Role

## Parent Initiative

[[DGOS-I-0010]] — Role Contracts & Autonomy. The Planner is the second v1 Role. It is the Role most directly consumed by daimyo's `RolesPlanning.plan()` port and the Loop substrate, so shipping it proves the general Roles layer feeds the real execution substrate (not just a proof harness) and exercises a `task`/`initiative` decision scope distinct from the Architect's `artifact` scope.

## Objective

Implement the Planner Role in `roles/` as a `RoleDefinition` registered in the `RoleRegistry`: a versioned prompt that, given a bounded goal/initiative context, produces a `PlanProposal` artifact (from [[DGOS-T-0031]]). Use the shared `RoleRunner` and `ContextProfileAssembler` with no runner changes — the Planner is proof that "add a Role = register a definition". Tag the Planner's autonomy domain as `engineering`.

## Acceptance Criteria

- [ ] A versioned Planner prompt exists (`roles/src/prompts/planner-role.ts`, `VersionedRolePrompt`, namespaced `dev-genie.planner-role@1.0.0`) instructing the model to return exactly one `PlanProposal` JSON artifact, no prose, using only the supplied bounded context, and to record `missing_context`/`review_required` inside the envelope when context is insufficient (mirroring the Architect prompt's discipline).
- [ ] A Planner `RoleDefinition` is created and registered: `role_id` `dev-genie.planner-role`, `role_version` `1.0.0`, `supported_operations` (e.g. `propose_plan`, `decompose_initiative`), `expected_output_artifact_type` `PlanProposal` + schema version, the `PlanProposal` `StructuredModelSchema` (schema + parser sourced from the protocol schema via the generalized validator from [[DGOS-T-0029]]), a `normalize` hook (producer/refs/hash/`protocol_version`), a `context_profile` (declared per [[DGOS-T-0030]]), and `domain: "engineering"`.
- [ ] The Planner runs end-to-end through the unchanged shared `RoleRunner`: a fake `StructuredModelCaller` returning a schema-valid `PlanProposal` yields a `produced` `RoleResult` referencing the `PlanProposal`; wrong operation/version → `skipped`; empty `allowed_tiers` → `needs_human`; schema-invalid model output → `blocked`.
- [ ] The produced `PlanProposal` validates against the protocol schema (Ajv), and the `RoleResult` validates against `role-result.schema.json` — both via the `roles/` validation wiring, no hand-rolled types.
- [ ] No change is required to `RoleRunner` or `ContextProfileAssembler` core code to add the Planner (only registration + a Planner-specific `context_profile`/`normalize`); this is asserted by the task being completable without editing those files (call it out in a status update).
- [ ] `roles/` `npm run typecheck`/`lint`/`test`/`build` clean; no rule disabled; no escape hatches; `roles` version bumped (minor — new Role) per repo rules.

## Implementation Notes

### Technical Approach

- Copy the structure of the Architect `RoleDefinition` from [[DGOS-T-0029]]/[[DGOS-T-0030]]; swap the prompt, operations, output artifact type/schema, and context profile. The Planner's `context_profile` should surface the decision scope's `objective`/`constraints`, the input artifacts (e.g. an initiative/goal artifact), and the expected `PlanProposal` output schema in `request`.
- Source the `PlanProposal` validator/schema through the generic `validatorFor("PlanProposal")` added in [[DGOS-T-0029]]; do not hand-roll the type — import the generated `PlanProposal` type from `protocol`.
- Keep the Planner one-shot and stateless (ADR-1): it proposes a plan artifact; it does not iterate, persist, or own task state. Sequencing/execution of the proposed tasks is a Loop (daimyo) concern.
- The `decisions` field of `PlanProposal` (mapping to daimyo `PlanningResult.decisions`) lets the Planner surface decision requests rather than deciding autonomously — leave the actual ask/proceed call to daimyo's Decision Policy Engine ([[DGOS-T-0035]]).

### Dependencies

- **Upstream:** [[DGOS-T-0029]] (runner + validation wiring), [[DGOS-T-0030]] (registry + assembler), [[DGOS-T-0031]] (`PlanProposal` schema + generated type).
- **Downstream:** [[DGOS-T-0035]] (daimyo `RolesPlanning` adapter converts `PlanProposal` → `PlanningResult`); [[DGOS-T-0036]] (e2e harness runs the Planner).

### Risk Considerations

- **Discovering the [[DGOS-T-0030]] `context_profile` abstraction does not fit a planning Role.** Mitigation: this task is the intended forcing function; if the profile needs a small generalization, make it in [[DGOS-T-0030]]'s files and re-run its parity tests, rather than special-casing the runner.
- **`PlanProposal` ↔ `PlannedTask` shape mismatch surfacing here.** Mitigation: if the schema from [[DGOS-T-0031]] does not map cleanly, fix the schema (source of truth) + regenerate, do not fork in `roles/`.

### Execution Profile

**Recommended Agent: opus + medium.** Substantive multi-file work (prompt + definition + registration + tests) that follows the now-established Role pattern; the design choices are largely fixed by [[DGOS-T-0029]]/[[DGOS-T-0030]]/[[DGOS-T-0031]], so reasoning is bounded but still spans the protocol-type boundary and the registry contract.

## Status Updates

*To be added during implementation.*
