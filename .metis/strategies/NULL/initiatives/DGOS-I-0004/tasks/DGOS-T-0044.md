---
id: break-the-daimyo-roles-circular
level: task
title: "Break the daimyo↔roles circular dependency by moving the Roles-backed planning default into roles"
short_code: "DGOS-T-0044"
created_at: 2026-05-25T16:29:48.058778+00:00
updated_at: 2026-05-25T16:29:48.058778+00:00
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

# Break the daimyo↔roles circular dependency by moving the Roles-backed planning default into roles

## Parent Initiative

[[DGOS-I-0004]] — Platform Packaging & Installer. This task removes the cyclic
internal dependency that would otherwise make the pnpm workspace (DGOS-T-0045)
have an unorderable build graph and would keep daimyo from being a clean,
Roles-agnostic marketplace plugin (DGOS-T-0049). It directly enforces ADR-5's
"daimyo shouldn't own Roles" boundary. It can proceed in parallel with the
workspace scaffolding but MUST land before the workspace declares a topological
build order and before daimyo registration.

## Objective

Eliminate the `daimyo → roles` dependency so the only edge between the two
packages is `roles → daimyo`. Today daimyo depends on `roles` (`file:../roles`)
for exactly one reason: `daimyo/src/standalone/composition.ts` defaults the
`RolesPlanning` capability port to `RolesPlanningAdapter`
(`daimyo/src/adapters/roles-planning.ts`), which imports `PlannerRoleRunner`,
`plannerRoleDefinition`, etc. from `roles`. Move that Roles-backed default OUT of
daimyo and into the `roles` package (which already depends on daimyo, so no new
cycle is created), exposed as a roles-side composition helper. daimyo's
standalone composition keeps the `RolesPlanning` *port* and its
injection seam, but its built-in default becomes Roles-agnostic per ADR-5
("Roles (planning) — Optional"). daimyo's `package.json` drops `roles`.

## Acceptance Criteria

