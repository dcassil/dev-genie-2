---
id: align-the-dev-genie-installer-and
level: task
title: "Align the dev-genie installer and katana install surfaces with the new packaging model"
short_code: "DGOS-T-0050"
created_at: 2026-05-25T16:30:46.622333+00:00
updated_at: 2026-05-25T17:38:51.635787+00:00
parent: DGOS-I-0004
blocked_by: []
archived: false

tags:
  - "#task"
  - "#phase/completed"


exit_criteria_met: false
strategy_id: NULL
initiative_id: DGOS-I-0004
---

# Align the dev-genie installer and katana install surfaces with the new packaging model

## Parent Initiative

[[DGOS-I-0004]] — Platform Packaging & Installer. This task honors the
initiative's ORIGINAL installer scope (the deterministic installer /
reconciliation Engine, `dev-genie-init`, and `katana install <platform>`
surfaces) and reconciles it with the new packaging end-state established by
DGOS-T-0044 through DGOS-T-0049. It is sequenced last because the installer's
correct behavior depends on the final packaging story (what is bundled, what is
workspace-only, how plugins self-install native deps, which plugins are
registered). **Fork flag:** the full installer/reconciliation Engine build is
large enough to warrant its own follow-on initiative; this task does the
alignment + scoping decision and explicitly defers the large Engine build.

## Objective

