---
id: policydecisionprovider-adapter
level: task
title: "PolicyDecisionProvider adapter: inject the Engine into daimyo's DecisionProvider port"
short_code: "DGOS-T-0043"
created_at: 2026-05-24T19:02:51.631028+00:00
updated_at: 2026-05-24T19:02:51.631028+00:00
parent: DGOS-I-0009
blocked_by: []
archived: false

tags:
  - "#task"
  - "#phase/todo"


exit_criteria_met: false
strategy_id: NULL
initiative_id: DGOS-I-0009
---

# PolicyDecisionProvider adapter: inject the Engine into daimyo's DecisionProvider port

## Parent Initiative

[[DGOS-I-0009]] — Decision Policy & Governance. This is the **integration capstone**: the dev-genie `PolicyDecisionProvider` that injects the Decision Policy Engine into daimyo through the existing `DecisionProvider` port, superseding daimyo's trivial Tier-0 *without* reimplementing tier orchestration. It is the task that makes "enriches daimyo rather than duplicates it" real and observable, satisfying ADR-5's "dev-genie supplies richer adapters … the real Decision Policy Engine + autonomy profile as DecisionProvider."

## Objective

Implement `PolicyDecisionProvider` in `engines/src/decision-policy/adapter/` that implements daimyo's `DecisionProvider` port (`decidePermission`/`decideRouting` → `Promise<DecisionRecord>`, `daimyo/src/core/ports/decision-provider.ts`). Its Tier-0 calls `DecisionPolicyEngine.evaluate`; it maps the resulting `PolicyVerdict` into a daimyo `DecisionVerdict` + tier-0 `DecisionRecord` (via daimyo's `makeDecisionRecord`) and persists it through the same `ExecutionStore.recordDecision` path. On Engine `route`/fall-through for routing decisions it **delegates to a wrapped `TieredDecisionProvider`** so daimyo retains ownership of Tier 1 (bounded model call), Tier 2 (read-only investigation), Tier 3 (human parking + notifier), and `DecisionRecord` persistence. The adapter is the only module in `engines/` that imports daimyo's port; the Engine core stays daimyo-independent.

## Acceptance Criteria

