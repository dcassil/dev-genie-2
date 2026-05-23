---
id: decisionrequest-decisionrecord
level: task
title: "DecisionRequest, DecisionRecord & DecisionVerdict Schemas + TS Bindings (Reconcile daimyo)"
short_code: "DGOS-T-0017"
created_at: 2026-05-23T18:56:10.111505+00:00
updated_at: 2026-05-23T19:47:03.228489+00:00
parent: DGOS-I-0001
blocked_by: []
archived: false

tags:
  - "#task"
  - "#phase/completed"


exit_criteria_met: false
strategy_id: NULL
initiative_id: DGOS-I-0001
---

# DecisionRequest, DecisionRecord & DecisionVerdict Schemas + TS Bindings (Reconcile daimyo)

## Parent Initiative

[[DGOS-I-0001]] — defines the decision-channel artifacts. This is one of the two load-bearing reconciliation tasks: `daimyo` already shipped TypeScript types for exactly these, so the schema must be authored to match (and become the source of truth for) daimyo's shipped reality.

## Objective

Author the **`DecisionRequest`**, **`DecisionRecord`**, and **`DecisionVerdict`** schemas (typed payloads under the shared envelope, plus `DecisionVerdict` as the on-the-wire decision payload), with generated TS bindings — **authored to reconcile with `daimyo`'s already-shipped types** in `daimyo/src/core/domain.ts`. daimyo (DGOS-I-0011) defined: `DecisionRequest` split into permission vs routing variants (the `surface: "permission" | "routing"` distinction), `DecisionVerdict { type: "decision"|"access"|"human", suggested_choice, suggested_response, confidence: 0-10, risk: 0-10, block_trigger }`, and `DecisionRecord` (request + verdict + tier + rationale). The schema must capture these faithfully so the protocol is the source of truth and daimyo can be generated from / conformed to it in [[DGOS-T-0019]].

## Acceptance Criteria

## Acceptance Criteria

## Acceptance Criteria

- [ ] **`DecisionRequest`** schema captures the two mechanically-distinct surfaces daimyo separates — **permission-gating** (carries tool name + arguments) and **decision-routing** (a `needs-decision` content bubble) — without collapsing them (e.g. a discriminated union on a `surface` field).
- [ ] **`DecisionVerdict`** schema captures the exact daimyo shape: `type: "decision" | "access" | "human"`, `suggested_choice`, `suggested_response`, `confidence` (0–10), `risk` (0–10), `block_trigger` (boolean). It is a distinct minimal payload (not the full Role result).
- [ ] **`DecisionRecord`** schema captures the routed answer + provenance daimyo records: the originating request, the verdict, the resolving tier (0–3), rationale, and timestamp — as a typed payload under the shared envelope, satisfying ADR-3's sideways-channel durable record.
- [ ] The schemas are reconciled field-by-field with `daimyo/src/core/domain.ts`; every daimyo field is represented (or an intentional, documented rename is recorded for [[DGOS-T-0019]] to apply). The protocol schema is authoritative.
- [ ] The `DecisionVerdict` ↔ ADR-1 canonical Role-result mapping that daimyo's DecisionProvider performs is documented as a relationship between this schema and the [[DGOS-T-0018]] `RoleResult` schema (the mapping logic stays in code; the schemas just need to make it expressible).
- [ ] TS bindings generated via the T-0013 pipeline; drift check passes.
- [ ] `valid/`/`invalid/` fixtures cover: a permission-surface request, a routing-surface request, each `DecisionVerdict.type`, and a DecisionRecord at a couple of tiers — run by the harness.

## Implementation Notes

### Technical Approach

- Start by reading `daimyo/src/core/domain.ts` (`DecisionRequest`, `DecisionVerdict`, `DecisionRecord`, `DecisionTier`, `Score0To10`) and treat it as the de-facto spec to formalize. Author JSON Schema that, when codegen'd, produces types daimyo can adopt with minimal churn.
- Model `Score0To10` faithfully (0–10 integer bound). Model the permission/routing split as a discriminated union keyed on `surface`.
- Where the initiative's older examples differ from daimyo's shipped shape, **prefer daimyo's shipped shape** (it's real, tested code) unless there's a concrete reason not to — and record the choice. The point of the representation decision was to make the protocol match reality, not re-litigate it.
- Do NOT modify daimyo here — that's [[DGOS-T-0019]]. This task only authors schema + fixtures + generated binding and records the reconciliation delta.

### Dependencies

- **Upstream:** [[DGOS-T-0013]] (pipeline/harness), [[DGOS-T-0014]] (envelope). Reads daimyo's shipped types.
- **Downstream:** [[DGOS-T-0018]] (RoleResult mapping relationship), [[DGOS-T-0019]] (applies the reconciliation to daimyo), [[DGOS-T-0020]] (compat/fixtures).

### Risk Considerations

- **Schema/daimyo mismatch** is the whole risk this task exists to manage. Mitigation: field-by-field reconciliation against `domain.ts`, daimyo's shape preferred, deltas recorded for T-0019.
- **Collapsing the two decision surfaces** would reintroduce the leak daimyo's design (and ADR-5) deliberately avoids. Mitigation: discriminated union + fixtures for both surfaces.
- **Over-fitting to stale initiative examples** instead of shipped code. Mitigation: shipped daimyo types are the reconciliation target.

### Execution Profile

**Recommended Agent: opus + high.** This is the primary reconciliation-of-shipped-code task: getting the decision schemas wrong forces churn through daimyo's DecisionProvider/supervisor (the most central runtime) in T-0019. The permission/routing split and the verdict shape are load-bearing and must match reality exactly.

## Status Updates

- 2026-05-23: Implemented protocol decision schemas and fixtures without modifying `daimyo`. Reconciliation deltas recorded in `protocol/README.md` for DGOS-T-0019:
  - `DecisionRequest.id` -> payload `decision_id`; `nodeId` -> `node_id`; `taskId` -> `task_id`; permission `toolName` -> `tool_name`.
  - `DecisionRequest` remains a discriminated union on `surface`; permission carries `tool_name` + `arguments`, routing carries the needs-decision prompt/context/options bubble.
  - `DecisionVerdict` preserves daimyo's minimal `type`, `suggested_choice`, `suggested_response`, `confidence`, `risk`, and `block_trigger` payload, with `Score0To10` modeled as `0..10`.
  - `DecisionRecord.id` -> payload `decision_id`; `createdAt` -> envelope `created_at`; `request`, `verdict`, `tier`, and `rationale` remain payload fields.
  - Verification from `protocol/`: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, and `npm run check:codegen` all passed.
- 2026-05-23 (orchestrator verification): re-ran typecheck/lint/test/build + check:codegen — all green (27 fixture tests). Fixtures confirmed for both decision surfaces (permission + routing), each `DecisionVerdict.type` (decision/access/human), tier-out-of-range + confidence-out-of-range invalids, and a `routing-with-permission-tool` invalid that enforces the surface split at the schema level. `DecisionVerdict` payload matches daimyo's exact minimal shape; tier constrained to 0–3. Reconciliation deltas (camelCase→snake_case, `id`→`decision_id`, `createdAt`→envelope `created_at`) recorded for DGOS-T-0019. No escape hatches. **exit_criteria_met: true.** Completed.