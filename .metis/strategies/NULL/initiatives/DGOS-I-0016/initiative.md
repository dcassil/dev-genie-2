---
id: installer-reconciliation-engine
level: initiative
title: "Installer & Reconciliation Engine"
short_code: "DGOS-I-0016"
created_at: 2026-05-25T17:47:04.815335+00:00
updated_at: 2026-05-25T20:08:03.463594+00:00
parent: DGOS-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/completed"


exit_criteria_met: false
estimated_complexity: M
strategy_id: NULL
initiative_id: installer-reconciliation-engine
---

# Installer & Reconciliation Engine Initiative

## Context

This initiative was split off from **[[DGOS-I-0004]] — Platform Packaging & Installer** (decision recorded in DGOS-T-0050, 2026-05-25). I-0004 delivered the *packaging* half (pnpm workspace, libraries-not-distributed, bundle-at-release, launcher pattern, daimyo registered, installer-surface alignment) and **deliberately deferred** the net-new *deterministic installer/reconciliation Engine* as too substantial to fold into a packaging initiative.

Today the install/reconcile behavior is spread across ad-hoc, plugin-local writers: `dev-genie/RECONCILIATION.md` + its `/dev-genie-init` orchestration, and `katana install <platform>` (which writes `.mcp.json` / platform configs). These work but are not a reusable, typed, package-aware Engine: there is no single deterministic primitive that detects repo state, plans mutations, applies lock-aware managed writes, and reports skipped/blocked/conflicting outcomes uniformly across plugins and project states.

This initiative builds that Engine. Per ADR-1 it is a deterministic **Engine** (typed I/O, no model call in the core path), a sibling of the Decision Policy Engine (DGOS-I-0009) and Validation Engine, living in the `engines/` workspace package. It overlaps **[[DGOS-I-0012]] — Bootstrap & Project Readiness**, but the responsibility boundary is explicit: **Bootstrap owns workflow *sequencing*; this initiative owns deterministic *installation and reconciliation* behavior** that bootstrap invokes at the right phase.

## Goals & Non-Goals

**Goals:**
- Define the **typed Engine contract** for installation + reconciliation: given a repo state + a desired plugin/config set, produce a deterministic plan and, on apply, a structured report.
- **Package-aware reconciliation**: reason about which marketplace plugins (dev-genie/guardrails/audit/katana/daimyo) and managed config a repo should have, and what's missing/stale/conflicting.
- **Lock-aware, config-aware managed writes**: idempotent reruns; never clobber user edits to managed regions without detecting it; merge vs replace rules for managed files.
- **Explicit skipped / blocked / conflicting reporting** (a structured `ReconciliationReport`, mirroring the verdict/record discipline of the other Engines), so callers and humans see exactly what changed and why.
- **Greenfield + existing-repo paths**: the same Engine handles a fresh repo and adoption into an established one.
- **Feed bootstrap sequencing** (DGOS-I-0012): the Engine's typed outputs are consumable by the bootstrap workflow without prose parsing.
- Consolidate the *existing* dev-genie/katana idempotent-write behavior behind this contract rather than re-inventing it.

**Non-Goals:**
- Own bootstrap workflow *sequencing* or the autonomy handshake — that's DGOS-I-0012.
- Strategic planning, architecture decisions, or product framing.
- Replace Repo Intelligence (DGOS-I-0006) or Strategy classification (DGOS-I-0005); the Engine *consumes* repo facts, it doesn't derive strategy.
- Become a long-running orchestration Loop — it is a bounded deterministic primitive invoked by callers.
- Re-architect or replace katana's existing self-contained `katana install <platform>` adapters; the Engine may delegate to / wrap them, but katana stays outside the pnpm workspace.

## Architecture

### Overview

A deterministic Engine in the `engines/` package (`engines/src/installer/` alongside `engines/src/decision-policy/`), following the same shape as the Decision Policy Engine: a pure planner core + an apply step that performs the only IO (managed file writes), with typed protocol artifacts as the contract.

