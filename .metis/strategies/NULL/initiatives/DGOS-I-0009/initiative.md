---
id: decision-policy-governance
level: initiative
title: "Decision Policy & Governance"
short_code: "DGOS-I-0009"
created_at: 2026-05-21T17:45:11.503016+00:00
updated_at: 2026-05-24T19:01:50.157675+00:00
parent: DGOS-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/decompose"


exit_criteria_met: false
estimated_complexity: L
strategy_id: NULL
initiative_id: decision-policy-governance
---

# Decision Policy & Governance Initiative

## Context

The recursive loop depends on one clear rule: children may act autonomously within scope, but they must escalate out-of-scope questions instead of guessing. The original policy and governance initiatives belong together because they all define where autonomy stops and review begins.

This initiative owns those deterministic boundaries.

## Goals & Non-Goals

**Goals:**
- Define deterministic autonomy, review, routing, and forbidden-action policy.
- Define how decision scope maps to Role routing and human review requirements.
- Bound child autonomy in the recursive loop.
- Make policy outcomes inspectable and replayable.

**Non-Goals:**
- Replace human judgment at strategic boundaries.
- Perform the specialist reasoning that a Role should do.
- Own completion authority or validation execution.

## Architecture

### Overview

The Decision Policy Engine evaluates a question, action, or requested operation against configured scope, risk, and review rules. It decides whether work may proceed, must escalate to a Role, or must stop for human review.

### Sequence Diagrams

Loop or Role proposes action -> Decision Policy evaluates scope and risk -> returns permit, route, block, or review requirement -> caller proceeds accordingly and records the result.

## Detailed Design

Policy should consider:

- action type and risk level
- decision domain and configured involvement level from the project autonomy profile
- work altitude and ownership surface
- whether the change is local or cross-cutting
- whether a human gate is required by phase, strategic sensitivity, or the configured autonomy profile for the relevant domain
- whether a specialist Role or the nearest parent should handle the decision

Policy should also define conflict classes for sibling impact:

- hard conflict: overlap or shared-contract change requiring sibling quiesce
- soft conflict: dependency-risk case requiring sibling context load or instruction patch
- no conflict: local change can proceed

This initiative should also unify review modes so the system can consistently distinguish low-risk autonomous flow from explicit human checkpoints.

Leaf nodes must always bubble decision requests to the parent. Policy applies at the parent or higher node, not inside the leaf.

### Policy examples

The first concrete policy pass should define one input shape and a small set of deterministic outcomes.

Policy inputs should include the classified domain (`engineering`, `product`, or `design`) plus the configured autonomy level for that domain (`always_in_loop`, `big_questions_only`, or `delegate`).

Example local permit decision:

```json
{
  "decision_request_id": "decision-request-admin-settings-copy-001",
  "request_context": {
    "source_loop_id": "task-admin-settings-copy",
    "action_type": "ui_text_update",
    "decision_domain": "design",
    "autonomy_level": "delegate",
    "altitude": "task",
    "ownership_scope": [
      "workflow:admin-settings:copy"
    ],
    "touched_surfaces": [
      "file:src/features/admin/settings/copy.ts"
    ]
  },
  "policy_result": {
    "outcome": "permit",
    "conflict_class": "no_conflict",
    "review_required": false,
    "route_to": null,
    "rationale": "Change stays within task-owned workflow and does not affect shared contracts."
  }
}
```

Example soft-conflict routed decision:

```json
{
  "decision_request_id": "decision-request-admin-settings-save-004",
  "request_context": {
    "source_loop_id": "task-admin-settings-save",
    "action_type": "api_response_change",
    "altitude": "task",
    "ownership_scope": [
      "interface:PUT /api/admin/settings"
    ],
    "touched_surfaces": [
      "interface:PUT /api/admin/settings",
      "workflow:admin-settings:save"
    ],
    "matched_dependencies": [
      "story-admin-settings-shell"
    ]
  },
  "policy_result": {
    "outcome": "route",
    "conflict_class": "soft_conflict",
    "review_required": false,
    "route_to": "parent_loop",
    "follow_up": "load sibling context and re-issue instructions",
    "rationale": "Contract risk exists, but the change is still within delegated product scope."
  }
}
```

Example mandatory human-review decision:

