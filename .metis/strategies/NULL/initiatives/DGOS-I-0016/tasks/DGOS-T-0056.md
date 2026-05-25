---
id: implement-the-lock-aware-managed
level: task
title: "Implement the lock-aware managed-write applier emitting a ReconciliationReport"
short_code: "DGOS-T-0056"
created_at: 2026-05-25T17:51:51.593671+00:00
updated_at: 2026-05-25T17:51:51.593671+00:00
parent: DGOS-I-0016
blocked_by: []
archived: false

tags:
  - "#task"
  - "#phase/todo"


exit_criteria_met: false
strategy_id: NULL
initiative_id: DGOS-I-0016
---

# Implement the lock-aware managed-write applier emitting a ReconciliationReport

## Parent Initiative

[[DGOS-I-0016]] — Installer & Reconciliation Engine. Implements `apply()` — the **only IO module** — and the conflict-not-clobber, idempotent-rerun, lock-aware guarantees that are the Engine's whole reason to exist. On the critical path; highest tier.

## Objective

Implement `engines/src/installer/applier.ts`: `apply(plan: InstallPlan, port: ManagedWriter): Promise<ReconciliationReport>`. It walks the plan's mutations in deterministic order, delegates each to the appropriate `ManagedWriter` method (DGOS-T-0055), and assembles a `ReconciliationReport`. It enforces: idempotent reruns (already-satisfied → `skipped`, no rewrite), conflict-not-clobber (a managed region edited out from under the recorded baseline → `conflict`, no write), and lock awareness (locked target → `blocked`, never auto-lifted). It is the sole module in the installer that performs filesystem mutation, entirely through the injected port.

## Acceptance Criteria

- [ ] `applier.ts` exports the function `engine.ts`'s `apply` delegates to; it accepts an `InstallPlan` + `ManagedWriter` and returns a schema-valid `ReconciliationReport` (validated via the `engines` Ajv validator; test included).
- [ ] **Conflict-not-clobber**: for a mutation targeting a managed region, the applier compares the current on-disk managed region (exposed via the port) against the recorded baseline; if the user edited it, it emits `status: conflict`, `reason_code: managed_region_drift`, writes **nothing** for that mutation, and continues. A test asserts the file is unchanged after a conflict. **A conflict is never a silent overwrite.**
- [ ] **Idempotent rerun**: applying a plan whose mutations are `already_satisfied` performs zero writes and reports every outcome as `skipped` (`already_satisfied`); applying the same real plan twice yields no second-run mutation (a test applies twice against a temp dir and asserts the second run's outcomes are all `skipped` and the files are byte-identical). The last-run record (`.dev-genie/init.last-run.json` via the plan-store adapter) is updated after a non-dry-run apply, per RECONCILIATION.md.
- [ ] **Lock awareness**: a mutation whose target is locked emits `status: blocked`, `reason_code: lock_blocked`, writes nothing, and never auto-lifts the lock (matching the non-interactive `skip` default).
- [ ] **Status taxonomy + rollup**: each outcome carries `applied | skipped | blocked | conflict` with a `reason_code` and `rationale`; the report's `counts` and `had_conflict` are computed correctly from the outcomes. A scenario with at least one of each status produces correct counts.
- [ ] **Determinism of order, isolation of IO**: outcomes appear in the plan's mutation order; the applier is the only installer module importing write-capable code (all via the port); `detect`/`plan` remain write-free. A test/inspection confirms.
- [ ] **dry-run**: `apply` in dry-run mode produces a complete report (predicted statuses) while writing nothing.
- [ ] `engines` typecheck/lint/test/build green; no rule disabled; no escape hatches. `pnpm --filter engines test` + `pnpm -r build` green. dev-genie + katana legacy suites green; their writers were delegated to, not modified.

## Implementation Notes

### Technical Approach

- The applier is the analogue of decision-policy's IO boundary (`config-loader.ts`): the single place async/filesystem work happens, behind an injected port.
- Reuse dev-genie's proven idempotency + lock semantics through the adapter (DGOS-T-0055): `plan-store.js` for last-run, `findLockForFinding`/`liftLock` (read-only here) for locks, the fenced-marker writers for managed regions. The applier orchestrates; the adapters write.
- Conflict detection compares the current managed-region content against the baseline the detector recorded (DGOS-T-0053) / the last-run record; surface a hash or the conflicting region in the outcome `detail`.
- Files touched: `engines/src/installer/applier.ts` (fill stub), `engines/src/installer/engine.ts` (wire `apply` delegation), applier tests (temp-dir + stubbed-port).

### Dependencies

- **Upstream:** DGOS-T-0054 (the `InstallPlan` it walks), DGOS-T-0055 (the `ManagedWriter` adapters it delegates to), DGOS-T-0053 (baseline region content for drift), DGOS-T-0051 (`ReconciliationReport` shape).
- **Downstream:** DGOS-T-0057 (end-to-end fixture scenarios + bootstrap seam consume the report).

### Risk Considerations

- **Silent clobber of user edits.** Mitigation: re-read + baseline compare before every managed-region write; the file-unchanged-after-conflict test.
- **Non-idempotent rerun (double-append, marker duplication).** Mitigation: delegate to the proven fenced-marker writers (which replace only between markers) + the apply-twice byte-identical test.
- **IO leaking outside the applier.** Mitigation: all writes through the port; no-write-import check on detect/plan.
- **Lock auto-lift.** Mitigation: locks default to `blocked`; `liftLock` is never invoked automatically.

### Execution Profile

**Recommended Agent: opus + high.** The only IO module and the home of the conflict-not-clobber / idempotency / lock guarantees that define the Engine's value; subtle correctness, load-bearing, on the critical path.

## Status Updates

*To be added during implementation.*
