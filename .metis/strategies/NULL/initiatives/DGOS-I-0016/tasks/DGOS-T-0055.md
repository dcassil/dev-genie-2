---
id: build-the-managedwriter-port-and
level: task
title: "Build the ManagedWriter port and dev-genie/katana write adapters"
short_code: "DGOS-T-0055"
created_at: 2026-05-25T17:51:51.380796+00:00
updated_at: 2026-05-25T19:49:54.923826+00:00
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

# Build the ManagedWriter port and dev-genie/katana write adapters

## Parent Initiative

[[DGOS-I-0016]] — Installer & Reconciliation Engine. Implements the **reuse-over-rebuild boundary**: the `ManagedWriter` port plus adapters that wrap dev-genie's existing managed writers and katana's `PlatformAdapter`. This is where the Engine delegates to proven writers instead of duplicating file-writing logic.

## Objective

Define the full `ManagedWriter` port contract in `engines/src/installer/ports.ts` and implement adapters in `engines/src/installer/adapter/` that wrap the existing writers, exposing them to the applier through that single port. The adapters **delegate, never duplicate**: dev-genie's fenced-marker writers, eslint-layered writer, `.claude/settings.json` merger, audit reconcile, and plan-store; and katana's platform install via its `PlatformAdapter`. Each adapter maps its underlying writer's outcome onto the unified status taxonomy (`applied | skipped | blocked | conflict`).

## Acceptance Criteria

## Acceptance Criteria

## Acceptance Criteria

