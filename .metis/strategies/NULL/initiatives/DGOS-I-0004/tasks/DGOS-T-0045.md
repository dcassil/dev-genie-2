---
id: establish-the-root-pnpm-workspace
level: task
title: "Establish the root pnpm workspace over the five new TS packages and convert file: deps to workspace:*"
short_code: "DGOS-T-0045"
created_at: 2026-05-25T16:30:40.014765+00:00
updated_at: 2026-05-25T16:30:40.014765+00:00
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

# Establish the root pnpm workspace over the five new TS packages and convert file: deps to workspace:*

## Parent Initiative

[[DGOS-I-0004]] — Platform Packaging & Installer. **This is the load-bearing
foundation task.** It introduces the repo-root pnpm workspace that every other
packaging task in this initiative builds on: the dist-removal (DGOS-T-0046), the
bundle-at-release script (DGOS-T-0047), the launcher standardization
(DGOS-T-0048), and daimyo registration (DGOS-T-0049) all assume a working
workspace with `workspace:*` internal linking and a deterministic build order. A
wrong choice here (workspace scope, link protocol, build ordering) cascades into
every downstream task.

## Objective

Create a pnpm workspace at the repo root that covers ONLY the five new TS
packages — `protocol`, `daimyo`, `roles`, `engines`, `protocol-proof` — and
convert their internal dependencies from `file:../X` to `workspace:*`. Add a root
`package.json` and `pnpm-workspace.yaml`, install once at the root to produce a
single root lockfile + linked `node_modules`, and establish a repeatable
workspace-wide build/test/lint command set with a correct topological build
order (protocol → daimyo → {roles, engines, protocol-proof}). The legacy plugins
(`katana`, `dev-genie`, `guardrails`, `audit`) are explicitly NOT part of the
workspace and must keep working exactly as today.

## Acceptance Criteria