- [ ] `daimyo/package.json` no longer lists `roles` as a dependency. `grep -r "from \"roles\""` and `grep -rn "roles" daimyo/src` return no production import of the `roles` package from anywhere under `daimyo/src` (the `RolesPlanning` *port type* in `daimyo/src/core/ports/capabilities.ts` is daimyo-owned and stays — it must NOT import from `roles`).
- [ ] `daimyo/src/adapters/roles-planning.ts` is removed from daimyo and its export dropped from `daimyo/src/adapters/index.ts`. The equivalent adapter now lives in the `roles` package (e.g. `roles/src/daimyo/roles-planning.ts` or `roles/src/composition/`), importing daimyo's `RolesPlanning`/`PlanningRequest`/`PlanningResult`/`PlannedTask`/`DecisionRequest` types from the `daimyo` package entry (roles already deps daimyo).
- [ ] `roles` exposes a composition helper from its package entry — e.g. `createRolesPlanning(opts)` returning a daimyo `RolesPlanning`, and/or `createDaimyoWithRoles(opts)` that calls daimyo's `createStandaloneDaimyo` with `rolesPlanning` injected. The helper is exported from `roles/src/index.ts`.
- [ ] daimyo's `createStandaloneDaimyo` (`daimyo/src/standalone/composition.ts`) no longer references `RolesPlanningAdapter`. Its default for `rolesPlanning` is Roles-agnostic: either (a) a bundled no-Roles default that derives a plan from the WorkSource / goal-only built-in (ADR-5's "Roles (planning) — Optional / goal-only mode"), or (b) `rolesPlanning` becomes optional and the supervisor path that needs it is gated on its presence. Whichever is chosen is documented in a Status Update with the ADR-5 citation.
- [ ] daimyo's CLI (`daimyo/src/cli/main.ts`, which calls `createStandaloneDaimyo`) still runs without `roles`. If the CLI's standalone planning genuinely needs the Roles planner, the CLI wiring is moved to / re-exposed from `roles` (or dev-genie composition) rather than re-introducing the daimyo→roles edge; document where it landed.
- [ ] daimyo's full suite stays green: `daimyo` `npm run typecheck` / `lint` / `test` / `build` all pass with no rule disabled, no `any`/`unknown`/`ts-ignore`/`ts-expect-error` escape hatches. Any daimyo tests that exercised the in-daimyo `RolesPlanningAdapter` are either moved to `roles` (testing the relocated adapter) or replaced with a fake `RolesPlanning` in daimyo.
- [ ] `roles` stays green after receiving the adapter: `roles` `npm run typecheck` / `lint` / `test` / `build` all pass; the relocated adapter has test coverage equivalent to what daimyo had (the planner-invocation construction, the human-review decision path, the proposal→tasks mapping).
- [ ] The dependency graph is now acyclic: a documented check (e.g. `pnpm -r ls` after DGOS-T-0045, or a manual `grep` of each package's `package.json` `dependencies`) shows `daimyo` depends on neither `roles` nor any package that transitively reaches `roles`; `roles → daimyo` is the only edge.
- [ ] daimyo and roles versions are patch/minor-bumped per the repo `CLAUDE.md` rule appropriate to the change (behavior-preserving relocation → patch is acceptable; a changed public default counts as minor for daimyo). Note: daimyo is not yet a marketplace plugin, so no marketplace bundle is required here.

## Implementation Notes

### Technical Approach

- The port type `RolesPlanning` (with `PlanningRequest`, `PlanningResult`, `PlannedTask`) lives in `daimyo/src/core/ports/capabilities.ts` and is daimyo-owned — keep it there; it has no `roles` import. The adapter is the only thing that reaches into `roles`.
- Lift `daimyo/src/adapters/roles-planning.ts` verbatim into `roles` (the imports flip: `protocol` types stay as-is since roles already deps protocol; `../core/ports/capabilities.js` and `../core/domain.js` and `../decision/autonomy.js` become imports from the `daimyo` package entry — confirm daimyo re-exports `RolesPlanning`, `DecisionRequest`, and `DecisionScope` from its index; if a symbol isn't surfaced, add the re-export in daimyo as the minimal fix, like DGOS-T-0037 did for autonomy types).
- In `daimyo/src/standalone/composition.ts`, delete the `RolesPlanningAdapter` import and the `new RolesPlanningAdapter({ modelClient })` default. Decide the daimyo-side default: cleanest is to make `rolesPlanning` optional on the returned `StandaloneDaimyo` (and the supervisor consumes it only when present), since ADR-5 marks Roles-planning Optional and the WorkSource already carries the plan in the common path. Keep the injection seam (`options.rolesPlanning`) intact for dev-genie/roles to supply the real adapter.
- Repoint `daimyo/src/cli/main.ts`: if it relied on the default planner, either drop planner usage for the daimyo standalone CLI (plan comes from the WorkSource file) or move the planner-wired CLI entry into `roles` (roles already has a `bin/roles.js`). Prefer keeping daimyo's CLI plan-from-WorkSource and letting `roles` own any "plan a bare goal with the Planner Role" entrypoint.
- Move/port the relevant daimyo unit tests for the adapter into `roles`; in daimyo, where a test needed a planning capability, inject a small fake `RolesPlanning`.

### Dependencies

- **Upstream:** none — this is a self-contained refactor of existing code and is the natural first task (it unblocks the workspace's acyclic build order).
- **Downstream:** DGOS-T-0045 (workspace) benefits from an acyclic graph; DGOS-T-0049 (register daimyo as a marketplace plugin) requires daimyo to be Roles-agnostic and free of the `roles` dep so its bundle doesn't drag in roles.

### Risk Considerations

- **Hidden second import path.** The adapter might not be daimyo's only `roles` reference. Mitigation: grep `daimyo/src` for `"roles"` and for every symbol re-exported by `roles/src/index.ts` before declaring victory (acceptance criterion 1 makes this explicit).
- **daimyo entry not re-exporting a needed type.** The relocated adapter needs daimyo's `RolesPlanning`/`DecisionRequest`/`DecisionScope` from the package entry. Mitigation: add the minimal re-export in daimyo (one line + patch bump), do not deep-import daimyo internals from roles.
- **Behavior drift in the standalone default.** Making `rolesPlanning` optional could change a code path that assumed it was always present. Mitigation: gate the supervisor's planning use on presence and cover both the present and absent paths with tests; cite ADR-5's "Optional" classification.
- **Committed-dist churn.** daimyo currently commits `dist/`; rebuilding will rewrite the bundle. This is expected and is the exact churn DGOS-T-0046/T-0047 later eliminate; for now follow the existing repo rule and commit the rebuilt daimyo `dist/` + version bump.

### Execution Profile

**Recommended Agent: opus + high.** A cross-package refactor that changes a public composition default, must preserve two green suites, must not reintroduce the cycle through any path, and is load-bearing for both the workspace build order and daimyo's eventual marketplace packaging. Getting the port/adapter boundary right here prevents compounding rework in DGOS-T-0045 and DGOS-T-0049.

## Status Updates

*To be added during implementation.*
