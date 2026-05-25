---
id: fixture-suite-coverage-and-the
level: task
title: "Fixture-suite coverage and the bootstrap consumable seam"
short_code: "DGOS-T-0057"
created_at: 2026-05-25T17:51:52.641714+00:00
updated_at: 2026-05-25T17:51:52.641714+00:00
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

# Fixture-suite coverage and the bootstrap consumable seam

## Parent Initiative

[[DGOS-I-0016]] — Installer & Reconciliation Engine. The capstone: end-to-end fixture coverage of the five required scenarios, and the **consumable contract** that DGOS-I-0012 (Bootstrap) invokes — without building bootstrap sequencing. Closes the initiative's Implementation Plan.

## Objective

Deliver (1) an end-to-end fixture suite exercising the full detect → plan → apply → report flow against temp-dir repos for the five scenarios the initiative requires, and (2) the stable, documented Engine export surface plus a consumer-perspective seam test proving bootstrap can call `detect`/`plan`/`apply` and sequence on the typed `ReconciliationReport`. No bootstrap workflow, autonomy handshake, or phase sequencing is built here (those are I-0012); only the consumable contract is delivered and proven.

## Acceptance Criteria

- [ ] End-to-end fixture scenarios (temp-dir backed, real `FsReadPort` + `ManagedWriter` adapters) cover all five required cases from the initiative's Implementation Plan: (a) greenfield install, (b) existing-repo adoption, (c) idempotent rerun is a no-op (all `skipped` second run, files byte-identical), (d) a managed-region conflict is `blocked`/`conflict` and **not clobbered**, (e) a `skipped` already-satisfied mutation. Each scenario asserts the produced `InstallPlan` and `ReconciliationReport` against the protocol schemas.
- [ ] The Engine's public export surface is finalized and stable: `engines`' entry exports `InstallerEngine` (with `detect`/`plan`/`apply`), the `RepoState`/`DesiredState` types, the `FsReadPort`/`ManagedWriter` ports, default node-fs read + writer adapters, and `INSTALLER_ENGINE_VERSION`. A re-export test confirms each is reachable from the package entry.
- [ ] A **bootstrap-seam test** written from the consumer's perspective: it constructs a `DesiredState`, calls `detect()` → `plan()` → `apply()` end to end using only the public exports (no deep imports), and asserts it can branch on `report.had_conflict` / `report.counts` to sequence follow-up — demonstrating bootstrap needs no prose parsing. The test explicitly does **not** implement bootstrap sequencing.
- [ ] A short consumer doc/example (in `engines/src/installer/`'s README or a doc comment) shows the I-0012 invocation pattern (`detect → plan → [optional autonomy gate] → apply → read report`) and states the boundary: this Engine ships the contract; bootstrap owns sequencing.
- [ ] **All five workspace suites stay green**: `pnpm -r build` plus the per-package test suites (`protocol`, `daimyo`, `roles`, `engines`, and any other workspace package) all pass. **Legacy plugins unaffected**: dev-genie's and katana's own test suites pass and their CLIs/commands behave identically (the Engine added a typed layer over them, changing no existing behavior).
- [ ] `engines` typecheck/lint/test/build green; no rule disabled; no `any`/`unknown`/ts-ignore/ts-expect-error. If `engines` (or dev-genie via an added wrapper) version was bumped during the initiative, the bumps are coherent and restated.

## Implementation Notes

### Technical Approach

- Build the temp-dir scenarios with Node's `fs`/`os.tmpdir` (mirror how dev-genie's `apply-flow-*.test.mjs` and the platform adapter tests set up temp repos). Each scenario: seed the temp repo, run `detect`, `plan`, `apply`, assert files + report.
- For the conflict scenario, seed a managed region then mutate it by hand before apply; assert `conflict` + unchanged file.
- For idempotency, run apply twice and assert the second report is all-`skipped` and files are byte-identical.
- The seam test imports only from `engines`' package entry to prove the contract is consumable without deep imports.
- Files touched: `engines/src/installer/*.e2e.test.ts` (new), `engines/src/installer/index.ts` (finalize exports), `engines/src/index.ts`, a README/doc comment in `engines/src/installer/`.

### Dependencies

- **Upstream:** DGOS-T-0056 (working `apply`), and transitively all prior tasks. This is the last task.
- **Downstream:** DGOS-I-0012 (Bootstrap) consumes this surface — out of scope here beyond proving the seam.

### Risk Considerations

- **Flaky temp-dir tests.** Mitigation: isolated temp dirs per test, deterministic seeds, no shared state.
- **Scope creep into bootstrap sequencing.** Mitigation: the seam test is consumer-perspective only; the doc explicitly states the boundary.
- **Breaking a workspace suite or a legacy plugin late.** Mitigation: run all five suites + both legacy suites as an acceptance gate; the Engine layered over the writers, it did not modify them.

### Execution Profile

**Recommended Agent: opus + medium.** Integration + comprehensive test coverage across the workspace and the consumer-seam contract; substantive and cross-cutting but exercises already-built pieces rather than defining new architecture.

## Status Updates

*To be added during implementation.*