- [ ] A root `pnpm-workspace.yaml` lists exactly the five new packages (`protocol`, `daimyo`, `roles`, `engines`, `protocol-proof`) — by explicit path entries, NOT a broad glob that would sweep in `katana`/`dev-genie`/`guardrails`/`audit`/`katana-tests`/`legacy-guardrails-boilerplate`/`spikes`/`evidence`.
- [ ] A root `package.json` exists (private, `"name"` e.g. `dev-genie-workspace`, `"private": true`, no publishable artifact) declaring `packageManager: "pnpm@<pinned>"` and workspace-level scripts: `build` (topological `pnpm -r build`), `test` (`pnpm -r test`), `lint` (`pnpm -r lint`), `typecheck` (`pnpm -r typecheck`), plus per-package filtered invocations documented in a Status Update (e.g. `pnpm --filter daimyo... build`).
- [ ] Every internal dependency in the five packages is converted from `file:../X` to `workspace:*`: `daimyo`'s `protocol` (its `roles` dep is GONE if DGOS-T-0044 landed first; this task must NOT introduce a `workspace:*` cycle — coordinate ordering so daimyo no longer deps roles before declaring the build order). `roles`'s `protocol` + `daimyo`; `engines`'s `protocol` + `daimyo`; `protocol-proof`'s `protocol` + `daimyo`.
- [ ] `pnpm install` at the repo root succeeds and produces a single root `pnpm-lock.yaml`; internal packages are symlinked (verify `protocol` resolves to the workspace package, not a registry copy). Per-package `package-lock.json`/`node_modules` left over from npm are removed or documented as superseded.
- [ ] `pnpm -r build` builds all five in dependency order with no "cannot find module 'protocol'/'daimyo'" errors; a clean `rm -rf */dist && pnpm -r build` from cold succeeds, proving the topological order is correct (protocol first; daimyo before roles/engines/protocol-proof).
- [ ] All FIVE package suites are green after migration: for each of `protocol`, `daimyo`, `roles`, `engines`, `protocol-proof`, `test` + `typecheck` + `lint` + `build` pass with no rule disabled and no escape hatches. `protocol`'s codegen/compat/schema-validation gates still pass.
- [ ] The legacy plugins are unaffected: `katana` still builds via its own `npm run build` and is NOT linked into the pnpm workspace; `dev-genie`/`guardrails`/`audit` behave as before. A Status Update records how each legacy plugin was verified (existing suite / build / launch smoke).
- [ ] `.gitignore` continues to ignore `node_modules/`; the new root `pnpm-lock.yaml` is committed; no package's `dist/` policy is changed by THIS task (that is DGOS-T-0046's job — call out that committed-dist removal is deferred).
- [ ] A short "workspace" section is added to the repo `README.md` or a packaging doc describing: which packages are in the workspace, the `workspace:*` convention, and the build/test commands. (Do not edit `CLAUDE.md`'s rules; just document workflow.)

## Implementation Notes

### Technical Approach

- Pin pnpm via `packageManager` in the root `package.json` and (optionally) a `.npmrc` with `link-workspace-packages=true` and an explicit `node-linker` if hoisting causes native/ESM resolution surprises. Keep settings minimal and documented.
- `pnpm-workspace.yaml` should use explicit entries (`packages: ["protocol", "daimyo", "roles", "engines", "protocol-proof"]`) to guarantee the smallest blast radius — a glob like `"*"` would catch the legacy plugins and test workspaces.
- Convert deps in each `package.json`: replace each `"X": "file:../X"` with `"X": "workspace:*"`. Confirm `daimyo` has no `roles` entry (depends on DGOS-T-0044). The build order falls out of the dep graph; rely on `pnpm -r`'s topological ordering rather than a hand-maintained list, but verify it with the cold-build test.
- Decide Turborepo: NOT adopted in this task. `pnpm -r --filter` covers ordered builds and incremental filtering; Turborepo adds caching but also config + a dependency. Document in a Status Update that Turborepo was evaluated and deferred (revisit only if build times become a real pain point).
- Each package keeps its own `build`/`test`/`lint`/`typecheck` scripts unchanged; the root just orchestrates them with `-r`.
- Remove stale npm artifacts (`package-lock.json`, per-package `node_modules`) so resolution comes only from the workspace; this is also what makes `protocol`'s sibling-`schemas`-dir path resolution (used by roles/engines) keep working — verify those Ajv loaders still find `protocol/schemas` under the pnpm symlink layout, since that path resolution was written against `file:` siblings.

### Dependencies

- **Upstream:** DGOS-T-0044 (cycle break) should land first so the workspace dep graph is acyclic; if it has not, this task must at minimum not declare a build order that assumes daimyo→roles is absent. Strongly prefer T-0044 first.
- **Downstream:** DGOS-T-0046 (dist removal relies on the workspace build producing dist from source), DGOS-T-0047 (bundle script invokes `pnpm --filter <plugin>... build`), DGOS-T-0048, DGOS-T-0049.

### Risk Considerations

- **pnpm symlink layout breaks sibling-path file resolution.** `protocol`'s schemas are loaded by roles/engines via a multi-candidate sibling `protocol/schemas` path resolver (see `roles/src/schemas/protocol-schemas.ts`, ported into engines per DGOS-T-0037). Under pnpm's symlinked/virtual store the relative path from `node_modules/protocol` differs from the old `file:` layout. Mitigation: run the schema-loader tests in roles and engines as part of acceptance; if they break, resolve via the package's own `exports`/`files` (`protocol` already ships `schemas` in `files`) rather than a hardcoded `../` walk.
- **Accidental workspace over-reach.** A glob could pull in legacy plugins or `katana-tests`. Mitigation: explicit path list + an acceptance check that `pnpm -r list` shows exactly five packages.
- **ESM + better-sqlite3 hoisting.** Only `katana` uses `better-sqlite3` and katana is OUT of the workspace, so this should not bite; confirm katana's own install is untouched.
- **Lockfile churn / dual package managers.** Leaving npm `package-lock.json` files around invites drift. Mitigation: remove them and document pnpm as the single package manager for the workspace packages.

### Execution Profile

**Recommended Agent: opus + high.** This is the architectural groundwork the entire initiative depends on: workspace scope, link protocol, build-order correctness, and keeping five suites + four legacy plugins green simultaneously. A wrong abstraction here forces compounding rework across every downstream packaging task.

## Status Updates

*To be added during implementation.*
