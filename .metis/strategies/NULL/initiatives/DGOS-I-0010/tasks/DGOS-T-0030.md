---
id: add-the-roleregistry-and-the
level: task
title: "Add the RoleRegistry and the generalized context-profile assembler"
short_code: "DGOS-T-0030"
created_at: 2026-05-23T23:39:53.298041+00:00
updated_at: 2026-05-23T23:39:53.298041+00:00
parent: DGOS-I-0010
blocked_by: []
archived: false

tags:
  - "#task"
  - "#phase/todo"


exit_criteria_met: false
strategy_id: NULL
initiative_id: DGOS-I-0010
---

# Add the RoleRegistry and the generalized context-profile assembler

## Parent Initiative

[[DGOS-I-0010]] — Role Contracts & Autonomy. This task turns the single-Role runner from [[DGOS-T-0029]] into a true multi-Role layer: a `RoleRegistry` that resolves `role_id`/`role_version` → `RoleDefinition`, and a context-profile assembler that generalizes protocol-proof's `architectModelInput` so each Role gets a bounded, Role-appropriate `StructuredModelInput`. This is the open-for-extension seam the deferred Roles will plug into.

## Objective

Add a `RoleRegistry` to `roles/` that maps `role_id` (and optionally `role_version`) to the registered `RoleDefinition`, and a `ContextProfileAssembler` that builds the bounded `{context, rules, request}` `StructuredModelInput` for any Role from its `RoleInvocation` plus injected role context. Refactor `RoleRunner` so it resolves the Role through the registry and assembles input through the assembler, instead of receiving a single hard-wired `RoleDefinition`. After this task, "add a Role" is a registration plus a context-profile declaration — no runner edits.

## Acceptance Criteria

- [ ] A `RoleRegistry` exists in `roles/src/registry/role-registry.ts` with `register(definition)`, `resolve(role_id, role_version?)`, and `list()`; resolving an unknown `role_id` or an unsupported `role_version` returns a typed miss (not a throw) so the runner can emit a `skipped` `RoleResult` with the existing skip-reason codes (`role:not_registered`, `role:unsupported_version`).
- [ ] A `ContextProfileAssembler` exists that, given a `RoleInvocation`, a `RoleDefinition`'s declared context profile, and the injected role context, produces the `StructuredModelInput` (`context`/`rules`/`request`) — generalizing `protocol-proof`'s `architectModelInput`/`invocationContext`/`traceRequestJson`. The shared invocation framing (invocation id, role id/version, input/context/policy refs, timeout, allowed engines/tools, trace, expected outputs) is assembled once for all Roles; Role-specific framing (e.g. Architect's `story`, `output_schema`) comes from a per-Role profile hook.
- [ ] `RoleDefinition` (from [[DGOS-T-0029]]) is extended with a `context_profile` declaration describing what the Role needs in `context`/`rules`/`request` (e.g. which named context-bundle keys, which rule codes/non-goals, which request fields). The Architect's existing framing (non-goals `no_recursive_supervisor`/`no_agent_transport`/`no_tool_use`/`no_filesystem_or_network_access`, `output_schema`, `story`) is expressed through this profile, not hard-coded in the runner.
- [ ] `RoleRunner.run(invocation, roleContext)` now: resolves the Role via the registry → on miss emits `skipped`; otherwise assembles input via the assembler and proceeds exactly as in [[DGOS-T-0029]]. The Architect parity tests from [[DGOS-T-0029]] still pass unchanged.
- [ ] Tests cover: registry resolve hit/miss/version-miss; assembler produces an `StructuredModelInput` for the Architect that is structurally identical to the pre-refactor runner's (equality against a captured fixture); a second fake Role definition registered alongside Architect is resolvable and runnable through the same runner with no runner code change.
- [ ] `roles/` `npm run typecheck`/`lint`/`test`/`build` clean; no rule disabled; no escape hatches; `roles` version bumped (minor) per repo rules.

## Implementation Notes

### Technical Approach

- Keep the registry a plain in-memory map keyed by `role_id`, with a per-id version table; `resolve` returns `{ kind: "hit", definition } | { kind: "miss", reason }` where `reason` carries the skip-reason code so the runner stays declarative.
- Lift the generic half of `protocol-proof`'s `architectModelInput` (the `invocation`/`bounded_context`/`expected_output_artifacts`/`request` framing in `invocationContext`, `traceRequestJson`, `artifactReferenceJson`) into the assembler. Express the Architect-specific half (`rules.role_contract`, `rules.non_goals`, `request.story`, `request.output_schema`) as the Architect's `context_profile`.
- The assembler must remain pure (no IO); it takes already-loaded `roleContext` (story/context JSON) — context *loading* is a daimyo/Loop concern (ADR-1: Roles receive a bounded ContextBundle, they do not fetch it).
- Do not break the [[DGOS-T-0029]] parity tests; treat them as the regression gate for the refactor.

### Dependencies

- **Upstream:** [[DGOS-T-0029]] (the package, `RoleDefinition`, and `RoleRunner` must exist).
- **Downstream:** [[DGOS-T-0032]] (Planner) and [[DGOS-T-0033]] (Quality Governor) register through this registry and declare context profiles; [[DGOS-T-0034]] (CLI) and [[DGOS-T-0035]] (daimyo adapter) resolve Roles through the registry; [[DGOS-T-0036]] proves a new Role registers without runner edits.

### Risk Considerations

- **Over-abstracting the context profile before the second/third Role's needs are known.** Mitigation: keep the profile minimal — only the fields the Architect already uses plus a generic "named context keys + rule codes + request fields" shape; let [[DGOS-T-0032]]/[[DGOS-T-0033]] push real variance and adjust if needed (they are the proof the abstraction is right).
- **Silent behavioral drift in the Architect input during the lift.** Mitigation: structural-equality test of the assembled `StructuredModelInput` against a captured fixture of the pre-refactor Architect input.

### Execution Profile

**Recommended Agent: opus + high.** The registry + context-profile abstraction is the extension seam every later Role and consumer depends on; getting the `RoleDefinition.context_profile` shape wrong forces rework in T-0032/T-0033/T-0036. Cross-cutting and load-bearing, with a non-trivial pure-refactor of the proven Architect framing.

## Status Updates

*To be added during implementation.*
