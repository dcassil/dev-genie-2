---
id: supervisor-core-loop-node-tree
level: task
title: "Supervisor Core Loop: Node Tree, Leaf/Inner Execution & Return Contract"
short_code: "DGOS-T-0008"
created_at: 2026-05-22T17:53:54.582786+00:00
updated_at: 2026-05-22T21:25:37.289018+00:00
parent: DGOS-I-0011
blocked_by: []
archived: false

tags:
  - "#task"
  - "#phase/completed"


exit_criteria_met: false
strategy_id: NULL
initiative_id: DGOS-I-0011
---

# Supervisor Core Loop: Node Tree, Leaf/Inner Execution & Return Contract

## Parent Initiative

[[DGOS-I-0011]] — the heart of the initiative: the deterministic Supervisor that realizes ADR-3's recursive node tree on the substrate from [[DGOS-A-0005]], composing the three ports and the execution store.

## Objective

Implement the **out-of-process Supervisor core loop**: the deterministic, non-agent process that owns the durable root inner node and drives **disposable leaf and inner agent sessions** per unit of work, recycling them between nodes. It realizes ADR-3's two node types and the child return contract (`done` / `needs-decision` / `failed`), acting **only on explicit turn boundaries and explicit pause events** from the AgentTransport — never reverse-engineering "is it done?" from prose. This task implements the single-parent / single-or-sequential-child path; multi-child wave concurrency and sibling-conflict handling are [[DGOS-T-0011]].

## Acceptance Criteria

- [ ] The Supervisor runs as plain deterministic code whose only memory is the execution store ([[DGOS-T-0003]]); it holds no conversation and cannot fill a context window. A test kills and restarts it mid-run and it resumes from disk.
- [ ] **Leaf node** behavior: spawns a disposable agent via AgentTransport, assigns the task (read from WorkSource), lets it edit + locally validate (leaf-scope Validation), and consumes the structured stream to produce a child return of `done`, `needs-decision`, or `failed`. Leaves **never route decisions** — a `needs-decision` is always bubbled to the parent.
- [ ] **Inner node** behavior: governs children, never edits code; on a child `done` claim it runs **parent-scope authoritative Validation** ([[DGOS-T-0006]]) before marking completion upward; `exit_criteria_met`/completion reflects parent validation, never a child claim.
- [ ] The loop acts only on AgentTransport events: `turn_ended`, `needs_permission`, `needs_input`, `exited`, `stalled` — and treats `log` as progress (no action). A `stalled` event triggers the configured hang handling (interrupt/retry/escalate), distinct from ongoing `log`.
- [ ] **Return-contract handling:** `done` → parent verifies; `needs-decision` → routed to DecisionProvider ([[DGOS-T-0007]]) at the owning inner node (the actioning of the verdict is [[DGOS-T-0009]], wired here as the routing call); `failed` → rework handling (retry policy with bounded retry counts persisted in the execution store).
- [ ] **Permission events** during a worker turn are resolved through the DecisionProvider permission surface (Tier 0 first); the loop issues `approve`/`deny`/`respond`/`choose_option` back through AgentTransport using the correct `correlationId`.
- [ ] Worker recycling: after a node completes/fails, its agent session is disposed; context-fill at the loop level degrades to "recycle this worker," demonstrated by a test driving many sequential nodes without unbounded growth.
- [ ] Resume-token handling: if a node's resume token is invalid ([[DGOS-T-0003]]), the worker is **restarted from task definition + evidence**, not resumed.
- [ ] The entire loop is unit-tested against **fake** AgentTransport / WorkSource / DecisionProvider ([[DGOS-T-0002]] fakes) — no real agent, work system, or model — covering single-leaf success, leaf `failed` + retry, leaf `needs-decision` bubble + routed resolution, and inner-node parent-validation gating completion.

## Implementation Notes

### Technical Approach

- Model the loop as an explicit state machine over node states persisted in the execution store; each transition is a deterministic function of (current node state, incoming transport event / decision result). This is what makes it reconstructable and testable.
- The root is an inner node; orchestration is "the root inner node," not a separate concept (ADR-3). Build the inner-node governance once and reuse it at every level.
- Drive workers strictly through AgentTransport commands/events; never parse prose for control flow. `turn_ended` (SDK `result`) is the only "the agent finished a turn" signal.
- Wire `needs-decision` routing to DecisionProvider and leave the *acting on the verdict* (patch-and-resume / create-follow-up) as the call boundary [[DGOS-T-0009]] fills, so this task stays focused on the loop skeleton.
- Bounded retry policy for `failed`: counts in the execution store, configurable max, then escalate (`needs-decision`/human).

### Dependencies

- **Upstream:** [[DGOS-T-0003]] (execution store), [[DGOS-T-0004]] (AgentTransport + SDK adapter), [[DGOS-T-0005]] (WorkSource for task read + status write), [[DGOS-T-0007]] (DecisionProvider for routing + permission). Conceptually all four must exist; testing uses their fakes.
- **Downstream:** [[DGOS-T-0009]] (decision actions + Tier-2), [[DGOS-T-0010]] (reconciliation hooks into the loop's checkpoints), [[DGOS-T-0011]] (multi-child concurrency generalizes this loop).

### Risk Considerations

- **Re-introducing in-context durability:** any temptation to keep run state in an agent rather than the store would re-create the original failure. Mitigation: the loop holds no agent context; all state is in the execution store; the kill/restart test enforces it.
- **Acting on prose instead of events:** mitigated by routing all control flow through explicit transport events and `turn_ended`.
- **Scope creep into wave concurrency:** explicitly deferred to [[DGOS-T-0011]]; this task is sequential/single-child to keep the core correct first.

### Execution Profile

**Recommended Agent: opus + high.** This is the core architecture that composes all three ports and the store into ADR-3's recursive contract; it is the single most load-bearing implementation task in the initiative, and downstream concurrency/reconciliation build directly on it.

## Status Updates

- 2026-05-22: Added the initial `daimyo/src/supervisor` sequential loop shape, plus transport disposal/resume-rejection contract support. TypeScript passes after the first implementation pass. Next: whole-loop fake tests, lint/test/build, version bump, dist rebuild.
- 2026-05-22: Completed whole-loop fake coverage for restart/resume, failed retry, needs-decision routing + minimal resume, parent validation gating, permission correlation, stalled interrupt retry, worker recycling, and invalid resume-token restart. Final verification passed: `npm run typecheck && npm run lint && npm test && npm run build`.
- 2026-05-22 (orchestrator verification): re-ran typecheck/lint/test/build — all green (42 passed / 5 live-skipped; 8 supervisor tests). Confirmed each load-bearing invariant has a real test: reconstruct-after-loss (fresh `Supervisor` resumes from `ExecutionStore`), failed-retry with persisted counts, needs-decision bubble→route→resume, **parent-validation gates completion when a child claims done**, permission events answered with matching correlationId via DecisionProvider, stalled→interrupt, worker recycling across many sequential children, and invalid-resume-token→restart-from-evidence. `src/core` import-pure (loop lives in `src/supervisor`). Sequential/single-child only — multi-child wave concurrency correctly deferred to DGOS-T-0011; verdict actioning (patch/create-follow-up) deferred to DGOS-T-0009. Version 0.6.0 → 0.7.0. No escape hatches. **exit_criteria_met: true.** Completed.