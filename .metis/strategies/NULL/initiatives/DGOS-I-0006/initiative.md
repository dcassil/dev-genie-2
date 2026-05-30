---
id: repo-intelligence-engine
level: initiative
title: "Repo Intelligence Engine"
short_code: "DGOS-I-0006"
created_at: 2026-05-21T17:45:11.450195+00:00
updated_at: 2026-05-21T17:45:11.450195+00:00
parent: DGOS-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/discovery"


exit_criteria_met: false
estimated_complexity: M
strategy_id: NULL
initiative_id: repo-intelligence-engine
---

# Repo Intelligence Engine Initiative

## Context

Repo detection and repository fact gathering currently live too close to installer and planning behavior. The recreated architecture moves that work into a dedicated Engine so bootstrap, strategy, context loading, and validation can all consume the same repository facts.

This initiative merges the original extraction and move-detection work into one bounded owner.

## Goals & Non-Goals

**Goals:**
- Define a `RepoProfile` or equivalent repository fact artifact.
- Detect frameworks, scripts, CI, hooks, routes, schema, ownership signals, and architecture cues.
- Support bootstrap phase-0 detection and downstream context assembly.
- Keep repository inspection deterministic and explainable.

**Non-Goals:**
- Choose the final strategy recipe.
- Perform long-running orchestration.
- Own code changes outside deterministic scan or inventory behavior.

## Architecture

### Overview

The Repo Intelligence Engine inspects the repository and emits structured facts. Other primitives consume those facts instead of rescanning ad hoc.

### Sequence Diagrams

Bootstrap or Strategy requests repo facts -> Repo Intelligence scans the repository -> emits a `RepoProfile` with provenance -> downstream Strategy, Context, or Guardrails consumers use that artifact.

## Detailed Design

The engine should detect:

- package and toolchain facts
- framework and runtime indicators
- scripts, CI, and hook setup
- file ownership or structure cues
- architecture patterns or mismatches where deterministic inspection can support them

Every detected fact should carry enough provenance to explain why it was included. The engine should prefer stable signals over heuristic guesswork and surface uncertainty explicitly.

## Alternatives Considered

- Leave repo detection embedded in Dev-Genie installer flow: rejected because multiple primitives need the same facts.
- Let each primitive scan the repo independently: rejected because it causes duplicated logic and inconsistent views of the same repository.
- Make Repo Intelligence partially model-driven: rejected as the default because the core fact layer should stay deterministic.

## Implementation Plan

- [ ] Define `RepoProfile` scope and fact categories.
- [ ] Implement deterministic scanners for frameworks, scripts, CI, hooks, and structure cues.
- [ ] Add provenance and confidence conventions for detected facts.
- [ ] Wire Repo Intelligence outputs into bootstrap and strategy inputs.
- [ ] Add fixture coverage for greenfield and existing-repo patterns.