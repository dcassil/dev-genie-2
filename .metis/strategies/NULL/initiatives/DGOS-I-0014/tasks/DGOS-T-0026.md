---
id: strategy-planner-and-architecture
level: task
title: "Strategy, Planner, and Architecture Handoff Harness"
short_code: "DGOS-T-0026"
created_at: 2026-05-23T23:31:10.702052+00:00
updated_at: 2026-05-23T23:31:10.702052+00:00
parent: DGOS-I-0014
blocked_by: []
archived: false

tags:
  - "#task"
  - "#phase/todo"


exit_criteria_met: false
strategy_id: NULL
initiative_id: DGOS-I-0014
---

# Strategy, Planner, and Architecture Handoff Harness

## Parent Initiative

[[DGOS-I-0014]] — proves the early handoffs from existing-repo request through strategy selection, planning, and architecture impact.

## Objective

Build or assemble the v0.5 harness that consumes the selected scenario and checkpoint contract, then produces the first planning-stage artifacts: strategy selection, product/story output, role invocations/results, and an architecture impact. This task stops before FE/BE task shaping; its job is to prove the upstream handoff chain is durable and inspectable.

## Acceptance Criteria

- [ ] The harness consumes the scenario/baseline from [[DGOS-T-0024]] and the checkpoint contract from [[DGOS-T-0025]].
- [ ] Strategy selection emits a structured artifact or fixture with work pattern, mode, required artifacts, missing context, risks, and next primitive routes.
- [ ] Planner output produces product/story artifacts with enough detail for architecture and implementation planning.
- [ ] Architect handoff uses `RoleInvocation`/`RoleResult` semantics and produces an `ArchitectureImpact` or records a typed blocked/needs-human result.
- [ ] Each artifact is persisted at the path/ref defined in [[DGOS-T-0025]], with work-document refs updated or recorded as part of the run evidence.
- [ ] Deterministic tests or fixture checks cover the happy path and at least one blocked/missing-context path.

## Implementation Notes

### Technical Approach

Reuse the protocol-proof direct Role-runner pattern where it fits, but keep this task focused on the major-feature upstream handoff chain rather than the full general Roles layer. Prefer fixture-backed harnesses until direct model credentials and role prompts are deliberately introduced.

### Dependencies

- Upstream: [[DGOS-T-0024]], [[DGOS-T-0025]], and the completed parts of [[DGOS-I-0013]].
- Downstream: [[DGOS-T-0027]] consumes the produced story and architecture artifacts to shape FE/BE plans and executable work.

### Risk Considerations

- Accidentally building the full Strategy Engine or Roles layer: keep the scope to one v0.5 harness path and record generalization candidates separately.
- Prose-only handoffs: reject any checkpoint that cannot be resumed from a stored artifact or fixture.
- Missing credentials: deterministic fixture path must remain available; live calls can be opt-in evidence rather than default CI.

### Execution Profile

Recommended agent: opus + high. This is the first multi-primitive integration slice and should keep contract boundaries explicit.

## Status Updates

*To be added during implementation.*