- [ ] `ManagedWriter` port (finalizing the placeholder from DGOS-T-0052) defines the methods the applier needs per `write_strategy`/`source_writer`, e.g. `writeManagedRegion(...)`, `writeLayered(...)`, `mergeJson(...)`, `delegatePlatformInstall(...)`, each returning a normalized outcome `{ status, reason_code, rationale, detail? }` aligned with the `reconciliation-report` outcome shape.
- [ ] A `dev-genie` adapter wraps the existing ES-module writers **by import/call, not reimplementation**: `dev-genie/lib/agent-config-writer.js` (fenced `<!-- dev-genie:<feature>:begin/end -->` writes), `dev-genie/lib/eslint-layered-writer.js`, `dev-genie/lib/claude-settings-merger.mjs`, `dev-genie/lib/apply-flow.js` write helpers + lock model (`findLockForFinding`/`liftLock`), `dev-genie/lib/audit-reconcile.js`, and `dev-genie/lib/plan-store.js` (last-run idempotency). No writer body is copied into `engines/`.
- [ ] A `katana` adapter delegates platform installs via katana's already-shipped contract: `getAdapter(platformId).install(opts)` (`katana/src/cli/install.ts`, `katana/src/platform/registry.ts`, `katana/src/platform/port.ts`), passing an `InstallOptions`, and maps the returned `InstallReport.files[].action` (`created | updated | skipped | removed`) onto the report status taxonomy (`created/updated → applied`, `skipped → skipped`, `removed → applied`-with-removal-detail, plus katana `warnings` carried into `detail`). katana stays outside the pnpm workspace and is **not** re-architected.
- [ ] If a dev-genie writer's exported signature is not directly callable from the adapter, the only permitted fix is a **thin exported wrapper added in dev-genie** (with a dev-genie plugin version bump per the repo's "if you touch a plugin, bump the plugin" rule) — never duplicating the writer's logic in `engines/`. Any such wrapper is documented in a status update.
- [ ] **Conflict + lock mapping**: the dev-genie adapter surfaces a locked target as `blocked` (default, never auto-lifting the lock, matching RECONCILIATION.md's non-interactive `skip` default) and a user-edited managed region as `conflict` (the adapter exposes the current on-disk region so the applier can compare against baseline — the actual refuse-to-clobber decision lives in the applier, DGOS-T-0056).
- [ ] **dry-run support**: each adapter honors a dry-run mode (no writes) so the applier can produce a report without mutating the filesystem (katana's `InstallOptions.dryRun`; dev-genie's `dry-run` apply mode).
- [ ] Adapter unit tests with the underlying writers stubbed/temp-dir-backed prove delegation occurs and outcomes map to the taxonomy correctly. `engines` typecheck/lint/test/build green; no rule disabled; no escape hatches. `pnpm --filter engines test` + `pnpm -r build` green. dev-genie's own test suite (`dev-genie/lib/*.test.mjs`) and katana's suite stay green; legacy behavior unaffected (any added wrapper is purely additive).

## Implementation Notes

### Technical Approach

- Model the adapter subdir on `engines/src/decision-policy/adapter/policy-decision-provider.ts` — a single adapter that bridges the Engine to an external contract via a port.
- Import dev-genie writers across the workspace boundary by relative/workspace path; they are plain ES modules already (`dev-genie/lib/*.js`/`.mjs`). Import katana's adapter registry from katana's built/exported entry (katana is outside the pnpm workspace, so import via its published/bundled path as `install.ts` does).
- The port's normalized outcome must align field-for-field with the `reconciliation-report` `outcomes[]` item so the applier (DGOS-T-0056) assembles the report with no re-mapping.
- Files touched: `engines/src/installer/ports.ts` (finalize `ManagedWriter`), `engines/src/installer/adapter/dev-genie-writer.ts` (new), `engines/src/installer/adapter/katana-platform.ts` (new), `engines/src/installer/adapter/index.ts`, adapter tests; possibly a thin `dev-genie/lib/*` exported wrapper + dev-genie version bump if a signature gap exists.

### Dependencies

- **Upstream:** DGOS-T-0052 (`ManagedWriter` placeholder + ports), DGOS-T-0051 (report outcome shape the port outcome aligns to).
- **Downstream:** DGOS-T-0056 (the applier calls these adapters through the port).

### Risk Considerations

- **Accidentally reimplementing a writer.** Mitigation: the explicit delegate-not-duplicate acceptance criterion + tests asserting the underlying writer is invoked.
- **Cross-package import friction (katana outside the workspace; dev-genie ES modules).** Mitigation: import via katana's shipped entry exactly as `install.ts` does; for dev-genie, add a thin exported wrapper (with version bump) only if needed.
- **Breaking legacy dev-genie/katana behavior.** Mitigation: additive-only changes; run both legacy suites; no edits to existing writer bodies.
- **Lock auto-lifting.** Mitigation: default to `blocked`/`skip`; never call `liftLock` automatically.

### Execution Profile

**Recommended Agent: opus + medium.** Integration/adapter work across the workspace boundary following the established adapter pattern; substantive and multi-file but not net-new architecture. Bumped from low because the cross-package import + reuse-not-rebuild discipline carries real risk.

## Status Updates

*To be added during implementation.*

- 2026-05-25: Implemented the `ManagedWriter` port methods and dev-genie/katana adapters. The dev-genie adapter delegates to the existing agent-config, ESLint layered, Claude settings, audit reconcile, apply-flow dry-run/lock lookup, and plan-store modules; the katana adapter delegates through `getAdapter(platformId).install(opts)` and maps file actions onto `applied|skipped` outcomes. Added adapter unit coverage for delegation, dry-run, blocked locks, current managed-region exposure, and katana action/warning mapping. Thin dev-genie wrapper/export was needed only for `findLockForFinding` from `apply-flow.js`; bumped dev-genie `0.3.1 -> 0.3.2` in both manifests. Verification: `pnpm --filter engines typecheck`, `lint`, `test` (80 tests), `build`; `pnpm -r build`; `node --test dev-genie/lib/*.test.mjs` (54 tests); `pnpm exec vitest run` in `katana/` (302 tests) after rebuilding katana's stale local `better-sqlite3` native module for the current Node ABI.

### Orchestrator verification — 2026-05-25

Independently re-verified: engines typecheck/lint (`--max-warnings=0`)/test (80 tests)/build clean; `pnpm -r build` green. Confirmed the dev-genie change is purely additive — `findLockForFinding` was already defined at `apply-flow.js:333`; the only edit adds it to the existing `module.exports` list (no writer body copied or altered). dev-genie version bumped `0.3.1 → 0.3.2` in both `dev-genie/package.json` and `dev-genie/.claude-plugin/plugin.json` per repo rule (dev-genie has no build/dist step — launched self-contained from source). Adapters delegate, never duplicate. Incidental `daimyo/dist/` re-bundle churn reverted before commit. All acceptance criteria met → completed.

**Note for end-of-turn summary:** dev-genie bumped to 0.3.2 → consumers should `/plugin update dev-genie`.