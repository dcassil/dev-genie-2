---
id: workflow-test-runtime-product
level: initiative
title: "Workflow Test: Runtime Product Decision Loop"
short_code: "DGOS-I-0014"
created_at: 2026-05-19T17:18:42.660489+00:00
updated_at: 2026-05-19T17:18:42.660489+00:00
parent: DGOS-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/discovery"


exit_criteria_met: false
estimated_complexity: M
strategy_id: NULL
initiative_id: workflow-test-runtime-product
---

# Workflow Test: Runtime Product Decision Loop Initiative

## Context

This scenario validates the runtime micro-workflow where a developer executing a task hits a product question and routes it to the correct decision engine instead of guessing.

## Goals & Non-Goals

**Goals:**
- Simulate an active task that encounters a product ambiguity.
- Emit a DecisionRequest with blocking status and options considered.
- Route to Planner/Product decision behavior.
- Patch the current task with a DecisionRecord.
- Resume the developer loop when policy allows.

**Non-Goals:**
- Cover architecture/design/runtime questions in the same scenario.
- Require real code edits.

## Detailed Design

The scenario should model a dashboard task that asks whether archived records appear by default. Expected flow:

Task active -> Developer raises DecisionRequest(type=product) -> Orchestrator routes to Planner -> Planner emits DecisionRecord -> task instructions updated -> task returns to active.

Policy variants must test autonomous, review-on-medium-risk, and always-review product scopes.

## Test Cases

- Low-risk product question is answered autonomously and patches the task.
- Medium-risk product question pauses for human review when policy requires it.
- Oversized product question creates a follow-up story/task instead of expanding the active task.
- DecisionRecord provenance is visible in the ExecutionRecord.

## Implementation Plan

- [ ] Create active-task fixture with product ambiguity.
- [ ] Add fake developer adapter that raises DecisionRequest.
- [ ] Add fake planner adapter that returns DecisionRecord.
- [ ] Assert task status and task body patch behavior.
