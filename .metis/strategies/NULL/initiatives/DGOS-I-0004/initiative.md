---
id: platform-packaging-installer
level: initiative
title: "Platform Packaging & Installer"
short_code: "DGOS-I-0004"
created_at: 2026-05-21T17:42:28.277649+00:00
updated_at: 2026-05-25T17:40:14.860192+00:00
parent: DGOS-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/completed"


exit_criteria_met: false
estimated_complexity: M
strategy_id: NULL
initiative_id: platform-packaging-installer
---

# Platform Packaging & Installer Initiative

## Context

Dev-Genie already has meaningful setup and reconciliation behavior, but the target architecture needs a clearer installer story that works across packages and project states. This initiative preserves that work as a deterministic engine and aligns it with the new bootstrap flow.

It overlaps with Bootstrap & Project Readiness, but the responsibilities differ: Bootstrap owns workflow sequencing, while this initiative owns deterministic installation and reconciliation behavior.

## Goals & Non-Goals

**Goals:**
- Define deterministic install and reconciliation behavior across supported packages.
- Support idempotent setup for new and existing repositories.
- Preserve lock-aware, config-aware mutation rules.
- Make package installation and reconciliation compatible with the bootstrap workflow.

**Non-Goals:**
- Own strategic planning or architecture decisions.
- Replace Repo Intelligence or Strategy classification.
- Turn installer logic into a general orchestration loop.

## Architecture

### Overview

The installer is an Engine. It detects existing state, chooses deterministic mutations, applies managed writes, and records what changed. Bootstrap invokes it at the right phase, but the installer remains a bounded deterministic primitive.

### Sequence Diagrams

Typical flow: bootstrap determines setup path -> installer inspects repo state -> applies allowed mutations or emits required follow-up actions -> records reconciliation results for later phases.

## Detailed Design

The installer should support:

- package-aware setup and reconciliation
- lock-aware config mutation and managed file writes
- idempotent reruns
- explicit reporting of skipped, blocked, or conflicting mutations
- compatibility with greenfield setup and existing-repo adoption

It should stay out of product-level planning and out of long-running orchestration concerns.

## Alternatives Considered

- Absorb installer behavior into Bootstrap entirely: rejected because deterministic setup logic deserves its own reusable Engine boundary.
- Rebuild installer behavior from scratch later: rejected because meaningful capability already exists and should be preserved.
- Use only package-manager scripts for setup: rejected because reconciliation and managed writes need richer logic than shell scripts alone.

## Implementation Plan

- [ ] Define installer and reconciliation responsibilities as an Engine contract.
- [ ] Preserve and refine idempotent managed-write behavior.
- [ ] Specify reporting for skipped, blocked, and conflicting mutations.
- [ ] Align installer outputs with bootstrap sequencing and repo detection inputs.
- [ ] Add fixture coverage for greenfield and existing-repo reconciliation paths.

## Approved design direction (autonomous, 2026-05-25)

This initiative's scope was clarified in a packaging discussion (decision-maker
direction). The repo is a **Claude Code plugin marketplace**: plugins are pulled
from `main` and launched **self-contained with NO install step** (confirmed:
`katana/.claude-plugin/plugin.json` runs `node ${CLAUDE_PLUGIN_ROOT}/bin/katana-mcp.js`
directly; root `.claude-plugin/marketplace.json` registers dev-genie / guardrails /
audit / katana). The five new TS packages — `protocol`, `daimyo`, `roles`,
`engines`, `protocol-proof` — currently link via `file:../X` and **all commit
`dist/`**, and daimyo's committed bundle inlines its `file:` deps. The result is
cross-package `dist/` churn and drift (a rebuild of one shared lib forces a
re-commit of every downstream bundle). The approved end-state to decompose toward:

