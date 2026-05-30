---
id: major-feature-scenario-existing
level: task
title: "Major-Feature Scenario & Existing-Repo Baseline Selection"
short_code: "DGOS-T-0024"
created_at: 2026-05-23T23:31:03.033215+00:00
updated_at: 2026-05-30T17:03:52.129379+00:00
parent: DGOS-I-0014
blocked_by: []
archived: false

tags:
  - "#task"
  - "#phase/active"


exit_criteria_met: false
strategy_id: NULL
initiative_id: DGOS-I-0014
---

# Major-Feature Scenario & Existing-Repo Baseline Selection

## Parent Initiative

[[DGOS-I-0014]] — starts the v0.5 existing-repo proof by choosing a realistic feature scenario and capturing the repository baseline that all downstream artifacts must reference.

## Objective

Select the first existing-repo major-feature scenario and produce the baseline inputs for the flow: user request, repository target, current repo facts, architecture constraints, available commands, and the explicit scope boundary for the proof. This task decides what the v0.5 flow will attempt before any specialist planning or execution artifacts are generated.

## Acceptance Criteria

## Acceptance Criteria

- [ ] A concrete existing-repo major-feature scenario is chosen, including target repository/path, user-facing capability, and why it is representative enough for v0.5.
- [ ] A baseline `RepoProfile` or equivalent inventory exists with frameworks, package manager, scripts, test/build commands, CI/hooks if present, routes or entry points, data/schema surfaces, and architecture cues.
- [ ] The scenario includes explicit in-scope and out-of-scope boundaries so downstream planning does not expand into a general product rewrite.
- [ ] The architecture path choice is recorded: follow existing architecture, reconcile mismatch, or request human decision, with rationale.
- [ ] Known risks, unknowns, and required human decisions are listed before handoff to artifact checkpoint design.

## Implementation Notes

### Technical Approach

Use deterministic repo inspection first: package manifests, scripts, config files, source tree, tests, and documentation. Add model-backed interpretation only for ambiguous architecture or product intent, and record confidence and missing context.

### Dependencies

- Upstream: [[DGOS-I-0013]] should be resolved enough that the one-role protocol proof is not blocking the broader v0.5 work.
- Downstream: [[DGOS-T-0025]] consumes the selected scenario and baseline as the subject for the artifact checkpoint contract.

### Risk Considerations

- Scenario too large: constrain to the smallest major-feature slice that still crosses planning, architecture, implementation, and validation.
- Baseline too shallow: downstream context and validation will become guesswork. Mitigate by requiring commands, entry points, and architecture cues before proceeding.
- Human decision hidden inside planning: record unresolved product or architecture choices explicitly instead of assuming them.

### Execution Profile

Recommended agent: opus + medium. The work is mostly deterministic inspection and scope judgment, with one strategic decision about the first v0.5 proof scenario.

## Status Updates

*To be added during implementation.*