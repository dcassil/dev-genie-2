---
id: policy-verdict-assembler-ask
level: task
title: "Policy verdict assembler: ask/proceed/stop core reusing the autonomy threshold"
short_code: "DGOS-T-0041"
created_at: 2026-05-24T19:02:49.687042+00:00
updated_at: 2026-05-24T19:02:49.687042+00:00
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

# Policy verdict assembler: ask/proceed/stop core reusing the autonomy threshold

## Parent Initiative

[[DGOS-I-0009]] — Decision Policy & Governance. This is the **core of the Engine** and a load-bearing task: the `evaluate(input): PolicyVerdict` implementation that composes classification (DGOS-T-0038), static rules (DGOS-T-0039), and conflict (DGOS-T-0040) with the ADR-4 autonomy profile into the deterministic ask/proceed/stop outcome the whole initiative exists to produce. It must reuse daimyo's `evaluateAutonomyThreshold` rather than re-implement threshold math.

## Objective

Implement `DecisionPolicyEngine.evaluate(input: PolicyDecisionInput): PolicyVerdict` in `engines/src/decision-policy/`, the deterministic composition that produces the final `PolicyVerdict` (`outcome: permit|route|stop`, `conflict_class`, `review_required`, `route_to`, `classified_domain`, `classified_scope`, `rationale`, `matched_rule_refs`, `engine_version`). It is a pure Engine (ADR-1): no model call, no I/O, same inputs → same verdict. Routing/permission surfaces are handled per their `surface`. The autonomy ask/proceed/stop decision **delegates to daimyo's `evaluateAutonomyThreshold`** (reused, never copied).

## Acceptance Criteria

- [ ] `evaluate` dispatches on the request `surface`: for **permission** requests it runs the static-rule evaluator (DGOS-T-0039) first (an explicit `deny` → `stop`/`review_required` per policy; explicit `allow` → `permit`); for **routing** requests it runs classification + conflict + autonomy.
- [ ] The autonomy ask/proceed/stop decision is computed by calling daimyo's **`evaluateAutonomyThreshold`** (`daimyo/src/decision/autonomy.ts`), passing the classified domain/scope/risk so daimyo's threshold math is the single source of truth. The Engine maps `evaluateAutonomyThreshold`'s `{action: "proceed"|"escalate", reason}` onto `PolicyVerdict.outcome`: `proceed` → `permit` (or `route` when a conflict requires sibling handling); `escalate` → `stop` with `review_required: true` and `route_to: "human"`. A test asserts that for matched inputs the Engine's escalate/proceed decisions match daimyo's `evaluateAutonomyThreshold` exactly (no divergent threshold logic).
- [ ] **Conflict folding:** `hard_conflict` forces `route_to: "parent_loop"` with sibling-quiesce intent and at least `route` (or `stop` if scope/level demands), per ADR-3; `soft_conflict` yields `route` to `parent_loop` with the "load sibling context / patch instructions" follow-up (matching the initiative's soft-conflict example); `no_conflict` lets the autonomy outcome stand. `conflict_class` is always reported in the verdict.
- [ ] The ADR-4 **product-baseline guardrail** is honored (product + delegate + `!product_baseline_approved` + non-local scope → escalate), which falls out of reusing `evaluateAutonomyThreshold` since it already encodes this — a test confirms the Engine inherits it rather than re-implementing.
- [ ] The three initiative-body example requests produce verdicts matching their stated `policy_result` blocks (copy → `permit`/`no_conflict`/`review_required:false`; save → `route`/`soft_conflict`/`route_to: parent_loop`; audit → `stop`(review)/`hard_conflict`/`route_to: human`). These are encoded as fixture tests.
- [ ] Every verdict carries a non-empty `rationale` and the `matched_rule_refs` from any static rule that fired, satisfying ADR-1 Engine observability ("deterministic decision rationale, gate implications"). `engine_version` is stamped from package metadata.
- [ ] `evaluate` is synchronous (returns `PolicyVerdict`, not a Promise) and performs no I/O or model call — a structural/test guarantee of the Engine contract.
- [ ] `engines/` typecheck/lint/test/build pass clean; no escape hatches.

## Implementation Notes

### Technical Approach

- This module is the composition root of the Engine's pure core: import `classifyDecision` (T-0038), `evaluateStaticRules` (T-0039), `assessConflict` (T-0040), and daimyo's `evaluateAutonomyThreshold`/`DecisionScope`/`AutonomyProfile`. Build the `DecisionPolicyContext`-equivalent inputs daimyo expects from the classifier output, then call `evaluateAutonomyThreshold` — do not branch on `AutonomyLevel` yourself (that is exactly daimyo's code you must not duplicate).
- Because `evaluateAutonomyThreshold` takes a daimyo `DecisionVerdict` + `DecisionRequest` + profile, decide the cleanest reuse: either (a) construct the minimal inputs `evaluateAutonomyThreshold` reads (it reads `verdict.type`/`block_trigger`/`risk`/`confidence` and the request context's domain/scope/baseline/risk) and pass an Engine-derived provisional verdict, or (b) if that coupling is awkward, propose in a status update a tiny daimyo refactor to expose a `evaluateAutonomyThreshold`-over-`DecisionPolicyContext` overload (daimyo-side, patch-bumped) so the Engine can call it with the classified context directly. Prefer (a) if it works without a daimyo change; flag (b) as a fork point if needed. Either way the threshold math stays in daimyo.
- Keep `permit`/`route`/`stop` mapping logic small and table-like; record the deciding reason chain in `rationale`.

### Dependencies

- **Upstream:** [[DGOS-T-0038]], [[DGOS-T-0039]], [[DGOS-T-0040]] (the three evaluation inputs) and [[DGOS-T-0037]] (types). Hard blockers — this is the integration point of the three.
- **Downstream:** [[DGOS-T-0043]] (the daimyo adapter calls `evaluate` and maps `PolicyVerdict` → daimyo `DecisionRecord`/`DecisionVerdict`).

### Risk Considerations

- **Re-implementing daimyo's threshold math** is the primary anti-goal of this whole initiative. Mitigation: the explicit "matches `evaluateAutonomyThreshold`" parity test and the no-branch-on-`AutonomyLevel` rule.
- **Coupling friction reusing `evaluateAutonomyThreshold`** (it expects a daimyo `DecisionVerdict`). Mitigation: the (a)/(b) decision above; a daimyo-side overload is acceptable and first-class if (a) proves contorted — it is not a workaround, it is the right reuse seam.
- **`permit`/`route`/`stop` ↔ daimyo tier mapping mismatch.** Mitigation: fixture tests pinned to the three initiative examples plus the adapter integration test in DGOS-T-0043.

### Execution Profile

**Recommended Agent: opus + high.** This is the Engine's decision core, composes all three evaluators, and must thread the `evaluateAutonomyThreshold` reuse correctly (possibly negotiating a small daimyo refactor) without duplicating policy. Contract-defining and the linchpin of the initiative; a wrong composition here invalidates the whole Engine.

## Status Updates

*To be added during implementation.*