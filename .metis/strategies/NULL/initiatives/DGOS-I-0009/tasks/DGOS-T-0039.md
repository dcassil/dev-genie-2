---
id: structured-static-allow-deny-rule
level: task
title: "Structured static allow/deny rule evaluator for the permission surface"
short_code: "DGOS-T-0039"
created_at: 2026-05-24T19:02:46.626022+00:00
updated_at: 2026-05-24T19:40:06.109049+00:00
parent: DGOS-I-0009
blocked_by: []
archived: false

tags:
  - "#task"
  - "#phase/completed"


exit_criteria_met: false
strategy_id: NULL
initiative_id: DGOS-I-0009
---

# Structured static allow/deny rule evaluator for the permission surface

## Parent Initiative

[[DGOS-I-0009]] — Decision Policy & Governance. This task implements the **structured static allow/deny rule evaluator** for the permission-gating surface — the richer superset of daimyo's flat `StaticDecisionRules` (`allowTools`/`denyTools` string lists in `daimyo/src/decision/tiered-decision-provider.ts`). It is one of the two evaluation inputs (with the classifier) that the verdict assembler composes.

## Objective

Implement a deterministic rule evaluator in `engines/src/decision-policy/` that, given a permission-surface `PolicyDecisionInput` (a protocol permission `DecisionRequest`: `tool_name` + `arguments` + ownership/altitude context) and the loaded `static_rules` from `PolicyConfig`, returns a `RuleMatch` (`{ effect: "allow" | "deny" | "no_match"; matched_rule_ref: string | null; rationale: string }`). Rules match on more than a bare tool name — tool name (with glob), argument predicates, ownership surface, and altitude — finalizing the `static_rules` shape reserved in `policy-config.schema.json` by DGOS-T-0037. No model call, no I/O.

## Acceptance Criteria

## Acceptance Criteria

## Acceptance Criteria

- [ ] The `static_rules` shape in `protocol/schemas/policy-config.schema.json` is finalized: an ordered array of rule objects, each with a unique `id` (string, used as `matched_rule_ref`), an `effect` (`allow`|`deny`), and a `match` object supporting `tool_name` (exact or glob, e.g. `Bash`, `mcp__*`), optional `arguments_contains` (key→substring/predicate map), optional `ownership_scope_prefix`, and optional `altitude`. The protocol TS binding is regenerated and `protocol` rebuilt.
- [ ] A pure function `evaluateStaticRules(input, staticRules): RuleMatch` evaluates rules **in declared order, first match wins**, with explicit precedence documented (e.g. a `deny` and `allow` both matching — first-in-order wins, so authors order deny-before-allow deliberately); returns `no_match` when nothing matches so the verdict assembler can fall through to autonomy-profile logic.
- [ ] Backward-compatibility helper: a `fromDaimyoStaticRules(allowTools, denyTools)` converter produces an equivalent structured rule set from daimyo's flat lists, so the daimyo defaults (`DEFAULT_STATIC_RULES`: allow `Read/Grep/Glob/LS/TodoRead`, deny none) reproduce identically. A test asserts parity: the same tool names resolve to the same allow/deny/no_match as daimyo's `toolRule`.
- [ ] Glob matching is deterministic and bounded (no regex injection from config — globs are translated to anchored patterns); argument predicates operate only on the typed `arguments` JSON object.
- [ ] Unit tests cover: exact tool allow; exact tool deny; glob match (`mcp__*`); argument predicate (e.g. deny `Bash` where `command` contains `rm -rf`); ownership-scope-prefixed rule; altitude-scoped rule; ordering precedence (deny-before-allow vs allow-before-deny); `no_match` fall-through; and the daimyo-parity case.
- [ ] `engines/` typecheck/lint/test/build pass clean; no escape hatches; evaluator is synchronous and pure.

## Implementation Notes

### Technical Approach

- Study daimyo's `toolRule`/`DEFAULT_STATIC_RULES`/`evaluatePermissionTier0` (`daimyo/src/decision/tiered-decision-provider.ts`) to make the structured rule set a strict superset: anything daimyo's flat lists can express, the structured rules must express identically (the `fromDaimyoStaticRules` converter is the parity bridge the adapter in DGOS-T-0043 uses to feed daimyo-shaped config through the Engine).
- Keep this module pure and independent of the classifier (DGOS-T-0038) and conflict evaluator (DGOS-T-0040); the verdict assembler (DGOS-T-0041) composes them. Rule evaluation must not consult the autonomy profile — that is the assembler's job; this module answers only "does a static rule settle this?".
- Translate config globs to anchored matchers in code; never `eval` or build dynamic `RegExp` from raw untrusted strings without escaping.

### Dependencies

- **Upstream:** [[DGOS-T-0037]] (package + `PolicyConfig`/`PolicyDecisionInput` + schema). Hard blocker. Coordinates with [[DGOS-T-0038]] only via the shared `PolicyDecisionInput` type (no logic dependency).
- **Downstream:** [[DGOS-T-0041]] (assembler consumes `RuleMatch`); [[DGOS-T-0042]] (loader validates the finalized `static_rules` schema); [[DGOS-T-0043]] (adapter uses `fromDaimyoStaticRules`).

### Risk Considerations

- **Rule precedence ambiguity** is the classic policy footgun. Mitigation: first-match-wins is explicit, documented, and tested both orderings.
- **Glob/predicate over-permissiveness** could allow a dangerous tool. Mitigation: anchored glob translation, predicates only over typed args, deny-precedence tests, and the daimyo read-only-default parity test.
- **Divergence from daimyo's permission defaults** when injected. Mitigation: the `fromDaimyoStaticRules` parity test against `DEFAULT_STATIC_RULES`.

### Execution Profile

**Recommended Agent: opus + medium.** Substantive, security-sensitive policy logic with real precedence/matching subtlety and a parity contract against daimyo, but it is a single focused module within an established package and contract. Higher than mechanical, below the load-bearing-architecture tier.

## Status Updates

- 2026-05-24: Implemented structured permission static rules in `engines/src/decision-policy/static-rules.ts`; finalized `policy-config` static rule schema with additive legacy-object compatibility; regenerated protocol bindings/build output; added unit coverage for exact/glob/argument/ownership/altitude/order/no-match/daimyo parity; verified `engines` typecheck/lint/test/build and protocol test/codegen/compatibility gates.
- 2026-05-24 (orchestrator verification): re-ran engines (25 tests) + protocol (76 tests, check:codegen clean, check:compatibility passed — 15 schemas, 1 changed = additive policy-config extension) — all green. Pure synchronous allow/deny evaluator over `PolicyConfig.static_rules` (exact/glob/argument/ownership/altitude matching, ordered precedence, no-match fall-through, matched_rule_refs for observability); no model/IO. protocol `policy-config` schema finalized (placeholder → real rule shape; schema 1.0.0→1.1.0), protocol 0.4.0→0.5.0; engines 0.2.0→0.3.0. No escape hatches. **exit_criteria_met: true.** Completed.