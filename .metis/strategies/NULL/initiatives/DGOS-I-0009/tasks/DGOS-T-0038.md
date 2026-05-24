---
id: deterministic-decision-domain-and
level: task
title: "Deterministic decision-domain and scope classifier"
short_code: "DGOS-T-0038"
created_at: 2026-05-24T19:02:45.668335+00:00
updated_at: 2026-05-24T19:02:45.668335+00:00
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

# Deterministic decision-domain and scope classifier

## Parent Initiative

[[DGOS-I-0009]] — Decision Policy & Governance. This task implements the **decision-domain and scope classification** that lets the ADR-4 autonomy profile be applied. It is load-bearing: every later evaluation (rules, conflict, verdict) and daimyo itself depend on a correct, deterministic domain/scope. Today daimyo only *reads* `domain`/`scope` off the request context (`daimyo/src/decision/autonomy.ts` `decisionPolicyContext`); this task makes the Engine *compute* them.

## Objective

Implement a deterministic, pure classifier in `engines/src/decision-policy/` that maps a `PolicyDecisionInput` (the protocol `DecisionRequest` payload — `action_type`, `ownership_scope`, `touched_surfaces`, `altitude`, optional `risk_level`/`declared_risk` from the request context) onto a `classified_domain` (`engineering` | `product` | `design`) and a `classified_scope` (`local` | `moderate` | `major`), reusing daimyo's `AutonomyDomain`/`DecisionScope` types. The classifier is the input stage of the Engine: its outputs feed the autonomy-profile lookup in the verdict assembler (DGOS-T-0041). It performs no model call and no I/O.

## Acceptance Criteria

- [ ] A pure function `classifyDecision(input: PolicyDecisionInput): { domain: AutonomyDomain; scope: DecisionScope; risk: Score0To10; rationale: string }` exists in `engines/src/decision-policy/`, importing `AutonomyDomain`/`DecisionScope`/`Score0To10` from daimyo (not re-declared).
- [ ] **Domain rules** are explicit and table-driven (a declared mapping, not scattered conditionals): `action_type` values such as `ui_text_update`/`ux_*`/`visual_*`/`interaction_*` → `design`; `policy_change`/`capability_*`/`workflow_*`/`scope_*`/product-behavior types → `product`; `api_response_change`/`schema_*`/`tech_*`/`code_*`/`architecture_*` and the unmatched default → `engineering`. The mapping table is exported so DGOS-T-0042's config can extend it later, and a status update documents the seed mapping.
- [ ] **Scope rules** are deterministic: `altitude: "task"` with only task-owned `ownership_scope`/`touched_surfaces` → `local`; touching a shared `interface:`/`config:`/`schema:` surface or `altitude: "initiative"`/`"epic"` → `moderate` or `major` per a documented rule (e.g. shared-contract change at task altitude → `moderate`; any change at initiative+ altitude or touching governance/`config:*.*` wildcards → `major`). The exact thresholds are written as a small declared rule set with inline rationale.
- [ ] When the request context already carries an explicit `decision_domain`/`scope` (as the initiative-body examples do), the classifier **honors the explicit value** and records that it was caller-supplied rather than inferred (so callers like leaves can pre-classify, matching daimyo's current read-from-context behavior); inference only runs when the field is absent.
- [ ] The classifier is **total**: every well-formed `PolicyDecisionInput` yields a domain + scope (no throw, no `undefined`), defaulting to `engineering`/`moderate` with a rationale when signals are absent — matching daimyo's existing defaults in `decisionPolicyContext`.
- [ ] Unit tests cover: each of the three initiative-body example requests (admin-settings copy → `design`/`local`; admin-settings save → shared interface at task altitude → `moderate`; admin-settings audit → `major` at initiative altitude with `config:admin.audit.*`); explicit-context honoring; the empty/default case; and at least two adversarial cases (conflicting signals, unknown `action_type`).
- [ ] `engines/` typecheck/lint/test/build pass clean; no escape hatches; classifier is synchronous and side-effect-free (a test asserts purity — same input yields same output, no I/O).

## Implementation Notes

### Technical Approach

- Keep classification a pure module separate from rule-matching (DGOS-T-0039) and conflict (DGOS-T-0040) so the verdict assembler (DGOS-T-0041) can compose them. Express domain/scope rules as exported data tables + a tiny matcher, not nested `if` chains, so they are inspectable and extensible.
- Reuse the request-context reading *intent* from `daimyo/src/decision/autonomy.ts` (`readDomain`, `readScope`, `readScore`) — these are daimyo-internal, so re-implement equivalently small readers in `engines/` against the protocol `DecisionRequest` payload shape rather than importing private helpers; keep the default behavior (`engineering`, `moderate`, risk `5`) identical so injecting the Engine does not change daimyo's defaults.
- Ground `action_type`/`altitude`/`ownership_scope`/`touched_surfaces`/`risk_level` field names in the initiative body's three JSON examples and the `protocol` `decision-request` payload context (`context` is a free-form `jsonObject`).

### Dependencies

- **Upstream:** [[DGOS-T-0037]] (package, types, `PolicyDecisionInput`, daimyo autonomy re-exports). Hard blocker.
- **Downstream:** [[DGOS-T-0041]] (verdict assembler consumes the classified domain/scope to apply the autonomy profile); [[DGOS-T-0040]] (conflict evaluation shares the ownership-surface parsing).

### Risk Considerations

- **Classification ambiguity (the ADR-4 "borderline questions" concern).** Mitigation: explicit declared tables + documented default + adversarial tests; record the matched rule in `rationale` for replayability (ADR-1 observability).
- **Divergence from daimyo's read-from-context defaults** would silently change behavior when the Engine is injected. Mitigation: the honor-explicit-context criterion + identical defaults + a test pinning the empty-input result to `engineering`/`moderate`/`5`.

### Execution Profile

**Recommended Agent: opus + high.** Classification is the input substrate the autonomy profile is applied against; getting the domain/scope mapping wrong cascades into every downstream verdict and changes daimyo's injected behavior. Reasoning-heavy rule design even though it is largely single-module.

## Status Updates

*To be added during implementation.*