```json
{
  "decision_request_id": "decision-request-admin-settings-audit-002",
  "request_context": {
    "source_loop_id": "story-admin-settings-audit",
    "action_type": "policy_change",
    "altitude": "initiative",
    "ownership_scope": [
      "workflow:admin-settings:audit",
      "config:admin.audit.*"
    ],
    "risk_level": "high"
  },
  "policy_result": {
    "outcome": "review",
    "conflict_class": "hard_conflict",
    "review_required": true,
    "route_to": "human",
    "rationale": "This changes governance behavior at initiative scope and crosses a strategic review boundary."
  }
}
```

These examples establish the policy direction: the parent evaluates structured context, classifies conflict, and returns a small deterministic outcome set that the loop can execute without ad hoc interpretation.

## Approved design direction (autonomous, 2026-05-24)

This section records the design calls made to enable decomposition. It supersedes the looser, exploratory framing above where they conflict, and grounds the policy in the now-DECIDED ADRs (especially DGOS-A-0004 and DGOS-A-0005).

### What the Decision Policy Engine IS (ADR-1 Engine)

The Decision Policy Engine is a **deterministic ADR-1 Engine**: typed inputs, typed outputs, **no model call in its core path**, same inputs → same `PolicyVerdict` modulo explicit config. It is the "Tier 0 — deterministic policy" of DGOS-A-0005's tiered DecisionProvider, expressed as a *real* engine rather than daimyo's trivial built-in. It owns four deterministic concerns:

1. **Static allow/deny rule sets** — for the *permission-gating* surface (tool/action name → allow/deny), a richer, structured superset of daimyo's `StaticDecisionRules` (`allowTools`/`denyTools` string lists). Rules can match on tool name, argument predicates, ownership surface, and altitude — not just a flat tool-name list.
2. **The ADR-4 autonomy profile as first-class governance config** — the three-domain (`engineering`/`product`/`design`) × three-level (`always_in_loop`/`big_questions_only`/`delegate`) shape, loaded from persisted project config, plus the `product` + `delegate` + un-approved-baseline guardrail from ADR-4.
3. **Decision-domain classification** — deterministically map a `DecisionRequest`'s `action_type`/`ownership_scope`/`touched_surfaces`/`altitude` to a domain (`engineering`/`product`/`design`) and a scope (`local`/`moderate`/`major`) so the autonomy profile can be applied. This is the piece daimyo's `decisionPolicyContext` only reads off the request context today; the Engine *computes* it.
4. **The ask / proceed / stop policy plus conflict-class evaluation** — combine domain + level + scope + static rules + ownership/sibling conflict (`hard`/`soft`/`no` conflict from ADR-3 and this initiative's body) into a single deterministic `PolicyVerdict` with `outcome` (`permit` | `route` | `review`/`stop`), `conflict_class`, `review_required`, `route_to`, and a human-readable `rationale`.

### How it SUPERSEDES daimyo's trivial Tier-0 WITHOUT duplicating daimyo

daimyo's Tier-0 (`TieredDecisionProvider.evaluatePermissionTier0` / `evaluateRoutingTier0` in `daimyo/src/decision/tiered-decision-provider.ts`) is intentionally trivial: a flat allow/deny list + `decisionPolicyContext` reading domain/scope straight off the request + `evaluateAutonomyThreshold`. dev-genie replaces *that Tier-0 logic only* by injecting the real Engine through the **existing seam**, in either of the two ways DGOS-A-0005 and `daimyo/src/standalone/composition.ts` already expose:

- The injected path used by v1: a thin **dev-genie `DecisionProvider` adapter** (`PolicyDecisionProvider`) that implements daimyo's `DecisionProvider` port (`decidePermission`/`decideRouting`, `daimyo/src/core/ports/decision-provider.ts`). Its Tier-0 calls the Decision Policy Engine; on Tier-0 fall-through for routing it **delegates to a wrapped `TieredDecisionProvider`** so daimyo keeps owning Tier 1/2/3 orchestration (bounded model call, Tier-2 read-only investigation, Tier-3 human parking, `DecisionRecord` persistence to the `ExecutionStore`). dev-genie does **not** reimplement tier orchestration, the model call, Tier-2, the notifier, or the execution store.

**Reuse, not duplication, of the autonomy substrate:** the Engine **imports and reuses** daimyo's `AutonomyProfile`, `AutonomyLevel`, `AutonomyDomain`, `DecisionScope`, and `evaluateAutonomyThreshold` from `daimyo/src/decision/autonomy.ts` (re-exported through daimyo's package entry). It does **not** re-define the three-domain/three-level shape or re-implement the threshold math. The Engine's job is to (a) *compute* the `DecisionScope`/`AutonomyDomain` that daimyo currently just reads off the request context, (b) add the richer static-rule + conflict-class layer daimyo lacks, and (c) hand daimyo a request whose `context` already carries the computed `domain`/`scope`/`risk` so daimyo's own `decisionPolicyContext`/`evaluateAutonomyThreshold` and the Tier-1 prompt see consistent, Engine-classified inputs. Where the Engine needs threshold semantics for its own permit/stop calls, it calls daimyo's `evaluateAutonomyThreshold`, never a copy.

