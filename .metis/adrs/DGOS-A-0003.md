---
id: 001-recursive-govern-verify-execution
level: adr
title: "Recursive Govern-Verify Execution Loop"
number: 1
short_code: "DGOS-A-0003"
created_at: 2026-05-21T17:33:49.535766+00:00
updated_at: 2026-05-21T18:03:47.764037+00:00
decision_date: 
decision_maker: Dev-Genie maintainers
parent: 
archived: false

tags:
  - "#adr"
  - "#phase/decided"


exit_criteria_met: false
strategy_id: NULL
initiative_id: NULL
---

# ADR-3: Recursive Govern-Verify Execution Loop

## Context

The existing plan treated developer execution, multi-agent waves, and orchestration as separate loops. In practice that creates duplicated routing logic, weak completion authority, and unclear ownership when work needs revalidation or rework.

The Katana retro sharpened the failure mode: executing agents can claim completion without an authoritative parent check, execution evidence is not written back cleanly, and decomposition becomes noisy when coordination logic is spread across multiple loop types.

We need one loop model that works at task, story, epic, and root levels, preserves the claim-versus-verify invariant, and provides a single home for retries, rework, decision routing, and completion authority.

## Decision

Dev-Genie will use one recursive govern-verify execution loop with two node types: leaf nodes and inner nodes.

### Core invariant

A child claims done. A parent verifies done. Completion is never a self-assertion.

### Node types

- Leaf node: the only node that edits files. It reads the assigned task, makes bounded changes, runs fast validation on its own scope, checks acceptance criteria, ensures coverage expectations are met, and returns a completion claim.
- Inner node: governs children and never edits code. When children claim done, it runs the authoritative validation pass across the owned scope, dispatches rework when needed, and only then marks completion upward.

Wave execution and orchestration are not separate loop families:

- A multi-agent wave is an inner node with more than one child.
- The top-level orchestrator is the root inner node.

### Parent-child return contract

A child returns one of:

- `done`: a completion claim that the parent must verify
- `needs-decision`: a typed decision request that must be routed sideways to the correct Role
- `failed`: an execution error or exhausted retry state that triggers rework handling

Two channels operate at once:

- Vertical execution channel: parent and child exchange `done`, `needs-decision`, and `failed`.
- Sideways decision channel: an inner node routes `needs-decision` to the correct Role through the Role runner, receives a `DecisionRecord`, and either patches the child task and resumes it or creates a follow-up work item if the decision is large.

Leaf nodes never route decisions directly. A leaf must always bubble `needs-decision` to its parent, keeping the leaf limited to implementation, local validation, and reporting.

### Decomposition and validation model

Work still decomposes through epics, stories, and tasks, but story boundaries should default to capability or contract boundaries that can be reviewed and validated independently. Pass-oriented splits remain available as a strategy heuristic only when they reduce coupling.

Validation is one engine at two scopes:

- leaf scope: fast and narrow validation on the leaf's own changes
- parent scope: authoritative full validation across the parent's owned surface, including lint, tests, acceptance-criteria checks, and audit where applicable

`exit_criteria_met` reflects the parent validation result, never a child claim.

### Bubble-by-scope rules

- The parent governs but does not reason. It routes decisions to Roles; it does not answer them itself.
- Task-local questions are handled by the nearest parent.
- Questions that change a shared contract or sibling interface bubble to the node that owns all affected siblings. That node quiesces dependent children, applies the patch or follow-up, and resumes valid work.
- Child autonomy is bounded by the Decision Policy Engine. Out-of-scope questions must be raised as `needs-decision`, never guessed.

Sibling and shared-contract impact is detected through a hybrid model:

- explicit ownership surfaces declared at decomposition time
- runtime touch reports emitted by leaves
- conservative parent-side conflict checks

Ownership surfaces should include declared fields such as `owns_files`, `owns_interfaces`, `owns_data`, `owns_workflow_steps`, and optional `depends_on` references. Leaves report the concrete files, interfaces, and data surfaces they touched or intend to touch. The parent compares that report against sibling ownership surfaces and dependencies.

Conflict handling should distinguish:

- hard conflict: direct ownership overlap or shared-contract change; quiesce affected siblings
- soft conflict: likely dependency impact without confirmed overlap; load sibling context and patch instructions if needed
- no conflict: continue without sibling intervention

## Alternatives Analysis

| Option | Pros | Cons | Risk Level | Implementation Cost |
|--------|------|------|------------|-------------------|
| Keep separate developer, wave, and orchestrator loops | Preserves existing initiative boundaries | Duplicates routing and retry logic, weakens completion authority, and makes coordination rules inconsistent | High | Medium |
| One orchestrator plus mostly autonomous leaves | Simpler to explain | Still leaves unclear parent verification boundaries and makes wave behavior feel like a special case bolted on later | Medium | Medium |
| Recursive govern-verify loop | Unifies execution behavior across task, story, epic, and root levels with one completion model | Requires careful contracts for child returns, decision routing, and rework records | Low | Medium |

## Rationale

The recursive model is the smallest design that handles both human and AI execution well.

For AI, it creates clear ownership boundaries, clear escalation paths, and a single authoritative completion rule. For humans, it mirrors how strong engineering teams already work: implement locally, review and validate at the owning level, and push cross-cutting decisions upward only when scope demands it.

It also removes a common source of overlap and confusion. If work is decomposed into stories that align with capability or contract boundaries, then each inner node can validate a coherent unit and each leaf can stay narrowly scoped.

## Consequences

### Positive
- Completion authority is explicit and enforceable by parent validation.
- Rework, retries, and decision routing live in one loop model instead of three partially overlapping ones.
- Multi-agent waves become a straightforward recursive case rather than a separate architecture.
- Execution evidence and validation outcomes have a natural place in durable records.
- Decomposition quality improves because story scopes and validation scopes line up.

### Negative
- The loop contract is more demanding than a simple one-shot task runner and requires durable state and clear ownership surfaces.
- Shared-contract changes require quiesce and resume behavior, which adds coordination complexity.
- Some existing initiative text that treated waves or orchestration as separate systems must be rewritten.

### Neutral
- This decision does not by itself decide exact persistence format, worker transport, or adapter technology.
- Audit scope can start at epic level and move down to story level later if rework volume justifies it.
- Ownership-surface field names and exact heuristics can evolve, but the architectural rule is fixed: leaves bubble, parents decide, and sibling checks are based on declared ownership plus runtime evidence rather than inference alone.
