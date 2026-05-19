---
id: existing-repo-major-feature-mvp
level: initiative
title: "Existing Repo Major Feature MVP Flow"
short_code: "DGOS-I-0008"
runtime_primitive: protocol
created_at: 2026-05-19T16:57:23.448785+00:00
updated_at: 2026-05-19T16:57:23.448785+00:00
parent: DGOS-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/discovery"


exit_criteria_met: false
estimated_complexity: XL
strategy_id: NULL
initiative_id: existing-repo-major-feature-mvp
---

# Existing Repo Major Feature MVP Flow Initiative

## Context

The recommended MVP is the existing-repo major feature flow. This initiative defines the protocol across primitives: Repo Intelligence and Strategy Engines, Planner/Architect/Principal FE/Principal BE/Project Manager/Quality Governor Roles, the Developer Execution Loop, and the Validation Engine. It proves artifact handoff without requiring greenfield scaffolding or full multi-agent orchestration first.

## Goals & Non-Goals

**Goals:**
- Implement request -> classify -> inspect repo -> product/stories -> architecture impact -> FE/BE plans -> task set -> first execution record.
- Make no-UI and no-backend skip results first-class.
- Dogfood on this repository after the restructure.
- Prove artifacts can hand off between primitives without prompt-only coupling.

**Non-Goals:**
- Complete every supported workflow shape.
- Launch parallel child agents in the MVP.
- Build full wireframing or schema migration support unless required by the selected feature.

## Detailed Design

This flow starts with a user request and RepoProfile. Strategy selects existing_repo_major_feature. Planner emits ProductDoc/Epic/Story drafts. Architect emits ArchitectureImpact. Principal FE and Principal BE emit plans or skip records. Project Manager emits TaskSet. Developer executes one bounded task through Katana. Validation decides whether that task is complete.

## Alternatives Considered

- Start with greenfield: rejected because existing repo work exercises reconciliation, context, and validation sooner.
- Start with bugs: rejected because the architecture needs multi-role planning pressure.
- Start with multi-agent orchestration: rejected until single-thread artifact handoff works.

## Implementation Plan

- [ ] Define the existing_repo_major_feature strategy recipe.
- [ ] Implement the minimum artifact types and primitive outputs for the flow.
- [ ] Wire repo-intelligence scan into planner input.
- [ ] Generate FE/BE plan skip records when no surface exists.
- [ ] Execute one task and persist ExecutionRecord + ValidationReport.
