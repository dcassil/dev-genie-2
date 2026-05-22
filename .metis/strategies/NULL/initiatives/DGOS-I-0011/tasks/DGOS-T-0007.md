---
id: decisionprovider-tiered-resolution
level: task
title: "DecisionProvider: Tiered Resolution (0/1/3) & DecisionVerdict"
short_code: "DGOS-T-0007"
created_at: 2026-05-22T17:53:53.307414+00:00
updated_at: 2026-05-22T21:14:40.354060+00:00
parent: DGOS-I-0011
blocked_by: []
archived: false

tags:
  - "#task"
  - "#phase/completed"


exit_criteria_met: false
strategy_id: NULL
initiative_id: DGOS-I-0011
---

# DecisionProvider: Tiered Resolution (0/1/3) & DecisionVerdict

## Parent Initiative

[[DGOS-I-0011]] — implements the third port from [[DGOS-A-0005]] and the second *required* capability, the place every `needs-decision` and permission gate resolves. Gated by the autonomy profile from [[DGOS-A-0004]].

## Objective

Implement the **DecisionProvider port** and its tiered resolution for the standalone build — **Tier 0** (deterministic policy, no model call), **Tier 1** (one bounded model call returning a `DecisionVerdict`), and **Tier 3** (human via pluggable notifier). Tier 2 (investigating agent) is implemented separately in [[DGOS-T-0009]] because it needs the AgentTransport. The provider must serve **two mechanically distinct surfaces without conflating them**: *permission-gating* ("may this agent run this tool?") and *decision-routing* ("which design/product/scope option is correct?"). It maps its `DecisionVerdict` to/from ADR-1's canonical Role result and emits the durable `DecisionRecord` ADR-3's sideways channel expects.

## Acceptance Criteria

## Acceptance Criteria

## Acceptance Criteria

