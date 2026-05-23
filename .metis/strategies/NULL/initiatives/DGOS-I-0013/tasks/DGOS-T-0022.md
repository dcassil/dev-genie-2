---
id: architect-role-versioned-prompt
level: task
title: "Architect Role: Versioned Prompt & Direct Role Runner"
short_code: "DGOS-T-0022"
created_at: 2026-05-23T22:55:26.365760+00:00
updated_at: 2026-05-23T22:55:26.365760+00:00
parent: DGOS-I-0013
blocked_by: []
archived: false

tags:
  - "#task"
  - "#phase/todo"


exit_criteria_met: false
strategy_id: NULL
initiative_id: DGOS-I-0013
---

# Architect Role: Versioned Prompt & Direct Role Runner

## Objective

Build the **keystone of the proof**: a thin **`protocol-proof`** package (sibling, depends on `daimyo` + `protocol`) containing a **versioned Architect Role prompt** and a **direct Role runner** that executes the typed flow `RoleInvocation → (Architect prompt via daimyo's structured-model-call engine) → RoleResult whose output artifact is an ArchitectureImpact`. This proves typed-invocation → typed-result with a real model call, reusing the existing substrate — and **deliberately does NOT use daimyo's recursive supervisor** (the proof's explicit non-goal). The Role-runner seam built here is the minimal version of what [[DGOS-I-0010]] later generalizes.

## Parent Initiative

[[DGOS-I-0013]] — implements the approved "thin harness + direct Role runner" direction.

## Acceptance Criteria

- [ ] A new top-level **`protocol-proof`** package exists, mirroring repo conventions (TS/eslint/build/test like daimyo), depending on `protocol` (types) and `daimyo` (structured-model-call engine). `src/core`-equivalent stays free of sibling-plugin imports beyond the allowed `protocol`/`daimyo` engine surface.
- [ ] A **versioned Architect Role prompt** ships in the package (per ADR-1's versioned-prompt contract, e.g. `protocol-proof.architect-role@1.0.0`), instructing the model to turn a Story into an `ArchitectureImpact`.
- [ ] A **direct Role runner** function/class: takes a typed `RoleInvocation` (protocol type), assembles a bounded context payload, calls **daimyo's structured-model-call engine** with the versioned Architect prompt and the `ArchitectureImpact` (or `RoleResult`) JSON schema, and returns a typed **`RoleResult`** whose `output_artifacts` include a schema-valid `ArchitectureImpact` ([[DGOS-T-0021]]).
- [ ] The runner produces the canonical `RoleResult` outcomes (`produced` on success; `skipped`/`blocked`/`needs_human` where appropriate) — it does not collapse them or emit prose-only output.
- [ ] **No recursive supervisor / no AgentTransport** is used — this is a single direct model-backed Role call (proof non-goal: not the recursive loop).
- [ ] Unit-tested against a **fake/stub structured-model-call client** (no live model in unit tests): a stub returning a well-formed ArchitectureImpact yields `produced` with a schema-valid artifact; a stub returning junk yields a typed failure/`blocked`, not a crash.
- [ ] `npm run typecheck`/`lint`/`test`/`build` clean from `protocol-proof/`. No escape hatches.

## Implementation Notes

### Technical Approach

- Reuse daimyo's structured-model-call client (the `{context, request} + JSON schema → typed JSON` primitive) rather than re-implementing model I/O — import it from daimyo's engine surface. The runner is composition: build RoleInvocation → call the client with the Architect prompt + ArchitectureImpact schema → wrap as RoleResult.
- Keep the Architect prompt versioned and bundled (same discipline as daimyo's Tier-1 decision prompt) so the proof is reproducible with only a model API key.
- The runner is intentionally direct and small — it is the seam I-0010 generalizes into the full Roles layer. Name/structure it so that generalization is natural, but do not build the general Roles abstraction here.
- Live model execution is exercised in [[DGOS-T-0023]]'s dogfood run; unit tests here use a fake client so they're deterministic.

### Dependencies

- **Upstream:** [[DGOS-T-0021]] (`ArchitectureImpact` type/schema), [[DGOS-I-0001]] protocol (`RoleInvocation`/`RoleResult` types), [[DGOS-I-0011]] daimyo (structured-model-call engine).
- **Downstream:** [[DGOS-T-0023]] (harness wires the runner + validation gate + dogfood run).

### Risk Considerations

- **Scope creep into the general Roles layer / the supervisor.** Mitigation: strictly a direct single Role call; recursion and AgentTransport are out of scope (proof non-goal).
- **Non-deterministic model output** making unit tests flaky. Mitigation: unit tests use a fake structured-model-call client; live execution is deferred to the dogfood run in T-0023.
- **Re-implementing model I/O** instead of reusing daimyo's engine. Mitigation: import and reuse daimyo's structured-model-call primitive.

### Execution Profile

**Recommended Agent: opus + high.** This is the proof's keystone and a new reusable seam (the direct Role runner) that DGOS-I-0010 will generalize; getting the RoleInvocation→RoleResult→ArchitectureImpact typed flow right (and resisting scope creep into the supervisor) is load-bearing for both the proof and the Roles layer.

## Status Updates

*To be added during implementation.*
