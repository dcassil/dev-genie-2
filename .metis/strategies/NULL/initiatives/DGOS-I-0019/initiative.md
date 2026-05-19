---
id: workflow-test-runtime-primitive-contract
level: initiative
title: "Workflow Test: Runtime Primitive Contract and Skip Behavior"
short_code: "DGOS-I-0019"
runtime_primitive: meta
created_at: 2026-05-19T17:19:03.472941+00:00
updated_at: 2026-05-19T17:19:03.472941+00:00
parent: DGOS-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/discovery"


exit_criteria_met: false
estimated_complexity: S
strategy_id: NULL
initiative_id: workflow-test-runtime-primitive-contract
---

# Workflow Test: Runtime Primitive Contract and Skip Behavior Initiative

## Context

Every runtime primitive must speak the shared artifact protocol, and every Role output must expose the same status envelope. This meta test initiative validates produced, skipped, blocked, and needs_human outputs across Roles, plus routing behavior when Loops encounter skip or block results.

## Goals & Non-Goals

**Goals:**
- Verify each Role output includes status, confidence, missing_context, human_review_required, source_artifacts, output_artifacts, and skip_reason when skipped.
- Verify skip is treated as a valid result, not a failure.
- Verify orchestrator routes around skipped Roles correctly.

**Non-Goals:**
- Test role-specific reasoning quality.
- Require live primitive implementations in the first harness.

## Detailed Design

A scenario should invoke fake Planner, Designer, Architect, Principal FE, Principal BE, Quality Governor, and Project Manager adapters with cases that produce all allowed statuses.

## Test Cases

- No UI required -> Designer skipped and downstream FE planning skipped.
- No backend required -> Principal BE skipped and task set omits backend work.
- Missing context -> Role returns blocked with missing_context.
- Review required -> Role returns needs_human and orchestrator stops at checkpoint.

## Implementation Plan

- [ ] Define Role output contract fixtures.
- [ ] Add status-specific assertions.
- [ ] Add orchestrator skip-routing assertions.