1. **pnpm workspace at repo root.** Add a root `package.json` + `pnpm-workspace.yaml`;
   convert internal deps from `file:../X` to `workspace:*`; drive build order via
   pnpm `-r`/`--filter` (Turborepo only if a concrete need justifies it).
   **Workspace scope decision (smallest blast radius):** the workspace covers ONLY
   the five new TS packages (`protocol`, `daimyo`, `roles`, `engines`,
   `protocol-proof`). The legacy plugins (`katana`, `dev-genie`, `guardrails`,
   `audit`) are NOT pulled into the workspace in this initiative — `katana` keeps
   its own self-contained install/launcher story, and the JS-only plugins
   (`dev-genie`, `guardrails`, `audit`) have no internal TS deps to share. They
   must keep working exactly as today (verified by their existing suites + a
   self-contained-launch smoke check). Pulling them in later is a possible
   follow-on, explicitly out of scope here.

2. **Shared libraries become internal-only.** `protocol`, `roles`, `engines`, and
   `protocol-proof` are NEVER marketplace-distributed — they are only bundled into
   plugins at release. **Stop committing their `dist/`**: remove their `.gitignore`
   un-ignore lines (`!protocol/dist/**`, `!roles/dist/**`, `!engines/dist/**`; and
   `protocol-proof` if/when it has one). Their `dist/` becomes a pure local/CI build
   artifact.

3. **Plugins bundle-at-release.** A release/build script bundles a marketplace
   plugin **plus its workspace deps** into a committed self-contained `dist/` and
   bumps the plugin version (per the root `CLAUDE.md` marketplace rule). Committed
   `dist/` lives ONLY for real marketplace plugins (`katana`, `daimyo` once
   registered). A plugin `dist/` re-bundle is a **deliberate release step**, never
   triggered as a side effect of an unrelated upstream library commit.

4. **Register `daimyo` as a marketplace plugin.** `daimyo` is a sibling plugin per
   ADR-5 but is NOT yet in `.claude-plugin/marketplace.json`. Add its entry when its
   packaging (workspace bundling + launcher) is release-ready. Until then it need not
   commit `dist/`.

5. **Native-dep launcher pattern.** Keep and standardize the thin-launcher-ensures-
   native-module approach (the katana "Node ABI mismatch / auto-recover launcher" in
   `katana/bin/katana-mcp.js`) ONLY for plugins that ship a native dependency (e.g.
   katana's `better-sqlite3`). Pure-TS plugins (daimyo today has no native dep — its
   deps are `@anthropic-ai/claude-agent-sdk` + `@modelcontextprotocol/sdk`, both
   pure JS) just bundle and launch the bundle directly. Document the decision rule:
   *native dep → ensure-and-recover launcher; pure TS → bundle-only launcher.*

6. **Break the `daimyo ↔ roles` circular dependency.** daimyo currently depends on
   `roles` (`file:../roles`) solely because `daimyo/src/standalone/composition.ts`
   defaults the `RolesPlanning` port to the Roles-backed `RolesPlanningAdapter`
   (`daimyo/src/adapters/roles-planning.ts`, from DGOS-T-0035), and `roles` depends on
   `daimyo`. This violates ADR-5 ("daimyo shouldn't own Roles"). **Resolution:** the
   `RolesPlanning` *port* stays in daimyo (`daimyo/src/core/ports/capabilities.ts`)
   and `createStandaloneDaimyo` keeps accepting an injected `rolesPlanning`, but the
   **default Roles-backed adapter moves OUT of daimyo into the `roles` package** (which
   already deps daimyo, so no new cycle), exposed as a `roles`-side composition helper
   (e.g. `createDaimyoWithRoles` / `createRolesPlanning`). daimyo's standalone default
   becomes Roles-agnostic (goal-only / no-planner, or plan-from-WorkSource per ADR-5's
   "Roles (planning) — Optional"). daimyo's `cli/main.ts` is repointed accordingly.
   daimyo's full suite must stay green and daimyo's `package.json` drops its `roles`
   dependency.

### Existing installer scope decision

