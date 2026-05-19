---
id: existing-repo-major-feature-mvp
level: initiative
title: "Existing Repo Major Feature v0.5 Full Flow"
short_code: "DGOS-I-0008"
runtime_primitive: protocol
created_at: 2026-05-19T16:57:23.448785+00:00
updated_at: 2026-05-19T16:57:23.448785+00:00
parent: DGOS-V-0001
blocked_by:
  - DGOS-I-0031
archived: false

tags:
  - "#initiative"
  - "#phase/discovery"


exit_criteria_met: false
estimated_complexity: XL
strategy_id: NULL
initiative_id: existing-repo-major-feature-mvp
---

# Existing Repo Major Feature v0.5 Full Flow Initiative

## Context

This initiative is the v0.5 full-flow proof for an existing-repo major feature. It is not the first MVP. DGOS-I-0031, "Protocol Proof MVP — One Role, One Artifact, One Gate," is the prerequisite v0.1 proof that validates the artifact-protocol thesis with the smallest useful end-to-end flow.

After DGOS-I-0031 proves one Role consuming one artifact, producing one artifact, and passing one gate, this initiative expands that protocol across primitives: Repo Intelligence and Strategy Engines, Planner/Architect/Principal FE/Principal BE/Project Manager/Quality Governor Roles, the Developer Execution Loop, and the Validation Engine.

## Goals & Non-Goals

**Goals:**
- Implement request -> classify -> inspect repo -> product/stories -> architecture impact -> FE/BE plans -> task set -> first execution record.
- Make no-UI and no-backend skip results first-class.
- Dogfood on this repository after the restructure.
- Prove a multi-primitive full flow can hand off artifacts without prompt-only coupling after the v0.1 protocol proof succeeds.

**Non-Goals:**
- Complete every supported workflow shape.
- Launch parallel child agents in the MVP.
- Build full wireframing or schema migration support unless required by the selected feature.
- Serve as the first protocol proof.

## Detailed Design

This flow starts with a user request and RepoProfile. Strategy selects existing_repo_major_feature. Planner emits ProductDoc/Epic/Story drafts. Architect emits ArchitectureImpact. Principal FE and Principal BE emit plans or skip records. Project Manager emits TaskSet. Developer executes one bounded task through Katana. Validation decides whether that task is complete.

The flow must reuse the protocol decisions proven by DGOS-I-0031:

- Role invocations use `RoleInvocation` and `RoleResult` envelopes.
- Role outputs are validated before downstream primitives rely on them.
- Missing context, low confidence, skip, and needs-human results have explicit routing behavior.
- Dogfood findings from the one-role proof are incorporated before multi-role chaining begins.

## Alternatives Considered

- Start with greenfield: rejected because existing repo work exercises reconciliation, context, and validation sooner.
- Start with bugs: rejected because the architecture needs multi-role planning pressure.
- Start with multi-agent orchestration: rejected until single-thread artifact handoff works.
- Treat this as v0.1: rejected because it requires too many co-dependent primitives before the protocol can teach us anything.

## Implementation Plan

- [ ] Define the existing_repo_major_feature strategy recipe.
- [ ] Confirm DGOS-I-0031 is complete and its dogfood findings are incorporated.
- [ ] Implement the minimum artifact types and primitive outputs for the flow.
- [ ] Wire repo-intelligence scan into planner input.
- [ ] Generate FE/BE plan skip records when no surface exists.
- [ ] Execute one task and persist ExecutionRecord + ValidationReport.
