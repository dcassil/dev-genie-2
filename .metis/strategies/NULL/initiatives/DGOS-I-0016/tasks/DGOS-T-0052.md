---
id: scaffold-the-installer-engine-and
level: task
title: "Scaffold the Installer Engine and detect/plan/apply contract"
short_code: "DGOS-T-0052"
created_at: 2026-05-25T17:51:46.990326+00:00
updated_at: 2026-05-25T18:11:38.349851+00:00
parent: DGOS-I-0016
blocked_by: []
archived: false

tags:
  - "#task"
  - "#phase/completed"


exit_criteria_met: false
strategy_id: NULL
initiative_id: DGOS-I-0016
---

# Scaffold the Installer Engine and detect/plan/apply contract

## Parent Initiative

[[DGOS-I-0016]] — Installer & Reconciliation Engine. **Load-bearing groundwork task.** It creates `engines/src/installer/` and establishes the `InstallerEngine` surface (`detect` / pure `plan` / IO `apply`), the in-code `RepoState` / `DesiredState` domain types, and the structural no-IO boundary that the detector (DGOS-T-0053), planner (DGOS-T-0054), and applier (DGOS-T-0056) all fill in. A wrong abstraction here cascades into all of them, so it is on the critical path at the highest tier.

## Objective

Scaffold the Installer Engine at `engines/src/installer/` inside the existing `engines/` workspace package, mirroring the proven `engines/src/decision-policy/` shape (pure core + isolated IO + adapter subdir + barrel index). Deliver: (1) the `InstallerEngine` interface/class exposing `detect(...)`, `plan(state, desired): InstallPlan` (synchronous, no IO), and `apply(plan, ...): ReconciliationReport`; (2) the in-code domain types `RepoState` and `DesiredState` plus the internal `FsReadPort` and `ManagedWriter` port interfaces (declarations only); (3) Ajv protocol-validation plumbing for the two new artifacts; (4) stub implementations so the package compiles, lints, tests, and builds green. No detection, planning, or write logic is implemented here beyond minimal fall-through stubs that downstream tasks replace.

## Acceptance Criteria

## Acceptance Criteria

## Acceptance Criteria

- [ ] `engines/src/installer/` exists with `engine.ts`, `detector.ts`, `planner.ts`, `applier.ts`, `ports.ts`, `adapter/index.ts`, and `index.ts`, mirroring the file decomposition of `engines/src/decision-policy/` (`engine.ts`, `config-loader.ts`, `classifier.ts`, `conflict.ts`, `static-rules.ts`, `adapter/`, `index.ts`). The package root `engines/src/index.ts` re-exports the installer surface.
- [ ] `engine.ts` exports an `InstallerEngine` class plus an `InstallerEngine`-shaped interface with: `detect(input): Promise<RepoState>` (delegating to the detector via an injected `FsReadPort`), `plan(state: RepoState, desired: DesiredState): InstallPlan` that is **synchronous and IO-free** (no `Promise` return, no `node:fs`/`node:path`-write import reachable from this method — enforced structurally exactly as `DecisionPolicyEngine.evaluate` is), and `apply(plan: InstallPlan, port: ManagedWriter): Promise<ReconciliationReport>`. For this task `plan` returns a minimal empty-`mutations` `InstallPlan` and `apply` returns an all-`skipped` `ReconciliationReport`; downstream tasks implement the real logic.
- [ ] `ports.ts` declares two **separate** interfaces: `FsReadPort` (read-only: e.g. `exists(path)`, `readFile(path)`, `readDir(path)` — no write method) and `ManagedWriter` (the single port the applier delegates writes through — full method set specified by DGOS-T-0055; a minimal placeholder is reserved here). Keeping them separate is the structural mechanism that prevents `plan`/`detect` from reaching a write method.
- [ ] In-code `RepoState` and `DesiredState` types are defined. `RepoState` carries `repo_classification` (`greenfield | existing`), detected plugin presence, detected managed-region presence per target, lock declarations, and the last-run record reference. `DesiredState` carries the desired plugin/config set. These are the planner's pure inputs.
- [ ] The engine imports `InstallPlan` and `ReconciliationReport` from `protocol` (the DGOS-T-0051 types); it does **not** re-declare them. A test asserts an assembled `InstallPlan`/`ReconciliationReport` validates against the protocol schema.
- [ ] Ajv protocol-schema validation for `install-plan` and `reconciliation-report` is wired by extending `engines/src/schemas/protocol-schemas.ts` `validatorFor(artifactType)` (the loader DGOS-T-0037 ported from `roles`), with a test that the loader resolves the two new schemas in the `engines` package context.
- [ ] An `INSTALLER_ENGINE_VERSION` constant is exported (mirroring `DECISION_POLICY_ENGINE_VERSION` in `decision-policy/engine.ts`) and stamped into the `engine_version` of emitted artifacts.
- [ ] `engines` `npm run typecheck`/`lint`/`test`/`build` all pass clean; no eslint/tsconfig rule disabled; no `any`/`unknown` casts, ts-ignore, or ts-expect-error. `protocol` still builds/tests clean. `pnpm -r build` and `pnpm --filter engines test` are green. `engines/` remains library-only with no marketplace/MCP surface (restate in a status update).

