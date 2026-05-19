---
id: developer-loop-decisionrequest
level: initiative
title: "Developer Loop DecisionRequest Behavior"
short_code: "DGOS-I-0022"
runtime_primitive: loop
created_at: 2026-05-19T17:19:16.558638+00:00
updated_at: 2026-05-19T17:19:16.558638+00:00
parent: DGOS-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/discovery"


exit_criteria_met: false
estimated_complexity: M
strategy_id: NULL
initiative_id: developer-loop-decisionrequest
---

# Developer Loop DecisionRequest Behavior Initiative

## Context

The Developer Execution Loop must stop making hidden planning, product, design, or architecture decisions during execution. It should recognize decision boundaries, emit typed DecisionRequests, pause or continue according to policy, and resume only after the active task has durable decision context.

## Goals & Non-Goals

**Goals:**
- Teach developer execution loop to classify encountered questions.
- Emit DecisionRequest instead of guessing when outside implementation scope.
- Pause or continue based on policy and blocking status.
- Apply returned task patches and DecisionRecords before continuing.

**Non-Goals:**
- Make Developer responsible for choosing the answering role.
- Force every small implementation choice into a DecisionRequest.

## Detailed Design

Developer behavior changes:

- If ambiguity is within approved task implementation details, decide locally and record in ExecutionRecord.
- If ambiguity affects product, design, architecture, shared contracts, validation policy, or task scope, emit DecisionRequest.
- If decision is blocking, move task to awaiting-ai-decision or awaiting-human-decision.
- Resume only after task instructions are patched or scope is narrowed.

## Alternatives Considered

- Let developer agents ask humans directly: rejected because the Orchestrator Loop should route to the right role first.
- Let developer agents call all primitives manually: rejected because routing belongs to the orchestration engine.

## Implementation Plan

- [ ] Add decision-boundary classifier to Developer loop.
- [ ] Add DecisionRequest creation tool/API.
- [ ] Add awaiting decision task status support.
- [ ] Add task patch application and resume behavior.
- [ ] Update developer instructions to prohibit hidden scope decisions.
