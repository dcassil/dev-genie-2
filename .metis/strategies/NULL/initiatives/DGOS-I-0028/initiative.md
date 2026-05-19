---
id: orchestration-engine-routing-and
level: initiative
title: "Orchestrator Loop Routing and Nested Workflow Dispatch"
short_code: "DGOS-I-0028"
runtime_primitive: loop
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

# Orchestrator Loop Routing and Nested Workflow Dispatch Initiative

## Context

The Orchestrator Loop must route initial workflows and nested runtime workflows. It should know which Role or Engine to ask for each artifact gap or DecisionRequest, preserve durable routing state, and avoid doing role-specific reasoning itself.

DGOS-A-0002 fixes the v1 Role invocation convention. The Orchestrator invokes model-backed Roles through a local subprocess Role runner that consumes a `RoleInvocation` JSON envelope and writes a `RoleResult` JSON envelope. Engines remain direct typed calls. Loops remain stateful workflow runners.

## Goals & Non-Goals

**Goals:**
- Implement routing from artifact state and DecisionRequest type to Role.
- Invoke Roles through the DGOS-A-0002 subprocess Role runner.
- Support nested workflows that start at Planner, Designer, Architect, Principal FE/BE, Quality, or Project Manager.
- Re-enter the active task with patched instructions when the nested workflow resolves.
- Preserve durable routing records.
- Handle timeout, failed process, malformed output, low confidence, missing context, skip, and needs-human returns.

**Non-Goals:**
- Embed product/design/architecture reasoning in the orchestrator.
- Require multi-agent process spawning for nested workflows.
- Treat slash commands, skills, or MCP servers as the primary Role invocation convention for v1.

## Detailed Design

Routing table examples:

- product/planning -> Planner
- UX behavior -> Designer
- module boundary/public contract/schema/auth -> Architect or Principal BE
- component/state/layout implementation plan -> Principal FE
- tests/gates/completion ambiguity -> Quality Governor
- sequencing/scope split -> Project Manager

Role dispatch algorithm:

1. Classify the artifact gap or `DecisionRequest` into a decision scope and requested operation.
2. Ask the Decision Policy Engine for autonomy, review, budget, model tier, timeout, and allowed tools.
3. Ask the Context Engine for the minimum context bundle required by the target Role contract.
4. Write a `RoleInvocation` envelope containing role id, operation, decision scope, artifact refs and hashes, context refs, policy refs, budget, timeout, and expected output schemas.
5. Run `dev-genie role invoke <role-id> --input <RoleInvocation.json> --output <RoleResult.json>`.
6. Validate `RoleResult` against schema and artifact ownership rules.
7. Apply owned artifact writes directly through Document Engine, or create proposed artifact patches when the Role is not the owner.
8. Patch and resume the active task when the decision is local enough; otherwise create or update durable work items.
9. Record a trace linking the triggering request, invocation, result, artifacts, costs, and downstream task updates.

Failure-mode policy:

- timeout: mark the invocation failed, preserve stdout/stderr, and retry only if policy allows a bounded retry.
- non-zero exit without valid `RoleResult`: route to implementation failure handling.
- malformed result: route to Validation Engine and file an implementation defect if reproducible.
- low confidence: retry with expanded context, escalate model tier, ask human, or route to a second Role according to policy.
- `missing_context` populated: ask Context Engine or Repo Intelligence for the named context and retry once unless policy requires human review.
- `needs_human`: move the triggering workflow to an awaiting-human decision state with the Role's options and recommended default.
- `skipped`: require a skip reason and apply skip verifier rules before downstream work relies on the absence of that Role output.

Orchestration should support synchronous fake Role runners for tests, direct Engine calls for deterministic behavior, and platform adapters that wrap the subprocess convention later.

## Alternatives Considered

- Let Developer call Roles directly: rejected because routing and policy are central responsibilities.
- Make every nested workflow a full new task: rejected because many decisions should patch the current task.
- Invoke Roles through skills or slash commands: rejected by DGOS-A-0002 because the orchestrator needs typed envelopes, isolation, timeout behavior, and durable traces.

## Implementation Plan

- [ ] Define routing table and primitive capability registry.
- [ ] Implement `RoleInvocation` writer and `RoleResult` validator.
- [ ] Implement subprocess Role dispatch with timeout, stdout/stderr capture, and trace records.
- [ ] Add nested workflow execution protocol.
- [ ] Integrate Decision Policy Engine before dispatch.
- [ ] Add task patch/resume behavior.
- [ ] Add trace records for every routed decision.
