---
id: standalone-packaging-dev-genie
level: task
title: "Standalone Packaging & Dev-Genie Integration"
short_code: "DGOS-T-0012"
created_at: 2026-05-22T17:53:59.196170+00:00
updated_at: 2026-05-22T22:08:28.128256+00:00
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

# Standalone Packaging & Dev-Genie Integration

## Parent Initiative

[[DGOS-I-0011]] — proves the ADR's central claim from [[DGOS-A-0005]]: the *same artifact* is a standalone tool AND the dev-genie Loop substrate, with no fork, via the port boundary.

## Objective

Package `daimyo` so it runs **genuinely standalone** (core + SDK transport + markdown/JSON WorkSource + bundled-prompt DecisionProvider + command-runner Validation + console notifier, needing only a model API key) **and** integrates into dev-genie (which depends on `daimyo` and injects richer adapters). Wire the dev-genie orchestration registry entry, the console notifier, and confirm the bundled versioned Tier-1 Role prompt makes the standalone decision call work. Follow the repo's plugin packaging rules (build, committed `dist/`, version bump in both manifests).

## Acceptance Criteria

## Acceptance Criteria

## Acceptance Criteria

- [ ] **Standalone composition root** assembles the default adapter set (SDK transport, markdown + JSON WorkSource, Tier-0/1/3 DecisionProvider with bundled prompt, command-runner Validation, console notifier) and runs a real end-to-end run on a markdown-checklist plan with only a model API key configured (no dev-genie present).
- [ ] The **bundled, versioned Tier-1 Role prompt** ships in the package; with it the bounded decision call works standalone; without it the deployment degrades to Tier 0 + Tier 3 only (asserted).
- [ ] **Console notifier** implements the Tier-3 notification surface (the floor); the notifier is pluggable so email/push can be added later.
- [ ] **dev-genie integration:** dev-genie's orchestration registry gains one new entry to install `daimyo`; dev-genie depends on the `daimyo` package and supplies injected adapters (katana WorkSource, real Decision Policy Engine + ADR-4 autonomy profile as DecisionProvider, stronger Role prompts, richer notifiers) **only through port adapters, never hard imports**. A test/demo shows the injected DecisionProvider or WorkSource swapped in without touching `daimyo` core.
- [ ] `daimyo` depends on sibling packages (katana/guardrails/audit) **only through port adapters**; a dependency check confirms no hard sibling imports in core.
- [ ] Packaging follows repo rules: `npm run build` produces committed `dist/`; the root `.gitignore` un-ignore line for `daimyo/dist/` exists; **version bumped in BOTH `daimyo/.claude-plugin/plugin.json` and `daimyo/package.json`**; plugin.json is valid and installable.
- [ ] A `bin/` entry / CLI exists to launch a standalone run against a WorkSource plan, mirroring katana's structure.
- [ ] README/usage doc covers both modes (standalone with API key; injected into dev-genie) so the "same artifact, two modes" claim is demonstrable.

## Implementation Notes

### Technical Approach

- The composition root is the only place adapters are wired to ports; core stays adapter-free. Standalone wiring uses the built-ins; dev-genie wiring overrides specific ports with injected adapters. This single seam is what makes the artifact dual-mode.
- Reuse katana's packaging conventions exactly (build tooling, committed `dist/`, `bin/`, plugin manifest) so the marketplace pipeline treats `daimyo` uniformly; follow the project CLAUDE.md version-bump rule on every change.
- Optional capability adapters (Repo Intelligence, Context, Roles/planning) ship as their trivial built-ins or no-ops here per the ADR table; richer dev-genie versions are injected. Confirm absence only degrades quality, not correctness.
- Call out in the end-of-task summary that consumers must `/plugin update daimyo` (or restart) to pick up the new version.

### Dependencies

- **Upstream:** all prior tasks — this assembles them. Hard prerequisites: [[DGOS-T-0004]], [[DGOS-T-0005]], [[DGOS-T-0006]], [[DGOS-T-0007]] (the default adapter set); benefits from [[DGOS-T-0008]]–[[DGOS-T-0011]] for a meaningful end-to-end run.
- **Downstream:** release/versioning cadence and public-registry-vs-repo-only distribution remain with the Platform Packaging initiative ([[DGOS-I-0004]]) per the ADR; this task does not decide them.

### Risk Considerations

- **Hidden hard dependency** on a sibling plugin would break standalone mode. Mitigation: dependency-boundary check + a standalone-only smoke test with no dev-genie on the path.
- **Version-bump omission** means the marketplace never ships the change (per repo rule). Mitigation: bump both manifests and verify before close.
- **Bundled prompt drift / missing prompt** silently degrades decisions. Mitigation: version the prompt; test the with/without-prompt degradation explicitly.

### Execution Profile

**Recommended Agent: opus + medium.** Integration and packaging work that touches manifests, the dev-genie registry, the composition root, and the dual-mode proof. It's substantive and cross-cutting but follows established packaging patterns and the seams defined upstream — medium fits.

## Status Updates

### 2026-05-22 — Standalone packaging + dev-genie integration complete (via Codex gpt-5.5)

Standalone composition root `daimyo/src/standalone/composition.ts` (`createStandaloneDaimyo`) wires the default adapter set (SDK transport, markdown+JSON WorkSource, tiered DecisionProvider with bundled versioned prompt, command-runner Validation, console notifier) into a runnable Supervisor; core stays adapter-free. Added: pluggable console Tier-3 notifier (`src/notification`), a default Anthropic structured-model client so standalone Tier-1 works with `ANTHROPIC_API_KEY`, a `bin/daimyo.js` CLI (`daimyo run --plan <plan.md|json>`), and a README covering both modes. dev-genie integration: orchestration registry entry (#4 in `dev-genie/skills/orchestration/SKILL.md`), a `package.json` dependency on the sibling `daimyo`, and an injected-adapter demo (`dev-genie/examples/daimyo-injected-adapter-demo.mjs`).

**Orchestrator verification:** daimyo typecheck/lint/test/build all green (66 passed / 5 live-skipped). Dual-mode proof: `node dev-genie/examples/daimyo-injected-adapter-demo.mjs` prints `true` — an injected adapter is swapped in via the composition root without touching daimyo core. `cross-port-boundary.test.ts` now statically rejects `katana`/`guardrails`/`audit` imports in core. CLI `--help` works. Both plugins bumped: **daimyo 0.10.0 → 0.11.0**, **dev-genie → 0.3.0** (both `package.json` + `.claude-plugin/plugin.json`). `src/core` import-pure. No escape hatches. **exit_criteria_met: true.** Completed.

**Consumer action:** run `/plugin update daimyo` and `/plugin update dev-genie` (or restart Claude Code) to pick up the new versions — and note nothing is pushed yet, so the marketplace won't see these until `main` is pushed.