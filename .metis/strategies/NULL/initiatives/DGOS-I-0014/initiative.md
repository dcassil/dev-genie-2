---
id: existing-repo-major-feature-v0-5
level: initiative
title: "Existing Repo Major Feature v0.5"
short_code: "DGOS-I-0014"
created_at: 2026-05-21T17:47:46.098851+00:00
updated_at: 2026-05-30T17:03:49.482537+00:00
parent: DGOS-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/active"


exit_criteria_met: false
estimated_complexity: L
strategy_id: NULL
initiative_id: existing-repo-major-feature-v0-5
---

# Existing Repo Major Feature v0.5 Initiative

## Context

The major-feature flow remains the first serious end-to-end proving ground after the protocol proof. It exercises the system under realistic conditions: an existing codebase, real architecture constraints, and a full artifact chain from request to execution record.

This initiative is still the right integration target after the retro.

## Goals & Non-Goals

**Goals:**
- Prove the end-to-end major-feature flow in an existing repository.
- Exercise repo detection, strategy selection, planning, architecture impact, FE/BE planning, task shaping, and first execution records.
- Validate that the recursive loop and completion authority hold up in a realistic scenario.
- Use decomposition that aligns stories to capability or contract boundaries.

**Non-Goals:**
- Prove every possible workflow shape.
- Replace the smaller protocol proof.
- Assume greenfield-only setup behavior.

## Architecture

### Overview

The intended flow is: request -> RepoProfile -> product and story artifacts -> architecture impact -> FE and BE plans -> task set -> execution record and validation outcome.

### Sequence Diagrams

User request enters -> repo is inspected -> strategy and planning artifacts are generated -> architecture and implementation planning narrow the work -> tasks execute through the recursive loop -> validation and execution records capture the outcome.

## Detailed Design

This initiative should be the first broad integration case that proves multiple primitives can cooperate without falling back to prompt-only glue.

Key checkpoints are:

- existing-repo evaluation and architecture-path choice
- story decomposition with low overlap and explicit ownership boundaries
- specialist planning artifacts that are useful enough to drive task execution
- execution evidence and parent-owned completion authority

## Alternatives Considered

- Use a greenfield flow as the main proving ground: rejected because existing repos are the harder and more important adoption case.
- Attempt the major-feature flow before the protocol proof: rejected because the proof is meant to de-risk the broader flow.
- Treat the flow as one giant scenario without artifact checkpoints: rejected because the architecture depends on durable artifacts between steps.

## Implementation Plan

- [ ] Choose an existing-repo major-feature scenario for the first full run.
- [ ] Define artifact checkpoints from request through execution record.
- [ ] Exercise strategy, planning, architecture, and implementation handoffs.
- [ ] Validate story decomposition and execution ownership boundaries.
- [ ] Record failures and refinements needed for the broader system.

## Decomposition (decided 2026-05-23)

5 tasks. The decomposition follows the v0.5 flow as sequential proof checkpoints: scenario and baseline -> artifact checkpoint contract -> upstream handoff harness -> executable task shaping -> first execution and findings.

| Task | Title | Depends on | Agent |
|------|-------|------------|-------|
| [[DGOS-T-0024]] | Major-Feature Scenario & Existing-Repo Baseline Selection | — | opus + medium |
| [[DGOS-T-0025]] | Artifact Checkpoint Contract for Major-Feature Flow | T-0024 | opus + high |
| [[DGOS-T-0026]] | Strategy, Planner, and Architecture Handoff Harness | T-0024, T-0025 | opus + high |
| [[DGOS-T-0027]] | FE/BE Plan, Task Set, and Ownership Boundary Shaping | T-0026 | opus + medium |
| [[DGOS-T-0028]] | First Execution Record, Validation Outcome, and v0.5 Findings | T-0027 | opus + medium |

**Critical path:** T-0024 -> T-0025 -> T-0026 -> T-0027 -> T-0028. This is intentionally sequential for v0.5 because each step produces durable evidence consumed by the next checkpoint.

**Decomposition rule:** tasks are milestone/checkpoint based rather than horizontal implementation layers. The first executable work should stay to one vertical slice with explicit owned surfaces and parent-owned validation.