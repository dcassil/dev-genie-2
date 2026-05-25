---
id: implement-the-pure-plan-planner
level: task
title: "Implement the pure plan() planner with mutation/skip rules"
short_code: "DGOS-T-0054"
created_at: 2026-05-25T17:51:51.208451+00:00
updated_at: 2026-05-25T17:51:51.208451+00:00
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

# Implement the pure plan() planner with mutation/skip rules

## Parent Initiative

[[DGOS-I-0016]] — Installer & Reconciliation Engine. Implements the deterministic heart of the Engine: the pure `plan(state, desired): InstallPlan`. This is the ADR-1 determinism guarantee in code and the artifact bootstrap consumes to decide. On the critical path; highest tier.

## Objective

Implement `engines/src/installer/planner.ts`: a **pure, IO-free** function `plan(state: RepoState, desired: DesiredState): InstallPlan` that diffs the detected repo state against the desired plugin/config set and emits the deterministic, stably-ordered set of mutations (`create | update | skip`) with `reason_code`, `rationale`, `write_strategy`, `managed_marker`, and `source_writer` per mutation. Package-aware: it reasons about which marketplace plugins and managed config a repo should have versus what is present/stale/conflicting/locked. Same inputs always produce an identical `InstallPlan`.

## Acceptance Criteria

- [ ] `planner.ts` exports `plan(state: RepoState, desired: DesiredState): InstallPlan` — **synchronous, no `Promise`, no filesystem import** (mirrors `DecisionPolicyEngine.evaluate`'s purity); `engine.ts`'s `plan` delegates to it.
- [ ] Mutation derivation rules: a desired target absent in `state` → `action: create`, `reason_code: missing`; present but not matching desired managed content → `action: update`, `reason_code: stale`; present and already matching → `action: skip`, `reason_code: already_satisfied`; target file locked → still emitted (so the applier can report `blocked`) with `reason_code: locked`; a managed region detected as user-edited-from-baseline → emitted with `reason_code: conflicting` and `action: update` (the applier enforces conflict-not-clobber at write time). Each mutation carries the correct `write_strategy` and `source_writer` for its target.
- [ ] **Determinism**: mutation ordering is stable and content-derived (e.g. sorted by a fixed target precedence, then `mutation_id`), and `mutation_id` is a deterministic function of the target (no timestamps, no RNG, no `Date`). A test asserts `plan(state, desired)` deep-equals itself across repeated calls and across two independently-constructed identical inputs.
- [ ] **Greenfield vs existing parity**: the planner branches on `state.repo_classification` (greenfield orders plugin install per the RECONCILIATION.md greenfield ordering — guardrails + audit first, then optional katana/daimyo; existing-repo produces reconciliation mutations) but emits the **same `InstallPlan` artifact shape** for both. Tests cover a greenfield input and an existing-repo input.
- [ ] **Idempotency at plan level**: given a `RepoState` that already satisfies `desired` (e.g. reflecting a prior applied run), `plan` emits only `skip` mutations (`already_satisfied`) — no `create`/`update`. Test included.
- [ ] The returned `InstallPlan` validates against `protocol`'s `install-plan` schema via the `engines` Ajv validator (DGOS-T-0052); a test validates a produced plan.
- [ ] No model call, no network, no IO anywhere in the planner. `engines` typecheck/lint/test/build green; no rule disabled; no escape hatches. `pnpm --filter engines test` + `pnpm -r build` green.

## Implementation Notes

### Technical Approach

- Mirror the pure-function discipline of `decision-policy/classifier.ts` + `conflict.ts` (deterministic, input-only). Keep all branching data-driven off `RepoState`/`DesiredState`.
- The greenfield ordering and the existing-repo finding classifications (`present`/`weaker`/`conflicting`/`missing`) are already specified in `dev-genie/RECONCILIATION.md`; map those classifications onto the plan `reason_code` set from DGOS-T-0051 rather than inventing new ones.
- `write_strategy`/`source_writer` per target is a fixed lookup table (e.g. eslint → `layered` / `dev-genie:eslint-layered`; `.claude/settings.json` hook → `json_merge` / `dev-genie:claude-settings`; agent config → `managed_region` / `dev-genie:agent-config`; platform install → `delegated` / `katana:platform`).
- Files touched: `engines/src/installer/planner.ts` (fill stub), `engines/src/installer/engine.ts` (wire delegation), planner tests.

### Dependencies

- **Upstream:** DGOS-T-0052 (engine + `RepoState`/`DesiredState`), DGOS-T-0053 (the `RepoState` the planner reads), DGOS-T-0051 (`InstallPlan` type + reason-code enum).
- **Downstream:** DGOS-T-0056 (applier walks this plan), DGOS-T-0057 (fixture scenarios assert plan output).

### Risk Considerations

- **Non-determinism creeping in** (map iteration order, timestamps in `mutation_id`). Mitigation: content-derived stable IDs + explicit sort; the deep-equal-across-calls test.
- **Reinventing finding classification.** Mitigation: reuse RECONCILIATION.md's status taxonomy mapping.
- **Coupling plan to write side-effects.** Mitigation: planner emits intent only; the applier owns conflict-not-clobber enforcement. The planner never reads or writes the filesystem.

### Execution Profile

**Recommended Agent: opus + high.** The deterministic core and the ADR-1 purity guarantee; the artifact bootstrap decides on. Load-bearing; subtle determinism requirements; a wrong rule shape forces applier rework.

## Status Updates

*To be added during implementation.*
