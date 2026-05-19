---
id: workflow-test-vision-to-reviewed
level: initiative
title: "Workflow Test: Vision to Reviewed Task Set"
short_code: "DGOS-I-0013"
created_at: 2026-05-19T17:18:39.129335+00:00
updated_at: 2026-05-19T17:18:39.129335+00:00
parent: DGOS-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/discovery"


exit_criteria_met: false
estimated_complexity: M
strategy_id: NULL
initiative_id: workflow-test-vision-to-reviewed
---

# Workflow Test: Vision to Reviewed Task Set Initiative

## Context

This scenario validates the main planning path from product vision to reviewed task set. It is the top-level acceptance scenario for planning without implementation.

## Goals & Non-Goals

**Goals:**
- Start with a product vision and optional repo profile.
- Produce ProductDoc, Epic, Story, ArchitectureImpact, FE/BE plans or skip records, QualityPlan, and TaskSet.
- Verify user review checkpoints are produced according to policy.
- Verify task set is not created or activated until the configured review policy allows it.

**Non-Goals:**
- Execute implementation tasks.
- Test multi-agent spawning.

## Detailed Design

Scenario inputs include a product vision for a moderately complex feature, a repo fixture, and a review policy matrix. Expected flow:

Vision -> Strategy Engine -> RepoProfile -> Planner -> Architect -> Designer if UI -> Principal FE/BE -> Quality Governor -> Project Manager -> reviewed TaskSet.

Expected human review prompts cover vision interpretation, strategy selection, architecture decisions when high-risk, design approval when configured, and task-set approval when configured.

## Test Cases

- Fully autonomous planning for low-risk feature produces a complete task set with no human checkpoint except final summary.
- Review-required planning pauses before task-set creation.
- Missing repo context creates a blocked PlanningPass with missing_context populated.
- No-backend feature produces a BE skip record rather than an empty plan.

## Implementation Plan

- [ ] Add scenario fixture for low-risk feature planning.
- [ ] Add scenario fixture for review-required planning.
- [ ] Assert artifact completeness and review checkpoint behavior.
- [ ] Assert skip records validate.
