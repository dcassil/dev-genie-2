---
id: stop-committing-shared-library
level: task
title: "Stop committing shared-library dist by removing protocol/roles/engines/protocol-proof gitignore un-ignores"
short_code: "DGOS-T-0046"
created_at: 2026-05-25T16:30:41.582060+00:00
updated_at: 2026-05-25T16:30:41.582060+00:00
parent: DGOS-I-0004
blocked_by: []
archived: false

tags:
  - "#task"
  - "#phase/todo"


exit_criteria_met: false
strategy_id: NULL
initiative_id: DGOS-I-0004
---

# Stop committing shared-library dist by removing protocol/roles/engines/protocol-proof gitignore un-ignores

## Parent Initiative

[[DGOS-I-0004]] — Platform Packaging & Installer. This task realizes design
point 2 ("shared libraries become internal-only"). It is the change that actually
stops the cross-package committed-`dist/` churn the initiative exists to fix:
once these libraries no longer commit `dist/`, a rebuild of `protocol` (or any
shared lib) stops forcing re-commits of every downstream bundle. It is small and
mechanical but depends on the workspace existing so `dist/` is reliably a pure
build artifact.

## Objective

Reclassify `protocol`, `roles`, `engines`, and `protocol-proof` as internal-only
libraries that are never distributed to the marketplace and therefore never
commit `dist/`. Remove their `dist/` un-ignore lines from the root `.gitignore`,
delete the now-untracked committed `dist/` directories from git, and confirm
that (a) the workspace can still build them from source on demand and (b) every
consumer (plugin bundles + tests) builds from source, never from a stale
committed `dist/`.

## Acceptance Criteria

- [ ] The root `.gitignore` un-ignore lines `!protocol/dist/`, `!protocol/dist/**`, `!roles/dist/`, `!roles/dist/**`, `!engines/dist/`, `!engines/dist/**` are removed (and `protocol-proof/dist/**` if such a line exists). The comment block explaining the un-ignore rule is updated to state that shared libraries are internal-only and intentionally do NOT commit `dist/`; only real marketplace plugins commit `dist/`.
- [ ] The existing committed `dist/` directories for `protocol`, `roles`, `engines`, `protocol-proof` are removed from git tracking (`git rm -r --cached <pkg>/dist`) so they revert to ignored build artifacts. After this, `git status` shows no tracked files under those four `dist/` paths.
- [ ] `git check-ignore protocol/dist/index.mjs roles/dist/index.mjs engines/dist/index.mjs protocol-proof/dist/index.mjs` reports all four as ignored.
- [ ] After a clean build (`rm -rf {protocol,roles,engines,protocol-proof}/dist && pnpm -r build`), all four `dist/` dirs are regenerated and all five package suites pass — proving nothing relied on a committed `dist/` being present in the tree.
- [ ] `katana`'s and `daimyo`'s committed `dist/` un-ignore lines are NOT touched by this task (katana stays a marketplace plugin; daimyo's `dist/` handling changes only in DGOS-T-0049). A Status Update explicitly confirms katana's `!katana/dist/**` lines remain and daimyo's lines are left for DGOS-T-0049.
- [ ] No package's `package.json` `files` array is broken by this change: `protocol`'s `files` still lists `dist`/`schemas`/`src/generated` (the change is about git tracking, not the npm publish manifest, which is moot for internal `workspace:*` deps anyway). Document that `files` is left as-is.

## Implementation Notes

### Technical Approach

- This is primarily a `.gitignore` edit + `git rm --cached`. The `.gitignore` lives at the repo root (lines 17–26 today: katana/daimyo/protocol/roles/engines un-ignores). Remove only the protocol/roles/engines (and protocol-proof if present) lines.
- After untracking, the directories remain on disk (built artifacts) but become invisible to git, matching the `dist/` global ignore.
- Verify consumers build from `workspace:*` source: under pnpm, `roles`/`engines`/`protocol-proof` import `protocol`/`daimyo` via the symlinked workspace package whose `main` points at `dist/index.mjs` — so the libraries DO need to be built locally before dependents build/test. The workspace's topological `pnpm -r build` (DGOS-T-0045) already guarantees this ordering. Confirm a cold clean build works.
- Note for DGOS-T-0047: the bundle-at-release script must build shared libs from source as part of bundling a plugin, since their `dist/` is no longer in the tree. Cross-reference that requirement here.

### Dependencies

- **Upstream:** DGOS-T-0045 (workspace) — needed so `pnpm -r build` deterministically produces the libs' `dist/` from source on demand. Can also coordinate with DGOS-T-0044 but is independent of it.
- **Downstream:** DGOS-T-0047 (bundle script must build libs from source, not assume committed dist), DGOS-T-0049 (daimyo bundle must inline freshly built lib output).

### Risk Considerations

- **A consumer silently depended on a committed lib `dist/`.** If any tooling read `protocol/dist/*` directly without building, removing the committed copy breaks it. Mitigation: the cold-build acceptance test (`rm -rf */dist && pnpm -r build && pnpm -r test`) surfaces this; fix by building in the right order rather than re-committing dist.
- **CI/marketplace assumptions.** The marketplace only ever pulls real plugins (katana, and later daimyo), never these libs, so removing their committed `dist/` cannot affect a marketplace consumer. Confirm none of the four libs has a `.claude-plugin/marketplace.json` entry (they don't — `marketplace.json` lists only dev-genie/guardrails/audit/katana).
- **Accidentally untracking katana/daimyo dist.** Mitigation: explicit acceptance criterion that katana's lines are preserved and daimyo's are deferred to DGOS-T-0049.

### Execution Profile

**Recommended Agent: opus + low.** A small, well-scoped change touching the root `.gitignore` and git tracking of four `dist/` dirs, with a clear cold-build verification. The reasoning (which lines, why) is fully specified; the risk is only in verifying no consumer depended on committed dist, which the cold-build test settles. Touches few files but the cross-package consequence makes opus+low (over sonnet) the safer call.

## Status Updates

*To be added during implementation.*