- [ ] The two decision surfaces are represented as distinct inputs and never collapsed: **permission-gating** requests carry a tool name + arguments (and arrive from `needs_permission` / `PreToolUse`); **decision-routing** requests are `needs-decision` content bubbles requiring judgment. A test asserts a decision-routing request never gets handled as a `PreToolUse`-style tool rule and vice-versa.
- [ ] **Tier 0 (deterministic policy):** evaluates the [[DGOS-A-0004]] autonomy profile (engineering/product/design × `always_in_loop`/`big_questions_only`/`delegate`) plus static allow/deny rules, in-process, no model call. For the permission surface this is expressed as `canUseTool`-return / `PreToolUse`-style allow/deny; for decision-routing it settles only cases a static rule can (e.g. domain `delegate` + local change → proceed) and otherwise falls through to Tier 1.
- [ ] **Tier 1 (bounded model call):** a single fresh-context call given the small fixed payload `{context, rules, request}` returns a `DecisionVerdict` `{ type: "decision" | "access" | "human", suggested_choice, suggested_response, confidence: 0-10, risk: 0-10, block_trigger: boolean }`. No tools, no filesystem.
- [ ] **Tier 3 (human):** when policy or the verdict's `block_trigger`/`risk`/`confidence` crosses the autonomy-profile threshold, the run is parked in `awaiting_human` (execution-store state from [[DGOS-T-0003]]) and a **pluggable notifier** is invoked (console floor; email/push later).
- [ ] **Verdict ↔ Role-result mapping:** the adapter maps the minimal `DecisionVerdict` to/from ADR-1's canonical Role output (`produced/skipped/blocked/needs_human` with `confidence`, `missing_context`, `human_review_required`). `DecisionVerdict` stays a distinct minimal type, not the full Role schema.
- [ ] A durable **`DecisionRecord`** is emitted for every resolved decision (persisted via [[DGOS-T-0003]]) so the sideways channel and observability requirements (ADR-1) are satisfied.
- [ ] The standalone build ships a **minimal, versioned Tier-1 Role prompt** (per ADR-1's versioned-prompt contract) so the bounded call works with only a model API key; absence of the prompt degrades cleanly to Tier 0 + Tier 3 only, and that degradation is tested.
- [ ] Threshold logic mapping verdict + autonomy profile → {proceed | escalate to human} is implemented and unit-tested across the domain × level matrix.
- [ ] The dev-genie injected adapter (real Decision Policy Engine + autonomy profile + stronger Role prompts) is accommodated by the port but out of scope here.

## Implementation Notes

### Technical Approach

- Build the tier dispatch as a deterministic pipeline: Tier 0 first; on fall-through, Tier 1; on low-confidence/high-risk, mark for Tier 2 (handed to [[DGOS-T-0009]]); on threshold breach, Tier 3. Tier 2's hook is a clearly-marked extension point this task leaves unimplemented but wired.
- Tier 1 uses the structured-model-call primitive from [[DGOS-T-0002]] with the bundled versioned prompt and a strict `DecisionVerdict` JSON schema.
- Keep permission-gating and decision-routing as separate methods/types on the port so the SDK transport's `PreToolUse` allow/deny path and the `needs-decision` routing path can't accidentally share logic.
- Persist `DecisionRecord`s through the execution store; include the tier that resolved it and the inputs for replayability.

### Dependencies

- **Upstream:** [[DGOS-T-0002]] (DecisionProvider stub, `DecisionVerdict` type, model-call primitive), [[DGOS-T-0003]] (persist `DecisionRecord`s + `awaiting_human` state), [[DGOS-A-0004]] (autonomy profile semantics).
- **Downstream:** [[DGOS-T-0008]] (loop routes `needs-decision` here), [[DGOS-T-0009]] (Tier-2 plug-in + decision actions), [[DGOS-T-0012]] (bundled prompt + notifier packaging).

### Risk Considerations

- **Surface conflation** is the ADR's named leak risk for this port. Mitigation: distinct types/methods + a test that the two surfaces never share a code path.
- **Threshold mis-tuning** over-asks the human or over-acts. Mitigation: thresholds are explicit, config-driven, and unit-tested against the autonomy matrix; defaults err toward asking.
- **Prompt drift:** an unversioned Tier-1 prompt makes decisions non-reproducible. Mitigation: ship it versioned per ADR-1.

### Execution Profile

**Recommended Agent: opus + high.** This is central judgment substrate spanning two decision surfaces, a new verdict type, autonomy-gated thresholds, and the Role-result/`DecisionRecord` mapping that ADR-3's sideways channel depends on. A leak or mis-tuning here propagates into every routed decision — top tier.

## Status Updates

### 2026-05-22 — Tiered DecisionProvider (0/1/3) complete (via Codex gpt-5.5)

`DecisionRequest` split into distinct permission vs routing variants in core; the port exposes separate `decidePermission` / `decideRouting` methods so the two surfaces can never share a code path (asserted by tests). Tiered provider in `daimyo/src/decision/`:
- **Tier 0** — deterministic: ADR-4 autonomy profile (engineering/product/design × always_in_loop/big_questions_only/delegate) + static allow/deny; no model call.
- **Tier 1** — single bounded structured-model-call with `{context, rules, request}` → validated `DecisionVerdict`. Bundled versioned prompt `daimyo.tier1-decision-role@1.0.0`; null prompt degrades to Tier 0 + Tier 3 (tested).
- **Tier 3** — parks node `awaiting-human` in the execution store + invokes a pluggable notifier (console floor).
- **Tier 2** — only a typed `Tier2InvestigationHook` extension point; the investigating agent is deferred to DGOS-T-0009.

`DecisionVerdict` ↔ ADR-1 Role-result mapping (produced/skipped/blocked/needs_human) implemented while keeping the verdict a distinct minimal type. Every resolution persists a `DecisionRecord` (with resolving tier + inputs) via `ExecutionStore`. Threshold logic unit-tested across the domain × autonomy-level matrix.

**Orchestrator verification:** typecheck/lint/test/build all green (34 passed / 5 live-skipped; 7 new decision tests). No regressions across prior suites despite the core `DecisionRequest` split. `src/core` import-pure. Version 0.5.0 → 0.6.0. No escape hatches. **exit_criteria_met: true.** Completed.