---
id: strategy-engine-decomposition
level: initiative
title: "Strategy Engine & Decomposition Recipes"
short_code: "DGOS-I-0005"
created_at: 2026-05-21T17:42:28.295538+00:00
updated_at: 2026-05-21T17:42:28.295538+00:00
parent: DGOS-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/discovery"


exit_criteria_met: false
estimated_complexity: L
strategy_id: NULL
initiative_id: strategy-engine-decomposition
---

# Strategy Engine & Decomposition Recipes Initiative

## Context

The original strategy initiative correctly separated deterministic strategy work from model-backed planning, but the retro and later review sharpened one missing rule: decomposition should default to capability or contract boundaries rather than pass labels.

This initiative owns classification, recipe selection, and decomposition heuristics. Planner Role behavior stays downstream and consumes the artifacts emitted here.

## Goals & Non-Goals

**Goals:**
- Define work patterns for greenfield, feature, bug, refactor, migration, port, and mixed work.
- Make strategy recipes declarative: required inputs, produced artifacts, primitive routes, validation gates, and skip conditions.
- Prefer story decomposition that aligns with independent review and validation boundaries.
- Support initial, delta, execution, and review planning modes.

**Non-Goals:**
- Execute implementation tasks.
- Own the board or phase machine.
- Hardcode high/low/UI pass splitting as the default decomposition model.

## Architecture

### Overview

The Strategy Engine consumes RepoProfile, user request, existing artifacts, and optional human constraints. It returns a recipe selection, decomposition guidance, and a confidence score. Low confidence requires human review before downstream artifacts are created.

### Sequence Diagrams

Request and repo state enter the Strategy Engine -> a work pattern and recipe are selected -> decomposition guidance identifies story boundaries and artifact needs -> Planner and downstream primitives consume that output.

## Detailed Design

The engine should output a `PlanningPass` or equivalent strategy artifact with work altitude, pattern, mode, required artifacts, missing artifacts, dependencies, parallel groups, risks, human decisions, and next primitive routes.

Decomposition rules should prefer:

- stories aligned to capability or contract boundaries
- tasks narrow enough to fit within one story boundary
- low file overlap and low hidden coupling between sibling tasks
- pass-oriented story splits only when they reduce coupling or clarify ownership

This initiative also owns delta replanning when new questions or changed requirements alter the best recipe.

## Alternatives Considered

- One giant planning prompt: rejected because recipes, gates, and artifact requirements need deterministic inspection.
- Pattern-specific scripts only: rejected because human-readable reasoning is still needed for ambiguous product and architecture choices.
- Pass-label-first decomposition: rejected as the default because it increases overlap and agent confusion.
- Katana-only decomposition: rejected because decomposition needs upstream strategy selection first.

## Implementation Plan

- [ ] Extract strategy recipe concepts into machine-readable definitions.
- [ ] Implement classification for work type, project state, and delivery shape.
- [ ] Emit decomposition guidance that defaults to capability or contract boundaries.
- [ ] Add recipe support for existing-repo major-feature flow first.
- [ ] Add delta replanning for changed requirements or runtime questions.