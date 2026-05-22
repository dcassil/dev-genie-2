---
id: checkpoint-reconciliation-diff-by
level: task
title: "Checkpoint Reconciliation: Diff-by-ID & Mid-Execution Superseded Handling"
short_code: "DGOS-T-0010"
created_at: 2026-05-22T17:53:57.150028+00:00
updated_at: 2026-05-22T21:46:10.515391+00:00
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

# Checkpoint Reconciliation: Diff-by-ID & Mid-Execution Superseded Handling

## Parent Initiative

[[DGOS-I-0011]] — implements the state-ownership reconciliation mechanism from [[DGOS-A-0005]] that lets external plan edits flow in without two-way sync.

## Objective

Implement **checkpoint reconciliation**: at defined checkpoints (before selecting the next task, after a wave completes) the Supervisor reads the WorkSource and **diffs by task ID** against its execution-store nodes, applying the ADR's rules — new ID → schedule a node; missing ID → cancel its node; changed acceptance/deps → mark the node stale and re-run/re-validate; externally completed → drop from queue. The hard case is a task that is **mid-execution** when the diff says it was deleted or its acceptance changed: the diff must not silently mutate an in-flight node — it `interrupt`s the worker, marks the node `superseded`, and records any work product produced. v1 is **last-read-wins at checkpoints, no locking**; no automatic rollback of already-merged work.

## Acceptance Criteria

## Acceptance Criteria

## Acceptance Criteria

- [ ] Reconciliation runs at the defined checkpoints (before next-task selection; after a wave completes) and **not** as continuous file-watching (v1 uses checkpoint diff per the ADR).
- [ ] **Diff-by-ID rules** implemented and tested: new ID → schedule node; missing ID → cancel node; changed acceptance/deps → mark node stale + re-run/re-validate; externally `done` → drop from queue.
- [ ] Uses the WorkSource revision/etag from [[DGOS-T-0005]] to detect changes efficiently; relies on stable task IDs from the WorkSource adapters.
- [ ] **Mid-execution superseded rule:** when a diff would delete or change an **in-flight** node, the reconciler does NOT silently mutate it — it issues `interrupt` to the worker via AgentTransport, marks the node `superseded` in the execution store, and records what work product (if any) the interrupted worker had produced so a human or a re-run can decide its fate. Tested with an in-flight worker.
- [ ] **No auto-rollback:** already-merged work product from a prior run of a now-stale task is not auto-reverted; the node is re-queued and the parent's authoritative validation ([[DGOS-T-0006]]/ADR-3) is relied on to catch inconsistency. A test asserts no revert occurs and the node is re-queued.
- [ ] **Last-read-wins, no locking** for v1; the revision/etag is plumbed through so optional optimistic concurrency can be added later without redesign (a clearly-marked extension point).
- [ ] Reconciliation is unit-tested against fake WorkSource + execution store for: pure add, pure remove (idle node), acceptance change (idle), external completion, and the in-flight superseded case.

## Implementation Notes

### Technical Approach

- Implement reconciliation as a pure function: `(workSourceSnapshot, executionStoreSnapshot) → reconciliationActions[]`, then an applier that executes the actions (schedule/cancel/mark-stale/drop/interrupt-and-supersede). The pure-function split keeps it testable.
- Hook the applier into the loop's ([[DGOS-T-0008]]) checkpoint boundaries; the loop calls reconcile before selecting the next task and after a wave.
- For the in-flight case, coordinate with AgentTransport `interrupt` (and its honor/timeout semantics from [[DGOS-T-0004]]) and persist the interrupted worker's partial work-product reference in the execution store.
- Depend on stable IDs: document the assumption and fail loudly (rather than silently mis-diffing) if the WorkSource returns unstable IDs.

### Dependencies

- **Upstream:** [[DGOS-T-0005]] (`listTasks` + revision/etag + stable IDs), [[DGOS-T-0003]] (execution-store node keys + `superseded` state + work-product recording), [[DGOS-T-0008]] (checkpoint boundaries), [[DGOS-T-0004]] (`interrupt`).
- **Downstream:** [[DGOS-T-0011]] (wave-completion checkpoints invoke reconciliation; sibling quiesce interacts with supersede).

### Risk Considerations

- **Silent mutation of in-flight work** is the dangerous failure. Mitigation: the in-flight path is interrupt-and-supersede-and-record, never silent delete; explicitly tested.
- **Unstable IDs cause phantom add/remove churn.** Mitigation: documented stable-ID dependency on the WorkSource adapter + a guard.
- **Lost work product** on supersede. Mitigation: record the partial work-product reference so a human/re-run can recover it; v1 deliberately does not auto-rollback merged work (documented limitation).

### Execution Profile

**Recommended Agent: opus + high.** This implements the subtle state-ownership boundary mechanism — in-flight interrupt/supersede semantics and the no-rollback rule are easy to get wrong and central to the ADR's "no two-way sync" guarantee. Mistakes here corrupt run state, so top tier.

## Status Updates

### 2026-05-22 — Checkpoint reconciliation complete (via Codex gpt-5.5)

Pure reconciler `daimyo/src/core/reconciliation.ts`: `(workSourceSnapshot, executionStoreSnapshot) → ReconciliationAction[]`; the supervisor applies the actions at checkpoints (run start / before node selection / after a child wave). Diff-by-ID rules: new id → schedule; missing → cancel (idle); changed acceptance/deps fingerprint → mark stale + re-run; external done → drop. Revision/etag plumbed via node `workSourceRevision` + a definition fingerprint (acceptance/deps only); v1 last-read-wins, no locking (revision is the extension point). In-flight changed/deleted node → `AgentTransport.interruptSession` + mark `superseded` + record work product (never silent mutation). No auto-rollback: a stale completed node is re-queued with prior evidence preserved. Unstable/duplicate WorkSource ids fail loudly.

**Orchestrator verification:** typecheck/lint/test/build all green (58 passed / 5 live-skipped). Key tests confirmed by name — pure reconciler: schedule-new, cancel-disappeared, mark-stale-on-fingerprint-change, drop-external-done, **interrupt-and-supersede in-flight**, fail-loud-on-unstable-ids; supervisor integration: in-flight supersede on changed acceptance, and **does-not-rollback prior work product when a completed stale node is re-run**. `src/core` import-pure (reconciler is a pure core function). Version 0.8.0 → 0.9.0. No escape hatches. **exit_criteria_met: true.** Completed.