---
id: implement-the-repo-state-detector
level: task
title: "Implement the repo-state detector behind an injected read port"
short_code: "DGOS-T-0053"
created_at: 2026-05-25T17:51:50.995538+00:00
updated_at: 2026-05-25T19:26:59.391363+00:00
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

# Implement the repo-state detector behind an injected read port

## Parent Initiative

[[DGOS-I-0016]] — Installer & Reconciliation Engine. Implements `detect()`, the first stage of the detect → plan → apply contract. It produces the `RepoState` that the pure planner (DGOS-T-0054) consumes, so its field coverage determines what the planner can reason about.

## Objective

Implement the repo-state detector in `engines/src/installer/detector.ts` as a function that, given an injected read-only `FsReadPort` and a target workspace path, returns a fully-populated `RepoState`. It detects: which marketplace plugins are present, which managed config files + managed regions exist (by sentinel marker), agent-config lock declarations, and the last-run record — then classifies the repo as `greenfield | existing`. All filesystem access goes through the injected `FsReadPort`; the detector performs **no writes** and is deterministic given the port's responses.

## Acceptance Criteria

## Acceptance Criteria

## Acceptance Criteria

- [ ] `detector.ts` exports `detect(port: FsReadPort, opts: { workspaceRoot: string; desired?: DesiredState }): Promise<RepoState>` (or sync if the port is sync) that uses **only** the read port — no direct `node:fs`, no write capability reachable.
- [ ] Plugin presence detection: detects which of the marketplace plugins (dev-genie / guardrails / audit / katana / daimyo) the repo already has, via the same signals dev-genie's existing detection uses (`.claude-plugin` / marketplace presence, managed config files). The detector reuses the *signals* described in `dev-genie/RECONCILIATION.md` (detection report shape) rather than inventing new ones.
- [ ] Managed-region detection: for each known managed target, records whether its sentinel-marked region is present, using the two existing marker conventions — dev-genie's `<!-- dev-genie:<feature>:begin/end -->` (`dev-genie/lib/agent-config-writer.js`) and katana's `<!-- katana:begin/end -->` (`katana/src/platform/_shared/markers.ts`). The detector reads the region bounds/content needed for later drift detection but does not interpret write strategy.
- [ ] Lock detection: surfaces agent-config lock declarations in the shape dev-genie already models (`agentConfigs[].locks: [{ pattern, reason, sourceLine }]` per RECONCILIATION.md), so the planner/applier can mark locked targets `blocked`.
- [ ] Last-run detection: reads `.dev-genie/init.last-run.json` (if present) via the port and includes its reference + `repoFingerprint` in `RepoState` for idempotency reasoning (per RECONCILIATION.md's idempotent-rerun section).
- [ ] Classification: sets `RepoState.repo_classification` to `greenfield` when the greenfield signals hold (no `package.json`, no `eslint.config.*`, no `tsconfig.json`, no package scripts, no git hooks — the exact greenfield definition in RECONCILIATION.md) and `existing` otherwise.
- [ ] **Determinism + no-IO-leak tests**: given a stubbed in-memory `FsReadPort`, `detect` returns identical `RepoState` for identical port responses; a test feeds a greenfield stub and an existing-repo stub and asserts the classification + detected fields. A test/inspection confirms the detector imports no write-capable module.
- [ ] `engines` typecheck/lint/test/build green; no rule disabled; no escape hatches. `pnpm --filter engines test` and `pnpm -r build` green. Legacy dev-genie/katana plugins unmodified (detector only *reads* their conventions).

## Implementation Notes

### Technical Approach

- Consume the `FsReadPort` from `ports.ts` (DGOS-T-0052). Provide a default adapter that backs the port with `node:fs` read calls (`existsSync`/`readFileSync`/`readdirSync`) — mirroring how `decision-policy/config-loader.ts` isolates its reads — but the detector itself depends only on the port interface so it is testable with an in-memory stub.
- Reuse the detection vocabulary already documented in `dev-genie/RECONCILIATION.md` and emitted by `dev-genie/skills/existing-config-detection/SKILL.md`; do not re-derive a new detection contract.
- Files touched: `engines/src/installer/detector.ts` (fill stub), `engines/src/installer/ports.ts` (a default node-fs read adapter, if not added in T-0052), `engines/src/installer/*.test.ts` (new tests).

### Dependencies

- **Upstream:** DGOS-T-0052 (`FsReadPort`, `RepoState`, `DesiredState`, engine skeleton).
- **Downstream:** DGOS-T-0054 (planner consumes `RepoState`); DGOS-T-0056 (applier uses detected managed-region content for drift detection); DGOS-T-0057 (greenfield/existing fixtures).

### Risk Considerations

- **Detection drift from dev-genie's real detection.** Mitigation: mirror RECONCILIATION.md's report shape and reuse its signals; do not fork a second detection model.
- **Hidden IO via a convenience helper.** Mitigation: all reads through the injected port; no-write-import test.
- **Marker-format coupling.** Mitigation: read both existing marker conventions; never invent a third.

### Execution Profile

**Recommended Agent: opus + medium.** Substantive, touches multiple files and must faithfully mirror an existing detection contract across the workspace boundary, but follows the established port-isolation pattern rather than defining new architecture.

## Status Updates

### 2026-05-25

- Implemented `detect()` behind `FsReadPort`, including dev-genie-shaped detection report data, plugin signals, managed-region bounds/content, lock declarations, last-run fingerprint, and greenfield/existing classification.
- Added read-only `NodeFsReadPort` adapter and in-memory detector coverage for deterministic greenfield/existing detection plus no-write-import inspection.
- Verified `pnpm --filter engines typecheck`, `pnpm --filter engines lint`, `pnpm --filter engines test`, `pnpm --filter engines build`, and `pnpm -r build`.

### Orchestrator verification — 2026-05-25

Independently re-verified: engines typecheck/lint (`--max-warnings=0`)/test (10 files, 69 tests)/build all clean; `pnpm -r build` green across all 5 packages. Confirmed `detector.ts` imports no `node:fs`/`fs` (all FS via injected `FsReadPort`; `NodeFsReadPort` default adapter in `ports.ts`). Legacy `dev-genie/`/`katana/` sources unmodified. Incidental `daimyo/dist/` re-bundle churn reverted before commit. All acceptance criteria met → completed.