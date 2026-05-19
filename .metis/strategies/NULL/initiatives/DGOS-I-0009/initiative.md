---
id: multi-agent-orchestration-and-wave
level: initiative
title: "Multi-Agent Orchestration and Wave Execution"
short_code: "DGOS-I-0009"
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

Katana already has a proposed multi-agent orchestration spec based on NELP lessons: dependency graphs, wave planning, generated agent instruction docs, isolated worktrees, status records, and completion reporting. This remains applicable but should follow the artifact protocol and MVP flow.

## Goals & Non-Goals

**Goals:**
- Add dependency graph fields and compute_wave_plan.
- Generate wave plans before spawning agents.
- Persist child-agent records under .katana/agents.
- Support spawn, query, wait, send, report, and terminate operations.
- Keep orchestration agents ignorant of task internals except summaries and status.

**Non-Goals:**
- Distributed orchestration across machines.
- Automatic merge to protected branches.
- Replacing human approvals for strategic gates.

## Detailed Design

Wave planning topologically sorts docs by depends_on, enforces single-author criteria, checks disjoint ownership surfaces, and allocates migration ranges. Agent instruction docs include mission, setup, dependencies, owned surfaces, hard rules, validation obligations, and completion checklist.

Spawned agents run in isolated worktrees and report status through filesystem-backed records that can be resumed if the orchestrator dies.

## Alternatives Considered

- Spawn agents before wave planning: rejected because humans need inspectable execution plans first.
- Use chat history for orchestration state: rejected because process recovery needs durable records.
- Make children report full diffs upward: rejected because orchestrators should consume compact summaries.

## Implementation Plan

- [ ] Extend frontmatter with depends_on, execution, owns_files, owns_tables, and review fields.
- [ ] Implement compute_wave_plan and a BATCHES-style renderer.
- [ ] Add agent record storage and query/list tools.
- [ ] Add single-agent spawn before multi-agent fan-out.
- [ ] Add wait_for_agents and report-to-orchestrator protocol.