- [ ] `PolicyDecisionProvider implements DecisionProvider` and is constructed with `{ engine: DecisionPolicyEngine, config: PolicyConfig, inner: TieredDecisionProvider, executionStore, clock? }`. It lives in `engines/src/decision-policy/adapter/` and is the only `engines/` file importing from daimyo's `core/ports`/decision modules.
- [ ] **Permission surface (`decidePermission`)**: builds a `PolicyDecisionInput` from the `PermissionDecisionRequest`, calls `engine.evaluate`, and maps `PolicyVerdict.outcome` → daimyo `DecisionVerdict` (`permit` → `{type:"access", suggested_choice:"allow", confidence/risk from verdict}`; `stop`/`review` → a Tier-3 human verdict; explicit-deny → `{suggested_choice:"deny"}`), wraps it in a tier-0 (or tier-3) `DecisionRecord` via `makeDecisionRecord`, persists via `executionStore.recordDecision`, parks awaiting-human + notifies on Tier 3 exactly as `TieredDecisionProvider.resolve` does. A test asserts the produced `DecisionRecord` validates against `protocol/schemas/decision-record.schema.json`.
- [ ] **Routing surface (`decideRouting`)**: builds the input (including classified domain/scope + sibling ownership for conflict — sourced per DGOS-T-0040's open question), calls `engine.evaluate`; if the Engine **settles** the decision (`permit`, or `stop`→human) it produces and persists the tier-0/tier-3 `DecisionRecord` itself; if the Engine returns `route`/fall-through (no deterministic settlement) it **delegates to `inner.decideRouting`** so daimyo runs Tier 1/2/3, and returns daimyo's `DecisionRecord` unchanged. dev-genie writes **no** Tier 1/2/3 logic.
- [ ] The adapter passes Engine-classified `domain`/`scope`/`risk` into the request context it hands to `inner` so daimyo's own `decisionPolicyContext`/`evaluateAutonomyThreshold` and the Tier-1 prompt see consistent, Engine-classified inputs (closing the loop on "enrich, not duplicate").
- [ ] A **composition example** is provided (a function or test) showing the provider injected into daimyo via `createStandaloneDaimyo({ decisionProvider })` or the `Supervisor`'s `decisionProvider` slot (`daimyo/src/standalone/composition.ts`), proving the existing injection seam is used with no daimyo source change. If a daimyo source change *is* required (e.g. a re-export from DGOS-T-0037, or the `evaluateAutonomyThreshold` overload from DGOS-T-0041), it is a minimal, version-bumped daimyo change per the repo rule, called out in a status update.
- [ ] Integration tests: the three initiative-body example decisions routed through `PolicyDecisionProvider` produce the expected settle-vs-delegate behavior (copy → settled `permit` at tier 0; save soft-conflict → settled `route` at tier 0 OR delegated, document which; audit hard-conflict/major → tier-3 human record); a fall-through routing case delegates to a fake/real `TieredDecisionProvider` and returns its record; a static-deny permission → tier-0 deny record without any model call (assert the injected model client is never invoked on the deterministic path).
- [ ] `engines/` typecheck/lint/test/build pass clean; daimyo still builds/tests clean. No escape hatches. The Engine core has **no** daimyo `core/ports` import (only the adapter does) — a test or lint boundary asserts this.

## Implementation Notes

### Technical Approach

- Model the adapter on `TieredDecisionProvider.resolve`/`parkAwaitingHuman`/`makeDecisionRecord` usage (`daimyo/src/decision/tiered-decision-provider.ts`) for the records it produces itself, and **delegate** rather than re-derive for fall-through. The cleanest seam: the adapter *is* the injected `DecisionProvider`; it composes an inner `TieredDecisionProvider` (the one daimyo would have built) and only short-circuits when the Engine settles deterministically.
- Use DGOS-T-0039's `fromDaimyoStaticRules` if config arrives in daimyo's flat shape; otherwise consume the loaded `PolicyConfig` from DGOS-T-0042 directly.
- Map `PolicyVerdict` → daimyo `DecisionVerdict` in one small, tested mapper; keep the `confidence`/`risk` derivation explicit (deterministic verdicts can stamp high confidence / verdict-derived risk).
- Source sibling ownership for routing conflict from the Supervisor/WorkSource context per DGOS-T-0040's resolution; if unavailable, degrade to scope-only as that task documents.

### Dependencies

- **Upstream:** [[DGOS-T-0041]] (the `evaluate` core) and [[DGOS-T-0042]] (`PolicyConfig` loader) — hard blockers. Transitively all earlier tasks. Consumes daimyo's `DecisionProvider`/`TieredDecisionProvider`/`makeDecisionRecord`/`ExecutionStore` (shipped).
- **Downstream:** consumers in the bootstrap/orchestration initiatives that wire dev-genie's daimyo composition (out of scope here) — this task provides the injectable provider they will use.

### Risk Considerations

- **Accidentally reimplementing tier orchestration** (the cardinal anti-goal). Mitigation: delegate to `inner` on fall-through; tests assert the model client is untouched on deterministic paths and that daimyo's record is returned verbatim on delegation.
- **Engine core leaking a daimyo `core/ports` dependency.** Mitigation: keep all daimyo-port imports in `adapter/` only, with a boundary test/lint.
- **DecisionRecord schema drift** between adapter-built and daimyo-built records. Mitigation: build via daimyo's `makeDecisionRecord` (don't hand-construct) + a `decision-record` schema-validation test.
- **Needing a daimyo source change** (re-export or threshold overload). This is permitted by the repo rule but must be minimal + version-bumped + flagged; it is a known possible fork point, not a blocker.

### Execution Profile

**Recommended Agent: opus + high.** The contract-defining integration that proves the whole enrich-not-duplicate thesis, spans `engines/` + daimyo's port, handles durable records/parking/notification correctly, and must avoid re-deriving daimyo's tiers. Multi-file, cross-package, and the task most likely to need a careful daimyo-side touch.

## Status Updates

*To be added during implementation.*