The flow: **detect** repo state (installed plugins, managed config, lockfiles) → **plan** the deterministic set of mutations (`InstallPlan`) → **apply** managed writes idempotently → **report** outcomes (`ReconciliationReport`: applied / skipped / blocked / conflict, per mutation). Bootstrap (DGOS-I-0012) calls `plan()` to decide and `apply()` to execute, then reads the report to sequence next steps.

### Component Diagrams

Core components:
- **State detector** — reads repo facts (which plugins present via `.claude-plugin`/marketplace presence, managed config files, lockfile state). Pure given an injected filesystem-read port.
- **Planner** — pure `plan(state, desired): InstallPlan` (no IO): the deterministic set of managed mutations (create/update/skip) with reasons.
- **Managed-write applier** — the one IO module: applies the plan with lock-aware, managed-region-aware writes; emits a `ReconciliationReport`.
- **Protocol artifacts** — new `protocol` schemas `InstallPlan` + `ReconciliationReport` (JSON Schema source-of-truth + generated TS), reusing the envelope + reason-code conventions established for the other artifacts.
- **Adapters** — wrap/delegate to existing dev-genie managed writers + `katana install <platform>` where they already do the right thing, rather than duplicating.

### Sequence Diagrams

Bootstrap determines setup path → calls Installer Engine `detect()` → `plan(state, desired)` returns an `InstallPlan` → bootstrap (or the autonomy/Decision Policy gate) approves → `apply(plan)` performs managed writes → returns a `ReconciliationReport` (applied/skipped/blocked/conflict per mutation) → bootstrap records it and sequences follow-up phases.

## Detailed Design

