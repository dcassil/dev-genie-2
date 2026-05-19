---
id: runtime-decision-request-and-micro
level: initiative
title: "Runtime Decision Request and Micro-Workflow Protocol"
short_code: "DGOS-I-0005"
created_at: 2026-05-19T16:57:14.775150+00:00
updated_at: 2026-05-19T16:57:14.775150+00:00
parent: DGOS-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/discovery"


exit_criteria_met: false
estimated_complexity: L
strategy_id: NULL
initiative_id: runtime-decision-request-and-micro
---

# Runtime Decision Request and Micro-Workflow Protocol Initiative

## Context

During implementation, agents often encounter product, planning, design, architecture, backend, frontend, migration, or quality questions. Today the agent either guesses, stops for the human, or expands the task informally. The system needs a typed micro-workflow that starts at the correct role and returns updated instructions to the current task.

## Goals & Non-Goals

**Goals:**
- Let a running task raise a typed DecisionRequest.
- Route the request to the correct plugin role based on question type and artifact context.
- Put the task into an awaiting-ai-decision state when needed.
- Return a DecisionRecord and patch the active task instructions.
- Create new tasks only when the decision is large enough to require independent execution.

**Non-Goals:**
- Make every question a human interruption.
- Let implementation agents make hidden architecture/product decisions.
- Force every micro-decision into a full task document.

## Detailed Design

DecisionRequest fields: source task, question type, blocking status, observed files/artifacts, attempted approach, options considered, urgency, requested role, and suggested follow-up size.

The Orchestration Engine routes requests to Planner, Designer, Architect, Principal BE, Principal FE, Quality Governor, or Human Review. The answer writes a DecisionRecord and either updates the task body, appends implementation instructions, or creates a follow-up task.

Lifecycle options: working -> awaiting-ai-decision -> working, or working -> blocked-human-review. Micro-decisions must be visible in execution records.

## Alternatives Considered

- Let developer agents decide locally: rejected because it hides product/design/architecture drift.
- Always create a new task: rejected because most runtime questions are small clarifications.
- Always ask the human: rejected because role plugins can handle many scoped decisions.

## Implementation Plan

- [ ] Define DecisionRequest and DecisionRecord artifacts.
- [ ] Add task phase/status support for awaiting AI decision.
- [ ] Add routing rules from question type to plugin role.
- [ ] Implement task patching with decision provenance.
- [ ] Add gates that require high-risk decisions to be reviewed before completion.
