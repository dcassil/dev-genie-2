---
id: multi-agent-orchestration-and-wave
level: initiative
title: "Multi-Agent Orchestration and Wave Execution"
short_code: "DGOS-I-0009"
runtime_primitive: loop
created_at: 2026-05-19T16:57:31.062491+00:00
updated_at: 2026-05-19T16:57:31.062491+00:00
parent: DGOS-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/discovery"


exit_criteria_met: false
estimated_complexity: XL
strategy_id: NULL
initiative_id: multi-agent-orchestration-and-wave
---

# Multi-Agent Orchestration and Wave Execution Initiative

## Context

Katana already has a proposed multi-agent orchestration spec based on NELP lessons: dependency graphs, wave planning, generated agent instruction docs, isolated worktrees, status records, and completion reporting. This initiative owns the Multi-Agent Wave Execution Loop: a long-running stateful primitive that follows the artifact protocol and MVP flow while preserving child-agent state and resumability.

DGOS-A-0002 chooses a local subprocess Role runner for one-shot model-backed Role invocations. That convention does not replace wave workers. Wave workers are Loop-managed execution processes, usually Developer Loops or migration Loops, that may run for many steps and mutate code in isolated worktrees.

## Goals & Non-Goals

**Goals:**
- Add dependency graph fields and compute_wave_plan.
- Generate wave plans before spawning agents.
- Persist child-agent records under .katana/agents.
- Support spawn, query, wait, send, report, and terminate operations.
- Keep orchestration agents ignorant of task internals except summaries and status.
- Allow the Wave Loop to invoke Planner, Architect, Designer, Principal FE/BE, PM, and Quality Roles through the DGOS-A-0002 Role runner when wave execution raises bounded decisions.
- Quiesce dependent workers when a Role decision changes a shared contract, schema, public API, task interface, or ownership boundary.

**Non-Goals:**
- Distributed orchestration across machines.
- Automatic merge to protected branches.
- Replacing human approvals for strategic gates.
- Treating one-shot Role invocations as child execution workers.

## Detailed Design

Wave planning topologically sorts docs by depends_on, enforces single-author criteria, checks disjoint ownership surfaces, and allocates migration ranges. Agent instruction docs include mission, setup, dependencies, owned surfaces, hard rules, validation obligations, and completion checklist.

Spawned agents run in isolated worktrees and report status through filesystem-backed records that can be resumed if the orchestrator dies.

Relationship to Role invocation:

- Wave workers are stateful Loops. They receive task instructions, own code surfaces, run validations, and report progress over time.
- Roles are one-shot reasoning calls. The Wave Loop invokes them through `dev-genie role invoke <role-id> --input <RoleInvocation.json> --output <RoleResult.json>`.
- A worker that encounters a planning, design, architecture, or quality question emits a `DecisionRequest` to the Wave Loop. The worker does not call the Role directly.
- The Wave Loop routes the request through Orchestrator routing and the Decision Policy Engine, then invokes the target Role through the DGOS-A-0002 convention.
- If the `RoleResult` patches only the requesting worker's task instructions, the Wave Loop updates that worker and resumes it.
- If the `RoleResult` affects a shared contract, the Wave Loop pauses dependent workers, applies or reviews the artifact patch, updates affected task instructions, then resumes workers whose assumptions are still valid.
- If the `RoleResult` has low confidence, missing context, or `needs_human`, the Wave Loop records the blocked scope and pauses only the workers whose owned surfaces depend on that decision.

## Alternatives Considered

- Spawn agents before wave planning: rejected because humans need inspectable execution plans first.
- Use chat history for orchestration state: rejected because process recovery needs durable records.
- Make children report full diffs upward: rejected because orchestrators should consume compact summaries.
- Use Role subprocesses as wave workers: rejected because Roles are one-shot artifact producers and do not own long-running code execution state.

## Implementation Plan

- [ ] Extend frontmatter with depends_on, execution, owns_files, owns_tables, and review fields.
- [ ] Implement compute_wave_plan and a BATCHES-style renderer.
- [ ] Add agent record storage and query/list tools.
- [ ] Add single-agent spawn before multi-agent fan-out.
- [ ] Add wait_for_agents and report-to-orchestrator protocol.
- [ ] Add wave-level DecisionRequest quiescence rules for shared-contract decisions.
- [ ] Add RoleInvocation dispatch from the Wave Loop for bounded planning/design/architecture/quality questions.
