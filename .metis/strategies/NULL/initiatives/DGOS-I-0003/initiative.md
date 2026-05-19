---
id: strategy-and-planner-engine
level: initiative
title: "Strategy and Planner Engine"
short_code: "DGOS-I-0003"
runtime_primitive: engine
created_at: 2026-05-19T16:57:08.891890+00:00
updated_at: 2026-05-19T16:57:08.891890+00:00
parent: DGOS-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/discovery"


exit_criteria_met: false
estimated_complexity: L
strategy_id: NULL
initiative_id: strategy-and-planner-engine
---

# Strategy and Planner Engine Initiative

## Context

The existing Planner spec combines two runtime responsibilities: deterministic strategy classification and model-backed planning reasoning. This initiative owns the Strategy Engine side of that split: work classification, project-state detection, delivery-shape selection, and declarative strategy recipe choice. Planner Role behavior remains downstream and bounded by the artifacts this Engine emits.

## Goals & Non-Goals

**Goals:**
- Define work patterns for greenfield, feature, bug, refactor, migration, port, and mixed work.
- Make strategy recipes declarative: required inputs, produced artifacts, primitive routes, validation gates, and skip conditions.
- Support initial, delta, execution, and review planning modes.
- Preserve human control at strategic altitudes while enabling automatic story/task shaping.

**Non-Goals:**
- Execute implementation tasks.
- Own the board or phase machine.
- Hardcode web-app concepts into core planning.

## Detailed Design

Planner should output a PlanningPass artifact with work altitude, pattern, mode, required artifacts, missing artifacts, dependencies, parallel groups, risks, human decisions, and next primitive routes.

The Strategy Engine consumes RepoProfile, user request, existing artifacts, and optional human constraints. It returns a recipe selection and a confidence score. Low confidence requires human review before downstream artifacts are created.

## Alternatives Considered

- One giant planning prompt: rejected because recipes, gates, and artifact requirements need deterministic inspection.
- Pattern-specific scripts only: rejected because human-readable reasoning is still needed for ambiguous product and architecture choices.
- Katana-only decomposition: rejected because decomposition needs upstream strategy selection first.

## Implementation Plan

- [ ] Extract Planner spec concepts into strategy recipe JSON/YAML.
- [ ] Implement a classifier for work type, project state, and delivery shape.
- [ ] Emit PlanningPass artifacts with confidence and missing context.
- [ ] Add recipe support for existing-repo major feature first.
- [ ] Add delta replanning for new questions or changed requirements.
