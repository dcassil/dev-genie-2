---
id: bootstrap-project-readiness
level: initiative
title: "Bootstrap & Project Readiness"
short_code: "DGOS-I-0012"
created_at: 2026-05-21T17:47:46.065391+00:00
updated_at: 2026-05-21T17:47:46.065391+00:00
parent: DGOS-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/discovery"


exit_criteria_met: false
estimated_complexity: L
strategy_id: NULL
initiative_id: bootstrap-project-readiness
---

# Bootstrap & Project Readiness Initiative

## Context

The retro established bootstrap as a first-class workflow phase rather than implicit setup. Before normal execution begins, the system must initialize the workspace, detect repository state, obtain human approval on the vision and architecture path, and produce readiness work.

This initiative is new because that sequencing did not have a clean owner in the original set.

## Goals & Non-Goals

**Goals:**
- Define the bootstrap workflow from init through project readiness.
- Support both greenfield and existing-repo entry paths.
- Make human gates explicit for vision approval, architecture pattern choice, and user autonomy-profile capture.
- Produce readiness initiatives rather than doing all setup inline.

**Non-Goals:**
- Replace installer or repo-intelligence engines.
- Execute downstream feature work.
- Bypass strategic approval checkpoints.

## Architecture

### Overview

Bootstrap coordinates deterministic engines and human gates in a fixed early workflow: init -> autonomy profile capture -> detect -> vision -> architecture choice -> readiness work -> audit baseline.

### Sequence Diagrams

User starts bootstrap -> autonomy profile is captured for engineering, product, and design -> workspace is initialized -> repo state is detected -> vision is written and approved -> architecture path is chosen and approved -> readiness initiatives are produced -> audit baseline is established.

## Detailed Design

Bootstrap should support:

- autonomy-profile capture as the first bootstrap interaction, with persistent storage for engineering, product, and design involvement levels
- greenfield vs existing-repo branching
- explicit explanation of why existing-repo evaluation matters
- architecture pattern choice via documentation, mapping, or user selection
- readiness initiative generation for setup, refactor guidance, and baseline work
- recording that the project is ready for normal recursive execution

This initiative owns the workflow sequencing, not the deterministic behavior of the engines it orchestrates.

## Alternatives Considered

- Keep bootstrap implicit inside installer flow: rejected because vision and architecture approval are strategic gates, not installer side effects.
- Do all readiness work inline before creating initiatives: rejected because it hides planning and resource decisions.
- Use one path for greenfield and existing repos: rejected because existing repos require evaluation and reconciliation choices that greenfield projects do not.

## Implementation Plan

- [ ] Define the bootstrap sequence and state transitions, including autonomy-profile capture before repository detection.
- [ ] Specify greenfield vs existing-repo branch behavior.
- [ ] Define the three bootstrap autonomy questions, answer set, and persistence model.
- [ ] Add explicit human gates for vision and architecture approval, while honoring delegated domains after baseline approval.
- [ ] Define readiness initiative outputs and audit-baseline handoff.
- [ ] Add fixture coverage for both bootstrap entry paths.