Make the existing install surfaces correct and coherent under the new packaging
model, and decide-and-document the boundary between "alignment done here" and
"installer-Engine build deferred to a follow-on initiative." Concretely: ensure
`dev-genie`'s `/dev-genie-init` orchestration registry and `katana install
<platform>` reflect the now-self-contained, no-install marketplace plugins
(including newly-registered daimyo), that nothing in the install path assumes a
removed committed library `dist/` or a pre-workspace `file:` layout, and that the
deterministic installer/reconciliation behavior described in the initiative's
Architecture section is captured as a scoped contract (built here only if small;
otherwise specified and forwarded to a new initiative).

## Acceptance Criteria

## Acceptance Criteria

## Acceptance Criteria

- [ ] An explicit scoping decision is recorded (Status Update + a note appended to the initiative or a new ADR/initiative stub): which installer/reconciliation behavior is implemented in THIS task vs. deferred to a dedicated follow-on initiative. The criterion for "do it here" is: changes that are alignment/consistency fixes to existing surfaces; the criterion for "defer" is: net-new deterministic Engine logic (package-aware reconciliation, lock-aware managed writes, conflict reporting) beyond what already exists.
- [ ] `dev-genie`'s orchestration registry (the data that `/dev-genie-init` uses to install guardrails + audit, and now optionally daimyo) is reviewed and updated so each managed plugin is described consistently with the marketplace model: pulled from `main`, launched with no install step, version-bumped at release. If daimyo should be installable via dev-genie, it is added to the registry; if not, that exclusion is documented.
- [ ] No install/setup code path references a removed committed library `dist/` (`protocol`/`roles`/`engines`/`protocol-proof`) or assumes the old `file:` sibling layout. A grep/review confirms the installer reasons only about real marketplace plugins.
- [ ] `katana install <platform>` is reviewed against the new model (katana stays outside the pnpm workspace with its own self-contained build): confirm the command still installs katana into Claude Code / Cursor / Codex surfaces correctly and that its self-contained launch is unaffected by the workspace changes. Any drift is fixed.
- [ ] The deterministic installer/reconciliation contract from the initiative's Architecture/Detailed Design (idempotent reruns; lock-aware config mutation; skipped/blocked/conflicting mutation reporting; greenfield vs existing-repo paths) is either (a) implemented with fixture coverage if it is a small delta over existing behavior, or (b) written up as a precise specification handed to a newly-created follow-on initiative, with the initiative's Implementation Plan checkboxes mapped to that decision. No checkbox is left silently unaddressed.
- [ ] Whatever is implemented here ships green: the touched dev-genie / katana surfaces keep their existing tests passing, with new fixture coverage for any reconciliation path implemented in-scope, and no rule disabled / no escape hatch.
- [ ] If a follow-on initiative is created for the large installer-Engine build, its short code is recorded here and the human is told (in the end-of-turn summary) that the split occurred; if NOT created, the rationale for keeping it all here is recorded.

## Implementation Notes

### Technical Approach

- Start by reading dev-genie's install/orchestration code (`dev-genie/lib`, `dev-genie/scripts`, `dev-genie/commands`, `dev-genie/RECONCILIATION.md`) and katana's `katana install` CLI to inventory the current installer behavior, then map each piece to the new packaging model.
- The alignment work is mostly: (1) ensure registry/metadata reflects self-contained no-install plugins, (2) purge any assumption about committed library dist or `file:` layout, (3) confirm katana's installer still works. These are consistency fixes.
- The net-new deterministic Engine (package-aware reconciliation, lock-aware managed writes, conflict classes) is substantial and overlaps the Engine/Role/Loop architecture (ADR-1) — strongly consider specifying it and spawning a follow-on initiative rather than building it under a packaging initiative. Make that call explicitly and record it.
- If creating a follow-on initiative, create it as a sibling initiative under the same vision (DGOS-V-0001) — do NOT expand this initiative's scope unboundedly. (Creating that initiative is a follow-up action, not part of this decomposition pass.)

### Dependencies

- **Upstream:** DGOS-T-0045 (workspace), DGOS-T-0046 (dist removal — installer must not reference removed dist), DGOS-T-0049 (daimyo registered — installer registry may include it). Effectively the last task in the chain.
- **Downstream:** a potential follow-on installer-Engine initiative (created here if the scoping decision warrants it).

### Risk Considerations

- **Scope explosion.** The installer-Engine is genuinely large; building it inside a packaging initiative would balloon this initiative. Mitigation: the explicit scoping decision + deferral-to-follow-on-initiative acceptance criterion is the primary control.
- **Silent dependency on old layout.** An installer path might assume `file:` siblings or committed lib dist. Mitigation: the grep/review acceptance criterion.
- **katana installer regression.** The workspace changes shouldn't touch katana, but verify. Mitigation: explicit katana-install acceptance check.
- **Leaving initiative checkboxes unaddressed.** The initiative's Implementation Plan has five installer checkboxes. Mitigation: the acceptance criterion that each is mapped to either in-scope implementation or the follow-on spec.

### Execution Profile

**Recommended Agent: opus + medium.** Requires good cross-surface reasoning (dev-genie installer + katana install + the new packaging invariants) and a genuine scoping/architecture judgment about what to defer, but it is bounded by the patterns the prior tasks establish and is explicitly allowed to defer the heavy Engine build. Upgrade to opus + high only if the in-scope decision turns into building the reconciliation Engine here.

## Status Updates

- 2026-05-25: Explicit do-here-vs-defer decision: implement lightweight
  alignment in this task only. In scope: registry/docs consistency for
  marketplace plugins vs internal libraries, removal of old dev-genie
  `file:../daimyo` package metadata, and `katana install <platform>` defaulting
  to the self-contained bundled launcher. Deferred/recommended follow-on:
  net-new deterministic installer/reconciliation Engine covering
  package-aware reconciliation, lock-aware managed writes, conflict/skipped/
  blocked reporting, and greenfield/existing-repo fixture matrices.
- 2026-05-25: Validation completed. Marketplace JSON parses with five plugins
  (`dev-genie`, `guardrails`, `audit`, `katana`, `daimyo`). Focused grep found
  no `file:../daimyo` references in dev-genie install metadata and no old
  `npx katana-mcp` default in `katana install`; remaining `npx` references are
  explicit test fixture overrides. `katana install claude-code` smoke-writes
  `.mcp.json` with `command: "node"` and args pointing to
  `katana/bin/katana-mcp.js`.
- 2026-05-25 (orchestrator verification): marketplace 5 plugins valid; dev-genie 0.3.1 with deps now `{}` (stale `file:../daimyo` removed, demo updated to import the daimyo bundle); katana 0.1.8 (install defaults to `node bin/katana-mcp.js`). All five workspace suites green (protocol 76, daimyo 68/5, protocol-proof 7, engines 58, roles 34); katana 302 + build green (after local better-sqlite3 ABI rebuild); dev-genie 75 node tests. Both touched plugins version-bumped per repo rule. **Lightweight alignment done here; the deterministic installer/reconciliation Engine is recommended as a follow-on initiative (surfaced to the decision-maker).** No escape hatches. **exit_criteria_met: true.** Completed.