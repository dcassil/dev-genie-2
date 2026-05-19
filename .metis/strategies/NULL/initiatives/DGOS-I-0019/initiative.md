---
id: workflow-test-plugin-contract-and
level: initiative
title: "Workflow Test: Plugin Contract and Skip Behavior"
short_code: "DGOS-I-0019"
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
initiative_id: workflow-test-plugin-contract-and
---

# Workflow Test: Plugin Contract and Skip Behavior Initiative

## Context

Every plugin must speak the same artifact protocol. This scenario validates produced, skipped, blocked, and needs_human outputs across role plugins.

## Goals & Non-Goals

**Goals:**
- Verify each plugin output includes status, confidence, missing_context, human_review_required, source_artifacts, output_artifacts, and skip_reason when skipped.
- Verify skip is treated as a valid result, not a failure.
- Verify orchestrator routes around skipped plugins correctly.

**Non-Goals:**
- Test role-specific reasoning quality.
- Require live plugin implementations in the first harness.

## Detailed Design

A scenario should invoke fake Planner, Designer, Architect, Principal FE, Principal BE, Quality Governor, and Project Manager adapters with cases that produce all allowed statuses.

## Test Cases

- No UI required -> Designer skipped and downstream FE planning skipped.
- No backend required -> Principal BE skipped and task set omits backend work.
- Missing context -> plugin returns blocked with missing_context.
- Review required -> plugin returns needs_human and orchestrator stops at checkpoint.

## Implementation Plan

- [ ] Define plugin output contract fixtures.
- [ ] Add status-specific assertions.
- [ ] Add orchestrator skip-routing assertions.