The original initiative scope (deterministic installer / reconciliation Engine,
`dev-genie-init`, `katana install <platform>` surfaces) **remains in this
initiative** but is sequenced AFTER the packaging foundation, because the installer's
shape depends on the final packaging story (what is bundled, what is workspace-only,
how a plugin self-installs its native deps). The packaging work (points 1–6) is
genuinely the larger, more load-bearing half. **Fork flagged for a human:** the
installer/reconciliation Engine surface is large enough that it could justify its own
follow-on initiative. The decomposition below keeps a thin "align installer with the
new packaging" task here and explicitly flags the full installer-Engine build as a
candidate split — see Decomposition notes.

## Decomposition (decided 2026-05-25)

| Short code | Title | Depends on | Recommended Agent |
|------------|-------|-----------|-------------------|
| DGOS-T-0044 | Break the daimyo↔roles circular dependency by moving the Roles-backed planning default into roles | — | opus + high |
| DGOS-T-0045 | Establish the root pnpm workspace over the five new TS packages and convert `file:` deps to `workspace:*` | DGOS-T-0044 (strongly preferred first) | opus + high |
| DGOS-T-0046 | Stop committing shared-library `dist` by removing protocol/roles/engines/protocol-proof gitignore un-ignores | DGOS-T-0045 | opus + low |
| DGOS-T-0047 | Build the bundle-at-release script that produces a self-contained committed plugin `dist` from workspace deps | DGOS-T-0045, DGOS-T-0046, DGOS-T-0048 (paired) | opus + high |
| DGOS-T-0048 | Standardize and document the native-dep vs pure-TS plugin launcher pattern | DGOS-T-0045 (loose); paired with DGOS-T-0047 | opus + medium |
| DGOS-T-0049 | Register daimyo as a marketplace plugin with a self-contained bundled `dist` and launcher | DGOS-T-0044, DGOS-T-0045, DGOS-T-0047, DGOS-T-0048 | opus + medium |
| DGOS-T-0050 | Align the dev-genie installer and `katana install` surfaces with the new packaging model | DGOS-T-0045, DGOS-T-0046, DGOS-T-0049 | opus + medium |

### Critical path

`DGOS-T-0044` (cycle break) → `DGOS-T-0045` (pnpm workspace) → `DGOS-T-0047` (bundle-at-release script, co-developed with `DGOS-T-0048` launcher pattern) → `DGOS-T-0049` (register daimyo) → `DGOS-T-0050` (installer alignment).

`DGOS-T-0046` (stop committing library dist) branches off after `DGOS-T-0045` and can run in parallel with `DGOS-T-0047/0048`; it must land before `DGOS-T-0047` finalizes (the bundle script builds libs from source). `DGOS-T-0044` can begin immediately and in parallel with early `DGOS-T-0045` scaffolding, but the workspace's acyclic build order and daimyo's clean bundle both require it done.

### Load-bearing tasks

- **DGOS-T-0045 (pnpm workspace)** — the foundation; workspace scope, `workspace:*` linking, and build-order correctness gate every other packaging task.
- **DGOS-T-0044 (cycle break)** — unblocks the acyclic build graph and a Roles-agnostic daimyo bundle; enforces ADR-5.
- **DGOS-T-0047 (bundle-at-release script)** — the mechanism that makes "libs have no committed dist" coexist with "plugins launch with no install"; first consumed by daimyo registration.

### Notes / forks for a human

- **Workspace scope** is deliberately the five new TS packages only (smallest blast radius). Legacy plugins (katana/dev-genie/guardrails/audit) stay out; pulling them in later is a possible follow-on.
- **Cycle break landing spot:** the Roles-backed planning default moves from daimyo into the `roles` package (roles already deps daimyo), keeping daimyo's `RolesPlanning` *port* but making its standalone default Roles-agnostic per ADR-5.
- **Installer sequencing fork (DGOS-T-0050):** the original installer/reconciliation-Engine scope is preserved in this initiative but the heavy net-new Engine build is flagged as a candidate **follow-on initiative** under DGOS-V-0001. DGOS-T-0050 makes the explicit do-here-vs-defer call; a human may want to pre-bless creating that follow-on initiative.

