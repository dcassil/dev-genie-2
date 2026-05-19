---
id: developer-plugin-decisionrequest
level: initiative
title: "Developer Plugin DecisionRequest Behavior"
short_code: "DGOS-I-0022"
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
initiative_id: developer-plugin-decisionrequest
---

# Developer Plugin DecisionRequest Behavior Initiative

## Context

The Developer plugin must stop making hidden planning, product, design, or architecture decisions during execution. It should recognize decision boundaries and emit typed DecisionRequests.

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

- Let developer agents ask humans directly: rejected because the orchestration engine should route to the right role first.
- Let developer agents call all plugins manually: rejected because routing belongs to the orchestration engine.

## Implementation Plan

- [ ] Add decision-boundary classifier to Developer loop.
- [ ] Add DecisionRequest creation tool/API.
- [ ] Add awaiting decision task status support.
- [ ] Add task patch application and resume behavior.
- [ ] Update developer instructions to prohibit hidden scope decisions.
