---
id: workflow-engine-and-loops
level: initiative
title: "Workflow Engine and Task Loops"
short_code: "KAT-I-0003"
created_at: 2026-05-09T16:15:00.000000+00:00
updated_at: 2026-05-09T16:15:00.000000+00:00
parent: KAT-V-0001
blocked_by: [validation-gates, document-templates-and-schema]
archived: false

tags:
  - "#initiative"
  - "#phase/completed"


exit_criteria_met: false
estimated_complexity: L
strategy_id: NULL
initiative_id: workflow-engine-and-loops
---

# Workflow Engine and Task Loops Initiative

## Context

Katana docs progress through phases (Planning → ToDo → In Progress → Done, plus Blocked). Each phase transition is gated. Tasks additionally need a work loop: an agent works the task, an evaluation step checks the result against acceptance criteria, gates fire, and either it's done or it loops with refined input.

The pattern is: **work → eval → gate → loop → done**. This is similar to (and may directly reuse) the existing `metis-ralph` plugin, which already runs Ralph-style loops over metis tasks. Investigate first, build only what's missing.

The two-pass task model adds a wrinkle: a high-pass task's "done" produces the scaffold that becomes the input to the low-pass task. The engine must understand and enforce that handoff (the high-pass result is the low-pass starting context).

## Scope

- Phase machine per document type (states, allowed transitions, gates required for each transition).
- Work loop runtime for tasks: dispatch to model, capture output, run eval, run gates, decide to complete/retry/block.
- Two-pass handoff: high-pass output becomes low-pass input; engine enforces ordering and context passing.
- Model selection per task type (config-driven: high-pass → strong model, low-pass → cheap model, UI → ?).
- Reuse `metis-ralph` if it fits the contract; if not, document why and design our own.
- Investigate Claude Code skills (`metis-ralph`, `metis-ralph-tasks`, `metis-ralph-initiative`) and decide which we can wrap or copy.

## Out of scope

- Gate library (covered by validation-gates).
- Agent-platform-specific dispatch (covered by agent-platform-strategy).
- Document storage and MCP surface (covered by mcp-server-and-storage).

## Open questions

- Does `metis-ralph` give us enough, or do we need our own loop runner? Decide during decomposition after a spike.
- How is the eval step structured — separate prompt to a judge model, mechanical checks, or both? Likely both, with mechanical first.
- How does the loop terminate on persistent failure — max-iterations, escalation to human, fall back to higher-tier model?

## Exit criteria

- Phase machine implemented and unit-tested for every doc type.
- Work-loop runtime executes a task end-to-end against a fake model dispatcher.
- Two-pass handoff demonstrated on a fixture story (high-pass produces scaffold; low-pass consumes it; final doc reaches Done).
- Decision recorded on `metis-ralph` reuse vs. own implementation, with rationale.
