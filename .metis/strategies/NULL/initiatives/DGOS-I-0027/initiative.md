---
id: project-manager-hybrid-task
level: initiative
title: "Project Manager Hybrid Task Mapping Strategies"
short_code: "DGOS-I-0027"
runtime_primitive: role
created_at: 2026-05-19T17:19:37.335676+00:00
updated_at: 2026-05-19T17:19:37.335676+00:00
parent: DGOS-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/discovery"


exit_criteria_met: false
estimated_complexity: M
strategy_id: NULL
initiative_id: project-manager-hybrid-task
---

# Project Manager Hybrid Task Mapping Strategies Initiative

## Context

The Project Manager Role should map strategy outputs into executable work. For dashboards and similar features, this model-backed Role must support hybrid task mapping: foundation/skeleton, reusable primitives, contracts, vertical slices, and hardening.

## Goals & Non-Goals

**Goals:**
- Convert planning artifacts into TaskSet and dependency graph artifacts.
- Support hybrid horizontal-then-vertical sequencing.
- Avoid naive page-only or component-only decomposition.
- Respect reusable component and data contract dependencies.
- Mark review gates before execution begins when policy requires.

**Non-Goals:**
- Decide product or architecture scope.
- Execute tasks.
- Spawn agents directly.

## Detailed Design

Project Manager consumes Planner, Designer, Architect, Principal FE/BE, and QualityPlan artifacts. It emits TaskSet with categories, dependencies, recommended agent/model tier, ownership surfaces, validation profile, and review checkpoints.

Dashboard mapping should usually emit:

1. Skeleton
2. Reusable primitives
3. Data contracts
4. Vertical slices
5. Hardening

## Alternatives Considered

- Pure vertical slices: rejected because dashboards duplicate primitives without a shared pass.
- Pure horizontal layers: rejected because feature value appears too late.
- Let Developer choose sequencing: rejected because dependency ordering belongs to planning.

## Implementation Plan

- [ ] Define TaskSet schema with categories and dependencies.
- [ ] Add hybrid mapping recipes.
- [ ] Add dashboard-specific task mapping strategy.
- [ ] Add policy-aware execution readiness checks.
- [ ] Feed TaskSet into Katana decomposition.