## Implementation Notes

### Technical Approach

- Mirror `engines/src/decision-policy/`'s layout and the `Engine<TInput,TOutput>` interface pattern already in its `engine.ts`. The installer's `plan` is the analogue of `evaluate` (pure); `apply` is the only async/IO method (analogue of how decision-policy isolated IO in `config-loader.ts`).
- Reuse `engines/src/schemas/protocol-schemas.ts` — add `installPlan`/`reconciliationReport` validators alongside the existing `isPolicyConfig`/`isPolicyVerdict`, using the same multi-candidate sibling-`protocol/schemas` path resolution.
- Keep `FsReadPort` and `ManagedWriter` distinct in `ports.ts`; that separation is what keeps `plan`/`detect` free of write capability.
- Files touched: `engines/src/installer/*` (new), `engines/src/index.ts` (re-export), `engines/src/schemas/protocol-schemas.ts` (add the two validators), `engines/package.json` (version bump if engines surfaces a version to consumers).

### Dependencies

- **Upstream:** DGOS-T-0051 (the `InstallPlan`/`ReconciliationReport` protocol types must exist and be generated).
- **Downstream:** DGOS-T-0053 (detector fills `detect`), DGOS-T-0054 (planner fills `plan`), DGOS-T-0055 (fully specifies `ManagedWriter`), DGOS-T-0056 (applier fills `apply`), DGOS-T-0057 (validates real artifacts + bootstrap seam).

### Risk Considerations

- **Leaking IO into `plan`/`detect`.** Mitigation: separate read/write ports; `plan` is synchronous over already-detected `RepoState`; a test/lint guard that `plan` does not import write-capable modules.
- **Re-declaring protocol types.** Mitigation: import from `protocol`; schema-validation test on assembled artifacts.
- **Package sprawl.** Mitigation: the installer is a sibling *directory* inside `engines/`, not a new package — exactly as decision-policy is.
- **Over-specifying `ManagedWriter` prematurely.** Mitigation: reserve a minimal placeholder here; DGOS-T-0055 owns the full port contract so the adapter and applier agree.

### Execution Profile

**Recommended Agent: opus + high.** Establishes the Engine seam, the pure/IO boundary, and the domain + port types four downstream tasks build on; a wrong shape compounds. Multi-file, cross-package (consumes protocol codegen), contract-defining.

## Status Updates

*To be added during implementation.*

### 2026-05-25T18:06:28Z

- Scaffolded `engines/src/installer/` with `engine.ts`, `detector.ts`, `planner.ts`, `applier.ts`, `ports.ts`, `adapter/index.ts`, and `index.ts`; `engines/src/index.ts` re-exports the installer surface.
- Added separate `FsReadPort` and `ManagedWriter` ports, in-code `RepoState` / `DesiredState` domain types, an `INSTALLER_ENGINE_VERSION` constant, and minimal stub behavior: `plan()` returns an empty-mutations `InstallPlan`; `apply()` returns skipped outcomes.
- Extended `engines/src/schemas/protocol-schemas.ts` with `InstallPlan` and `ReconciliationReport` schema helpers and added tests for schema resolution, protocol-valid artifacts, and `plan()` synchronous/pure/no-port structure.
- Bumped `engines` package version to `0.8.0` because the package root now exposes the installer API.
- Verification passed: `pnpm --filter engines typecheck`, `pnpm --filter engines lint`, `pnpm --filter engines test`, `pnpm --filter engines build`, `pnpm --filter protocol test`, `pnpm --filter protocol build`, and `pnpm -r build`. `engines/` remains library-only; no marketplace or MCP surface was added.
- 2026-05-25 (orchestrator verification): re-ran engines typecheck/lint/test/build — green (62 tests incl. the plan()-is-synchronous/pure/no-port-access assertion). Installer scaffold present (engine/detector/planner/applier/ports/adapter); separate FsReadPort (read) vs ManagedWriter (write) so write capability is unreachable from detect/plan. Consumes protocol InstallPlan/ReconciliationReport (no redeclaration). engines 0.7.0 → 0.8.0. **Reverted incidental daimyo/dist re-bundle churn** from `pnpm -r build` (protocol 0.6.0 inlining) — daimyo source unchanged; its dist refreshes only on a deliberate daimyo release per the I-0004 model. engines-only. No escape hatches. **exit_criteria_met: true.** Completed.