- **Determinism / Engine contract (ADR-1):** `plan()` is pure (same state+desired → same plan); only `apply()` touches the filesystem, isolated like the Decision Policy Engine's config loader. No model call anywhere in the core.
- **Idempotent reruns:** applying the same plan twice is a no-op on the second run; the report distinguishes "already-satisfied" (skipped) from "applied".
- **Lock/managed-region awareness:** managed files carry a managed marker / region; the applier merges or replaces only managed regions and **blocks** (does not clobber) when a user has edited a managed region out from under it — surfaced as a `conflict` in the report, never a silent overwrite.
- **Conflict taxonomy:** reuse the skipped/blocked/conflict vocabulary established in `validation-report` / `policy-verdict` so the report composes with the rest of the substrate.
- **Greenfield vs existing-repo:** the detector classifies repo state; the planner branches on it but produces the same artifact shape.
- **Reuse over rebuild:** inventory `dev-genie`'s existing reconciliation writers (`dev-genie/RECONCILIATION.md` + lib) and `katana install`; the Engine should call/wrap proven writers and add the typed plan/report + package-awareness around them, not re-implement file writing from scratch.
- **Packaging:** new code lives in the `engines/` workspace package (no committed dist — it's a library); new protocol artifacts go through the protocol package's source-of-truth + codegen + compat gate.

## Alternatives Considered

- **Leave install/reconcile as today's ad-hoc plugin-local writers.** Rejected: no uniform typed contract, no package-awareness, no consistent conflict reporting; bootstrap can't sequence on prose.
- **Build it inside DGOS-I-0004 (packaging).** Rejected (the T-0050 decision): the Engine is substantial net-new logic and overlaps ADR-1's Engine boundary; folding it into packaging would balloon that initiative. Hence this dedicated initiative.
- **Build it inside DGOS-I-0012 (Bootstrap).** Rejected: Bootstrap owns sequencing; mixing deterministic install/reconcile logic into it conflates the two responsibilities. The Engine is a reusable primitive Bootstrap consumes.
- **A long-running install Loop.** Rejected: installation is a bounded deterministic operation; a Loop is the wrong primitive (ADR-1).

## Implementation Plan

- [ ] Author the `InstallPlan` + `ReconciliationReport` protocol schemas (source-of-truth + generated TS bindings + fixtures + additive compat baseline).
- [ ] Implement the repo-state detector behind an injected filesystem-read port (pure, testable).
- [ ] Implement the pure `plan(state, desired): InstallPlan` planner with the deterministic mutation/skip rules + reason codes.
- [ ] Implement the lock-aware / managed-region-aware applier (the one IO module) emitting a `ReconciliationReport`, with idempotent-rerun + conflict-detection behavior.
- [ ] Wrap/delegate to existing dev-genie managed writers + `katana install <platform>` rather than duplicating; consolidate behind the Engine contract.
- [ ] Wire the Engine so DGOS-I-0012 (Bootstrap) can invoke `detect`/`plan`/`apply` and sequence on the typed report (integration seam, not bootstrap's own logic).
- [ ] Fixture coverage: greenfield install, existing-repo adoption, idempotent rerun (no-op), a managed-region conflict (blocked, not clobbered), and a skipped already-satisfied mutation.

## Approved design direction (autonomous, 2026-05-25)

These are the concrete, binding design calls for decomposition. They resolve the open questions in the sections above and are the contract every child task must honor.

### Engine location & package shape

The Engine lives in the `engines/` workspace package at **`engines/src/installer/`**, a peer of `engines/src/decision-policy/`. It mirrors decision-policy's proven shape exactly:

- `engines/src/installer/engine.ts` — the public Engine surface: `detect()`, the **pure** `plan(state, desired): InstallPlan`, and `apply(plan, ...): ReconciliationReport`. `plan` is synchronous and IO-free (structurally enforced: no `Promise`, no `fs` import in this file's transitive non-port path), mirroring `DecisionPolicyEngine.evaluate`'s no-IO contract.
- `engines/src/installer/detector.ts` — repo-state detection behind an **injected filesystem-read port** (analogous to how `config-loader.ts` isolates reads). Pure given the port.
- `engines/src/installer/planner.ts` — the pure mutation/skip decision rules + reason codes that build an `InstallPlan` from `(state, desired)`.
- `engines/src/installer/applier.ts` — the **one and only IO module**: takes an `InstallPlan` and performs managed writes by delegating to existing writers, emitting a `ReconciliationReport`. This is the installer's analogue of decision-policy's `config-loader.ts` IO isolation boundary.
- `engines/src/installer/adapter/` — adapters that wrap dev-genie's managed writers and katana's `PlatformAdapter`, exposing them to the applier through a single internal `ManagedWriter` port (the installer's analogue of `decision-policy/adapter/policy-decision-provider.ts`).
- `engines/src/installer/index.ts` — barrel export.

`engines/` stays **library-only** (no committed dist, no marketplace/MCP surface), per DGOS-I-0004's end-state and the existing `engines/` package config.

### Protocol artifacts

Two new schemas are added to `protocol/schemas/` as the source of truth, following the exact pattern used to add `policy-verdict`/`policy-config` (snake_case wire fields, `additionalProperties: false`, generated TS via protocol's codegen, valid+invalid fixtures, compatibility baseline entries, additive **minor** version bump):

- **`install-plan.schema.json`** — the deterministic output of `plan()`. A `plan_version` string, a `repo_classification` enum (`greenfield | existing`), and an ordered `mutations` array. Each mutation: `mutation_id` (stable, deterministic), `target` (logical target id, e.g. `claude-settings-hook`, `eslint-managed-block`, `katana:claude-code`), `target_path` (workspace-relative), `action` enum (`create | update | skip`), `write_strategy` enum (`managed_region | layered | json_merge | full_file | delegated`), `managed_marker` (string or null — the fenced sentinel that identifies the managed region), `reason_code` enum, `rationale` string, and `source_writer` (which existing writer/adapter executes it: `dev-genie:agent-config | dev-genie:eslint-layered | dev-genie:claude-settings | dev-genie:audit | katana:platform`). `engine_version` string.
- **`reconciliation-report.schema.json`** — the structured output of `apply()`. A `report_version`, `repo_classification`, `engine_version`, and an `outcomes` array; each outcome carries the originating `mutation_id` plus a `status` enum **`applied | skipped | blocked | conflict`** (the taxonomy below), a `reason_code`, a `rationale`, and optional `detail` (e.g. conflicting managed-region hash, lock source line). Plus rolled-up counts and a top-level `had_conflict` boolean so bootstrap can branch without scanning the array.

Both are **direct Engine I/O contracts, not envelope artifacts** (matching how `policy-verdict`/`policy-config` were added as standalone schemas, not `allOf` envelope payloads). The reason-code and status vocabulary deliberately **reuses the `validation-report`/`policy-verdict` discipline** so the report composes with the rest of the substrate.

### detect → plan(pure) → apply(IO) → report contract

1. **`detect(port): RepoState`** — reads (via the injected read port) which marketplace plugins are present (`.claude-plugin`/marketplace presence), which managed config files + managed regions exist (by sentinel marker), lockfile/agent-config lock declarations, and the last-run record (`.dev-genie/init.last-run.json`). Classifies `greenfield | existing`. No writes.
2. **`plan(state, desired): InstallPlan`** — **pure**. Given the detected `RepoState` and a `DesiredState` (the plugin/config set the repo should have), produces the deterministic, ordered set of mutations with `action` + `reason_code`. Same inputs → identical plan (asserted by a fixture test). Branches on `repo_classification` but emits the same artifact shape for greenfield and existing.
3. **`apply(plan, port): ReconciliationReport`** — the only IO. Walks the plan in order; for each mutation, delegates to the `source_writer` through the `ManagedWriter` port; records an outcome. **Conflict-not-clobber**: before writing a managed region, it re-reads the current region and, if the on-disk managed region was edited out from under the recorded baseline, it emits `conflict` and writes nothing for that mutation. Idempotent: a mutation whose target already matches the desired managed content yields `skipped` (`already_satisfied`), never a rewrite.
4. **report** — bootstrap reads the typed `ReconciliationReport` (never prose) to sequence follow-up phases.

### Managed-region / lock-aware write rules + status taxonomy

- **Managed-region awareness** reuses the **two proven sentinel conventions already in the codebase**: dev-genie's fenced `<!-- dev-genie:<feature>:begin/end -->` markers (`dev-genie/lib/agent-config-writer.js`) and katana's `<!-- katana:begin/end -->` markers (`katana/src/platform/_shared/markers.ts`). The applier never invents a new marker format; the `managed_marker` field on a mutation names which sentinel governs that target.
- **Lock awareness** reuses dev-genie's existing lock model (`findLockForFinding`, `liftLock` in `apply-flow.js`): a mutation whose target file is matched by an agent-config lock is emitted as `blocked` (default, never silently lifted) — matching RECONCILIATION.md's non-interactive `skip` default.
- **Status taxonomy** (on each report outcome):
  - `applied` — the managed write was performed (create or update of a managed region).
  - `skipped` — already satisfied (idempotent no-op) **or** intentionally not actionable.
  - `blocked` — a lock (or other policy gate) prevented the write; surfaced, never lifted automatically.
  - `conflict` — a user edited a managed region out from under the engine; the engine refuses to clobber and reports it. **A conflict is never a silent overwrite.**

### Reuse-vs-rebuild boundary (dev-genie + katana)

The Engine **wraps and delegates to proven writers; it does not re-implement file writing.**

- **dev-genie** (`dev-genie/lib/*.js`, ES modules): the applier's `ManagedWriter` adapter calls the existing `agent-config-writer.js` (fenced-marker writes), `eslint-layered-writer.js`, `claude-settings-merger.mjs`, `apply-flow.js` write helpers, `audit-reconcile.js`, and `plan-store.js` (last-run idempotency). These stay in `dev-genie/lib/` **as-is** (legacy plugin code must remain unaffected). The adapter imports them across the workspace boundary; no dev-genie writer is rewritten in `engines/`. If a writer's signature isn't directly callable, the smallest correct fix is a thin exported wrapper in dev-genie (with a dev-genie version bump per repo rules) — **not** duplicating its body in `engines/`.
- **katana** (`katana/src/platform/*`, stays outside the pnpm workspace): the applier delegates platform installs to katana's `PlatformAdapter` (`install.ts` → `getAdapter(platformId).install(opts)`), mapping katana's `WrittenFile.action` (`created|updated|skipped|removed`) onto the report's status taxonomy. katana is invoked as its already-shipped CLI/adapter contract; **no katana adapter is re-architected** (Non-Goal). The seam is the `katana:platform` `source_writer`.
- What the Engine **adds** on top: the typed `InstallPlan`/`ReconciliationReport`, package-awareness (which marketplace plugins a repo should have), deterministic plan ordering, the unified conflict taxonomy, and the pure `plan()`/IO-`apply()` split. The dev-genie/katana writers remain the execution muscle.

### Bootstrap (DGOS-I-0012) integration seam

This Engine is **invoked by** bootstrap; it does **not** build bootstrap sequencing. The deliverable for I-0012 is a **consumable contract only**:

- Bootstrap imports the Engine from `engines`, calls `detect()` → `plan(state, desired)` to get an `InstallPlan`, optionally routes the plan through the autonomy/Decision Policy gate, then calls `apply(plan)` and reads the `ReconciliationReport` to sequence next phases.
- I-0016 ships: the typed contract, a documented invocation example, and a stable export surface. It does **not** ship the bootstrap workflow, the autonomy handshake, or phase sequencing (those are I-0012). The integration task here proves the seam with a consumer-perspective test, nothing more.

### Honored Non-Goals

- Not a Loop — `plan`/`apply` are bounded deterministic calls, no resumable state machine.
- Not bootstrap sequencing — only the consumable Engine contract.
- Not strategy/repo-intelligence — the Engine *consumes* repo facts and a desired set; it does not derive them.
- katana stays outside the pnpm workspace and is delegated to, not absorbed.

### Workspace-suite & legacy-plugin constraints

Every implementing task must keep all five workspace suites green (`pnpm -r build`; `pnpm --filter engines test`, `protocol`, `daimyo`, `roles`, and any others) and must leave the **legacy dev-genie/katana plugins behaviorally unaffected** — the Engine adds a typed layer over them, it does not change their existing CLIs, commands, or outputs.

## Decomposition (decided 2026-05-25)

| Short code | Title | Depends on | Recommended Agent |
| --- | --- | --- | --- |
| DGOS-T-0051 | Author InstallPlan + ReconciliationReport protocol schemas | — | opus + high |
| DGOS-T-0052 | Scaffold the Installer Engine and detect/plan/apply contract | T-0051 | opus + high |
| DGOS-T-0053 | Implement the repo-state detector behind an injected read port | T-0052 | opus + medium |
| DGOS-T-0054 | Implement the pure plan() planner with mutation/skip rules | T-0052, T-0053 | opus + high |
| DGOS-T-0055 | Build the ManagedWriter port and dev-genie/katana write adapters | T-0052 | opus + medium |
| DGOS-T-0056 | Implement the lock-aware managed-write applier emitting a ReconciliationReport | T-0054, T-0055, T-0053 | opus + high |
| DGOS-T-0057 | Fixture-suite coverage and the bootstrap consumable seam | T-0056 | opus + medium |

### Critical path

**DGOS-T-0051 → DGOS-T-0052 → DGOS-T-0054 → DGOS-T-0056 → DGOS-T-0057.**
(DGOS-T-0053 feeds both T-0054 and T-0056; DGOS-T-0055 feeds T-0056 and can proceed in parallel once T-0052 lands, so it is not on the longest chain but gates T-0056.)

### Load-bearing tasks

- **DGOS-T-0051** — the typed `InstallPlan`/`ReconciliationReport` wire contracts every other task consumes; wrong field shape = cascading rework.
- **DGOS-T-0052** — the Engine seam, the pure/IO boundary, and the domain + port types four downstream tasks build on.
- **DGOS-T-0054** — the deterministic pure `plan()`, the ADR-1 guarantee and the artifact bootstrap decides on.
- **DGOS-T-0056** — the only IO module and the home of the conflict-not-clobber / idempotency / lock guarantees that justify the Engine.

### Parallelization note

After T-0052 lands, DGOS-T-0053 (detector), DGOS-T-0055 (adapters), and the early part of DGOS-T-0054 (planner) can be worked in parallel. They reconverge at DGOS-T-0056 (applier), which requires the plan (T-0054), the adapters (T-0055), and the detected baseline (T-0053).