## DGOS-T-0050 scoping decision (2026-05-25)

DGOS-T-0050 implements the lightweight installer alignment here: update the
existing `/dev-genie-init` registry/docs, remove old sibling `file:` package
metadata from the dev-genie plugin, keep installer language focused on real
marketplace plugins (`dev-genie`, `guardrails`, `audit`, `katana`, `daimyo`),
and align `katana install <platform>` with the bundled no-install
`bin/katana-mcp.js` launcher model.

The full deterministic installer/reconciliation Engine is deferred and should
be split into a follow-on initiative under DGOS-V-0001. That follow-on should
cover package-aware reconciliation, lock-aware managed writes, idempotent
greenfield and existing-repo fixture coverage, explicit skipped/blocked/conflict
reporting, and the typed Engine contract that maps installer outputs back into
bootstrap sequencing.

Implementation Plan mapping:

- Define installer and reconciliation responsibilities as an Engine contract:
  deferred to the follow-on Engine initiative.
- Preserve and refine idempotent managed-write behavior: existing dev-genie and
  katana idempotent writers remain in place; net-new package-aware behavior is
  deferred.
- Specify reporting for skipped, blocked, and conflicting mutations: current
  surfaces keep their existing reports; the richer conflict taxonomy is
  deferred.
- Align installer outputs with bootstrap sequencing and repo detection inputs:
  completed here for the existing docs/registry and katana install defaults.
- Add fixture coverage for greenfield and existing-repo reconciliation paths:
  deferred with the net-new Engine build; this task adds only focused CLI
  coverage for the changed katana install default.

## Outcome (2026-05-25)

**Completed — all 7 tasks (DGOS-T-0044…0050) done, verified, committed.** The packaging coupling that prompted this initiative is resolved:
- **Cycle broken** (T-0044): daimyo no longer depends on roles; the Roles-backed planning default moved into `roles`. Graph acyclic.
- **pnpm workspace** (T-0045): root workspace over the 5 new TS packages (`protocol`/`daimyo`/`roles`/`engines`/`protocol-proof`); `file:` → `workspace:*`; single root `pnpm-lock.yaml`; protocol schema loader made pnpm-symlink-safe via `resolveProtocolSchemaDir()`. Legacy plugins deliberately excluded + verified unaffected.
- **Library dist removed from git** (T-0046): protocol/roles/engines/protocol-proof no longer commit `dist/` — the cross-package churn is gone.
- **Bundle-at-release + launcher pattern** (T-0047/T-0048): `scripts/bundle-plugin.mjs` produces self-contained committed plugin bundles on a deliberate release step; `docs/plugin-launchers.md` codifies the native-dep vs pure-TS launcher rule. **Finding:** daimyo is native-dep (claude-agent-sdk ships a platform binary), so it uses the ensure-native launcher.
- **daimyo registered** (T-0049): now the 5th marketplace plugin (0.15.0), self-contained launch verified.
- **Installers aligned** (T-0050): katana `install` defaults to the bundled `node bin/...` launcher; dev-genie orchestration/docs distinguish plugins vs internal libraries; stale dev-genie `file:../daimyo` removed.

All suites green throughout (5 workspace packages + katana 302 + dev-genie 75 + guardrails/audit). Plugin versions: daimyo 0.15.0, katana 0.1.8, dev-genie 0.3.1.

**Recommended follow-on initiative (decision-maker call):** the net-new **deterministic installer/reconciliation Engine** (package-aware reconciliation, lock-aware managed writes, skipped/blocked/conflict taxonomy, greenfield vs existing-repo fixtures, the typed Engine contract feeding bootstrap sequencing) was deliberately deferred — it's substantial and belongs in its own initiative under DGOS-V-0001, not folded into packaging. Not yet created; awaiting go-ahead.