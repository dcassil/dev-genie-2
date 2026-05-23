---
id: executionrecord-validationreport
level: task
title: "ExecutionRecord & ValidationReport Schemas + TS Bindings"
short_code: "DGOS-T-0016"
created_at: 2026-05-23T18:56:08.414788+00:00
updated_at: 2026-05-23T20:02:32.604709+00:00
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

# ExecutionRecord & ValidationReport Schemas + TS Bindings

## Parent Initiative

[[DGOS-I-0001]] — defines two of the v1 catalog's execution-side artifacts: durable leaf execution evidence and the authoritative validation result used for completion decisions.

## Objective

Author the **`ExecutionRecord`** and **`ValidationReport`** typed payload schemas under the shared envelope, with generated TS bindings. `ExecutionRecord` is the durable execution evidence / write-back from leaf work; `ValidationReport` is the authoritative validation result a parent uses for completion (ADR-3's "parent verifies, never self-assertion"). Both must align with what `daimyo` already produces (its Validation built-in returns `{ status, reasons, report_ref }` and persists reports; its execution store holds evidence) so the reconciliation in [[DGOS-T-0019]] is minimal.

## Acceptance Criteria

## Acceptance Criteria

## Acceptance Criteria

- [ ] **`ExecutionRecord`** schema: typed payload under the envelope capturing durable execution evidence — at minimum a summary, touched-surface reference (via the [[DGOS-T-0015]] touch-report sub-schema), produced artifact refs, and the fields daimyo's execution evidence already carries. Documented required vs optional.
- [ ] **`ValidationReport`** schema: typed payload capturing `status` (pass/fail), `reasons`, a report reference, the validation scope (leaf vs parent — ADR-3's one-engine-two-scopes), and an indication of evidence strength (e.g. command-result vs model-fallback, which daimyo's built-in distinguishes).
- [ ] Both extend the shared envelope from [[DGOS-T-0014]] (carry `artifact_id`, `schema_version`, `producer`, `confidence`, etc.) rather than redefining envelope fields.
- [ ] `ValidationReport` makes completion machine-judgable without prose interpretation (the initiative's stated requirement and ADR-3's invariant): a parent can decide completion from the structured result.
- [ ] TS bindings generated via the T-0013 pipeline; drift check passes.
- [ ] `valid/`/`invalid/` fixtures for both types (including a leaf-scope and a parent-scope ValidationReport, and a pass and a fail), run by the harness.
- [ ] Field shapes cross-checked against daimyo's Validation result type and execution-evidence type; divergences recorded for [[DGOS-T-0019]] (schema authoritative).

## Implementation Notes

### Technical Approach

- Read daimyo's Validation built-in (`daimyo/src/validation`) and execution-store evidence types to mirror field names/semantics; the schema is authoritative but should not gratuitously diverge.
- `ExecutionRecord` references the touch-report sub-schema from [[DGOS-T-0015]] for touched surfaces; `ValidationReport` references the scope concept used by daimyo's Validation port.
- Keep both as typed payloads composed onto the [[DGOS-T-0014]] envelope using the composition mechanism that task fixed.

### Dependencies

- **Upstream:** [[DGOS-T-0013]] (pipeline/harness), [[DGOS-T-0014]] (envelope), [[DGOS-T-0015]] (touch-report sub-schema for ExecutionRecord).
- **Downstream:** [[DGOS-T-0019]] (daimyo conforms its Validation/evidence types), [[DGOS-T-0020]] (compat + fixture corpus).

### Risk Considerations

- **Divergence from daimyo's Validation result** would force awkward adapters in T-0019. Mitigation: mirror daimyo's field semantics; record intentional divergences.
- **ValidationReport too weak to gate completion** would break ADR-3's invariant downstream. Mitigation: ensure the structured result fully determines pass/fail + scope without prose.

### Execution Profile

**Recommended Agent: opus + medium.** Two well-scoped payload schemas extending a fixed envelope, with clear daimyo precedents to mirror; multi-file but pattern-following, with the only reasoning being faithful alignment to daimyo + the completion-judgability requirement.

## Status Updates

*To be added during implementation.*

- 2026-05-23: Added envelope-composed `ExecutionRecord` and `ValidationReport` schemas under `protocol/schemas/`, with fixtures and generated TS bindings. Daimyo divergences recorded in `protocol/README.md` for T-0019: structured `produced_artifact_refs` replaces string `artifacts`; touched surfaces move into required `touch_report` including workflow steps; task/node timestamps use protocol snake_case/envelope fields; durable `ValidationReport` requires scope/evidence/details/completion decision beyond daimyo's returned `{ status, reasons, report_ref }`; `completion_decision` is new and required for ADR-3 machine-judgable parent completion.
- 2026-05-23 (orchestrator verification): re-ran typecheck/lint/test/build + check:codegen — all green (45 fixture tests). Both schemas extend the envelope via `allOf` (refine `artifact_type` + `payload` only). ExecutionRecord `$ref`s the touch-report sub-schema. ValidationReport carries status/reasons/report_ref/scope/evidence_strength + structured `completion_decision`; completion is machine-judgable (only `scope:parent`+`status:pass` ⇒ `can_mark_complete:true`, enforced by the `parent-pass-not-completable` invalid fixture). **Full v1 catalog now complete (10 schemas).** Divergences for T-0019 recorded (incl. the new `completion_decision` authority daimyo must emit). No escape hatches. **exit_criteria_met: true.** Completed.