### Where it lives

**A new sibling package `engines/`** (peer of `protocol/`, `daimyo/`, `roles/`, `protocol-proof/`), with the Decision Policy Engine as its first member at `engines/src/decision-policy/`. Rationale:

- DGOS-A-0005 names a *family* of deterministic Engines that daimyo consumes but does not own — Decision Policy, Validation, Repo Intelligence, Context. They are used before daimyo runs (init, planning, architecture), so they must live outside the Loop substrate. A shared `engines/` package is the natural home and avoids one-tiny-package-per-engine sprawl, exactly mirroring how `roles/` became the single home for the Role-family primitives.
- `engines/` mirrors `roles/`'s proven layout: `package.json` (name `engines`), strict `tsconfig`/`eslint`, `file:../protocol` + `file:../daimyo` deps, Ajv protocol-schema validation, library-only (no marketplace `.claude-plugin` entry) unless/until it exposes a command. The **dev-genie `DecisionProvider` adapter** that injects the Engine into daimyo also lives here (it depends on both `engines/` core and daimyo's port), keeping daimyo free of any hard dependency on the Engine (DGOS-A-0005's "ports only, no hard imports" rule).
- The Engine core (classification + rules + verdict) is **daimyo-independent** (depends only on `protocol` types + the reused `autonomy.ts` types); only the *adapter* sub-module imports daimyo's port. This keeps the Engine reusable by init/planning/bootstrap before daimyo exists.

### Governance config: authored, stored, loaded

- **Autonomy profile** is persistent project governance config (DGOS-A-0004 "captured during initialization"). v1 storage: a versioned JSON/YAML governance file in the project (e.g. `.dev-genie/governance.json`) containing the `AutonomyProfile` (three domains), a `product_baseline_approved` flag, and the static allow/deny rule set. A typed **loader** in `engines/` reads and validates it against a protocol JSON Schema (new `policy-config.schema.json`), falling back to `DEFAULT_AUTONOMY_PROFILE` when absent so the Engine is always satisfiable. Authoring/bootstrap *capture* of the profile (the three init questions) is owned by the bootstrap/init initiative, NOT this one — this initiative defines the schema + loader the Engine consumes.
- **Decisions are recorded** as protocol `DecisionRecord`s (`protocol/schemas/decision-record.schema.json`): request + `DecisionVerdict` + tier + rationale. For Engine-resolved (Tier-0) decisions the adapter constructs the `DecisionRecord` exactly as daimyo's `makeDecisionRecord` does (tier 0) and persists it through the same `ExecutionStore.recordDecision` path, so Engine decisions are replayable/observable identically to daimyo's. The Engine's own `PolicyVerdict` additionally carries the deterministic rationale + matched-rule refs ADR-1 requires of an Engine ("record input artifact refs, config refs, engine version, deterministic decision rationale, gate implications").

### Engine stays an Engine

No model call in the Engine's core decision path. When a decision cannot be settled deterministically (Tier-0 fall-through), the Engine returns a `route`/fall-through verdict and the adapter hands control to daimyo's **Tier 1** bounded Role call — the model spend is daimyo's, never this Engine's. This preserves the ADR-1 Engine contract and the ADR-5 tier-cost model.

## Alternatives Considered

- Let each Loop encode its own autonomy rules: rejected because policy would fragment.
- Always require human review for uncertain work: rejected because many bounded decisions should route to Roles automatically.
- Allow agents to guess beyond scope when confidence is high: rejected because hidden product or architecture decisions are exactly what this engine is meant to prevent.

## Implementation Plan

- [ ] Define policy inputs and outputs for autonomy, routing, and review decisions, including decision domain and autonomy-profile level.
- [ ] Specify decision-scope categories and risk rules.
- [ ] Specify ownership-surface and conflict-class rules for sibling impact checks.
- [ ] Define forbidden-action and mandatory-human-review cases.
- [ ] Wire policy outputs into Loop and Role invocation flow.
- [ ] Add fixture coverage for local, cross-cutting, and strategic decision cases.

## Decomposition (decided 2026-05-24)

| Task | Title | Depends on | Recommended Agent |
|------|-------|------------|-------------------|
| DGOS-T-0037 | Scaffold the `engines/` package + Decision Policy Engine types + protocol schemas (`policy-verdict`, `policy-config`) | — | opus + high |
| DGOS-T-0038 | Deterministic decision-domain and scope classifier | DGOS-T-0037 | opus + high |
| DGOS-T-0039 | Structured static allow/deny rule evaluator (permission surface) | DGOS-T-0037 | opus + medium |
| DGOS-T-0040 | Conflict-class and ownership-surface evaluator (sibling impact) | DGOS-T-0037 | opus + medium |
| DGOS-T-0041 | Policy verdict assembler: ask/proceed/stop core reusing `evaluateAutonomyThreshold` | DGOS-T-0038, DGOS-T-0039, DGOS-T-0040 | opus + high |
| DGOS-T-0042 | Governance config loader + schema validation (autonomy profile + rules) | DGOS-T-0037, DGOS-T-0039 | opus + low |
| DGOS-T-0043 | `PolicyDecisionProvider` adapter: inject the Engine into daimyo's `DecisionProvider` port | DGOS-T-0041, DGOS-T-0042 | opus + high |

### Critical path

**DGOS-T-0037 → DGOS-T-0038 → DGOS-T-0041 → DGOS-T-0043.** The package + contracts must exist before any evaluator; the classifier (T-0038) is the longest of the three evaluator inputs feeding the assembler; the assembler (T-0041) is the integration point of all three evaluators; the daimyo adapter (T-0043) is the capstone that proves the enrich-not-duplicate thesis. T-0039 (rules) and T-0040 (conflict) can proceed in parallel with T-0038 after T-0037; T-0042 (loader) can proceed in parallel once T-0037 + T-0039 land.

### Load-bearing tasks

- **DGOS-T-0037** — defines the `engines/` package, the `PolicyVerdict`/`PolicyConfig` protocol contracts, the `DecisionPolicyEngine.evaluate` seam, and (critically) the daimyo-autonomy re-use boundary. A wrong abstraction cascades into all six downstream tasks.
- **DGOS-T-0038** — classification is the input substrate the ADR-4 autonomy profile is applied against; a wrong domain/scope mapping silently changes daimyo's injected behavior.
- **DGOS-T-0041** — the Engine's decision core; must reuse daimyo's `evaluateAutonomyThreshold` rather than duplicate threshold math. This is where the initiative's "no duplication" invariant is enforced.
- **DGOS-T-0043** — the integration capstone; proves the Engine supersedes daimyo's trivial Tier-0 through the existing `DecisionProvider` seam without reimplementing tier orchestration.

### Genuine forks / risks for a human

- **`evaluateAutonomyThreshold` reuse shape (T-0041).** daimyo's threshold function takes a daimyo `DecisionVerdict` + `DecisionRequest`; the Engine has a classified context. If feeding it cleanly proves contorted, the right reuse seam is a small daimyo-side overload (`evaluateAutonomyThreshold`-over-`DecisionPolicyContext`), version-bumped per the repo rule. This is a sanctioned daimyo touch, not a workaround — flagged for awareness.
- **Sibling-ownership sourcing for conflict evaluation (T-0040 open question).** The pure Engine must receive sibling ownership surfaces as input; v1 sources them from the Supervisor/WorkSource context, degrading to scope-only `no_conflict` when absent. Confirm the degradation is acceptable.
- **Governance file location/format (`.dev-genie/governance.json`).** Chosen for v1; the bootstrap/init initiative owns *capturing* the profile (the three ADR-4 questions). If that initiative picks a different storage convention, T-0042's loader path must align.