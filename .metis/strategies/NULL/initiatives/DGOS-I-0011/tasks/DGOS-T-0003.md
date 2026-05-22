---
id: execution-state-store-resume
level: task
title: "Execution-State Store & Resume/Recovery"
short_code: "DGOS-T-0003"
created_at: 2026-05-22T17:53:48.292872+00:00
updated_at: 2026-05-22T20:18:49.841726+00:00
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

# Execution-State Store & Resume/Recovery

## Parent Initiative

[[DGOS-I-0011]] — implements the durable execution-state store that makes the Supervisor "reconstructable from durable state after process loss" (ADR-1 requirement, satisfied by construction per [[DGOS-A-0005]]).

## Objective

Build the Supervisor's **own durable execution-state store** — the half of the state-ownership boundary that belongs to the Supervisor (the WorkSource owns the other half). This store holds *execution / loop state only*: per-node status, `DecisionRecord`s, retry counts, transport session IDs, resume tokens, and the execution cursor, keyed by task ID. It must survive process loss and let the Supervisor reconstruct an in-progress run. It deliberately holds **no authoritative copy of task definitions or task status** (those live only in the WorkSource), so there is nothing to mirror or reconcile here.

## Acceptance Criteria

## Acceptance Criteria

## Acceptance Criteria

- [ ] A persistence layer writes/reads execution state to an on-disk `.supervisor/` store. The format (jsonl vs sqlite) is chosen and the rationale recorded (the ADR leaves this open under DGOS-I-0011); the choice is encapsulated behind a store interface so it can change later.
- [ ] The stored record set covers, per node: node id, parent id, node type, execution status (including Supervisor-only states like `awaiting_human` and `superseded` that are NOT WorkSource statuses), retry count, the transport session id + resume token, associated `DecisionRecord` refs, and the run's execution cursor.
- [ ] `needs-decision` / mid-decision state lives here as execution state and is **never** written to the WorkSource status set (preserving the state-ownership boundary from DGOS-A-0005).
- [ ] **Reconstruct-after-loss** is implemented and tested: given only the on-disk store (no in-memory state), the Supervisor can rebuild the node tree, statuses, retry counts, and cursor to resume the run.
- [ ] **Resume-token invalidation** is handled per the ADR's asymmetric-durability rule: when an agent session's resume token is no longer valid (server retention window / version mismatch), the affected worker is flagged for **restart from task definition + accumulated evidence**, not resume — and a test demonstrates this path.
- [ ] Writes are crash-safe enough that a kill mid-write does not corrupt the store (e.g. append-only jsonl with atomic appends, or sqlite transactions); a test simulates an interrupted write.
- [ ] All behavior is unit-tested against the fake ports from [[DGOS-T-0002]] with no real agent or model.

## Implementation Notes

### Technical Approach

- Define a `ExecutionStore` interface in core; implement one concrete adapter (jsonl or sqlite). jsonl favors append-only crash-safety and easy inspection; sqlite favors queryability and atomic multi-record updates. Pick one, document why, keep the interface narrow so the other remains a future swap.
- Model execution state as an event log + projected current state if jsonl (replay to reconstruct), or as tables if sqlite. Either way, the reconstruct path must be exercised by a test that loads from disk into a fresh process-equivalent.
- Keep keys by task ID so the checkpoint reconciler ([[DGOS-T-0010]]) can diff WorkSource task IDs against execution-store node keys.
- Encode the resume-token lifecycle explicitly: `resumable` (token valid) vs `restart-required` (token invalid/expired) so the loop ([[DGOS-T-0008]]) can branch deterministically.

### Dependencies

- **Upstream:** [[DGOS-T-0002]] (core types: node status, `DecisionRecord`, ids; fake ports for testing).
- **Downstream:** [[DGOS-T-0008]] (loop reads/writes node state through this), [[DGOS-T-0010]] (reconciliation diffs against it), [[DGOS-T-0009]] (DecisionRecords persisted here).

### Risk Considerations

- **Boundary leakage:** the temptation to cache task definitions/status here would reintroduce the two-way sync the ADR eliminates. Mitigation: the store schema has no field for authoritative task definition or WorkSource status; only execution state.
- **Corruption on crash:** mitigated by append-only/atomic-transaction design + an interrupted-write test.
- **Format lock-in:** mitigated by hiding the format behind the `ExecutionStore` interface.
- **Resume semantics are subtle** and easy to get wrong; the restart-from-evidence fallback must be tested, not just coded.

### Execution Profile

**Recommended Agent: opus + high.** Durable-state design is core architecture: the schema and resume semantics are consumed by the loop, reconciliation, and decision tasks. ADR-1's reconstructability invariant rides entirely on this; a weak design compounds across every stateful behavior downstream.

## Status Updates

- 2026-05-22: Implemented the Supervisor execution-state store behind a core `ExecutionStore` interface with a JSONL adapter under `.supervisor/execution/`, keyed by task ID. JSONL was chosen over sqlite for v1 because the store is an append-only stream of loop-state facts, which keeps crash recovery inspectable and simple; sqlite remains swappable behind the interface if query needs grow. Added replay reconstruction, resume-token invalidation to `restart-required`, trailing partial-write repair, and unit tests using Daimyo fakes only.
- 2026-05-22 (orchestrator verification): re-ran typecheck/lint/test/build — all green (3 files / 8 tests). Confirmed `src/core` remains import-pure. Store holds execution-only state (no WorkSource status / task definition); `needs-decision` stays execution-side. Format (JSONL) is encapsulated behind `ExecutionStore`. Plugin version bumped 0.1.0 → 0.2.0 (minor, per repo rule). No escape hatches. **exit_criteria_met: true.** Completed.