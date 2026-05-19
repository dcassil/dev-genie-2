---
id: orchestration-engine-routing-and
level: initiative
title: "Orchestration Engine Routing and Nested Workflow Dispatch"
short_code: "DGOS-I-0028"
created_at: 2026-05-19T17:19:40.854910+00:00
updated_at: 2026-05-19T17:19:40.854910+00:00
parent: DGOS-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/discovery"


exit_criteria_met: false
estimated_complexity: L
strategy_id: NULL
initiative_id: orchestration-engine-routing-and
---

# Orchestration Engine Routing and Nested Workflow Dispatch Initiative

## Context

The Orchestration Engine must route initial workflows and nested runtime workflows. It should know which plugin to ask for each artifact gap or DecisionRequest, while not doing role-specific reasoning itself.

## Goals & Non-Goals

**Goals:**
- Implement routing from artifact state and DecisionRequest type to plugin role.
- Support nested workflows that start at Planner, Designer, Architect, Principal FE/BE, Quality, or Project Manager.
- Re-enter the active task with patched instructions when the nested workflow resolves.
- Preserve durable routing records.

**Non-Goals:**
- Embed product/design/architecture reasoning in the orchestrator.
- Require multi-agent process spawning for nested workflows.

## Detailed Design

Routing table examples:

- product/planning -> Planner
- UX behavior -> Designer
- module boundary/public contract/schema/auth -> Architect or Principal BE
- component/state/layout implementation plan -> Principal FE
- tests/gates/completion ambiguity -> Quality Governor
- sequencing/scope split -> Project Manager

Orchestration should support sync fake adapters for tests, local plugin calls for MVP, and spawned agents later.

## Alternatives Considered

- Let Developer call plugins directly: rejected because routing and policy are central responsibilities.
- Make every nested workflow a full new task: rejected because many decisions should patch the current task.

## Implementation Plan

- [ ] Define routing table and plugin capability registry.
- [ ] Add nested workflow execution protocol.
- [ ] Integrate Decision Policy Engine before dispatch.
- [ ] Add task patch/resume behavior.
- [ ] Add trace records for every routed decision.
