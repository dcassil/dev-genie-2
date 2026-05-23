---
id: shared-artifact-envelope
level: task
title: "Shared Artifact Envelope & Versioning/Compatibility Rules"
short_code: "DGOS-T-0014"
created_at: 2026-05-23T18:56:06.320030+00:00
updated_at: 2026-05-23T18:56:06.320030+00:00
parent: DGOS-I-0001
blocked_by: []
archived: false

tags:
  - "#task"
  - "#phase/todo"


exit_criteria_met: false
strategy_id: NULL
initiative_id: DGOS-I-0001
---

# Shared Artifact Envelope & Versioning/Compatibility Rules

## Parent Initiative

[[DGOS-I-0001]] — defines the one shared envelope every typed artifact payload sits inside, plus the versioning and compatibility rules that let producers evolve without breaking consumers.

## Objective

Author the **shared artifact envelope** JSON Schema (the cross-primitive fields every artifact carries) and the **versioning + compatibility rules** (`schema_version` for per-type evolution, `protocol_version` for cross-artifact compatibility), plus content-hash/provenance conventions. This is the contract substrate that the concrete artifact types (T-0015–T-0018) extend with typed payload bodies, exactly as the initiative's approved design direction specifies.

## Acceptance Criteria

- [ ] A JSON Schema for the shared envelope defines the required cross-primitive fields from the initiative: `artifact_id`, `artifact_type`, `schema_version`, `protocol_version`, `producer`, `created_at`, `source_refs`, `output_refs`, `ownership`, `confidence`, `review_required`, `diagnostics` — each with a documented type and whether it is required vs optional.
- [ ] The envelope is composable: a concrete artifact type provides a typed `payload` body under the shared envelope (via `$ref`/`allOf` or the chosen composition mechanism), so T-0015–T-0018 add only their payload schema, not envelope fields.
- [ ] **`schema_version` vs `protocol_version` rules are written and machine-checkable in spirit:** `schema_version` versions a single artifact type's payload schema; `protocol_version` versions the envelope + cross-artifact compatibility expectations. Document what a producer/consumer may assume across each.
- [ ] **Content-hash + provenance conventions** are defined: how `artifact_id` relates to content hashing, what `source_refs`/`output_refs` reference (ids + optional hashes), and the expectations strong enough for validation, diffing, supersession, and replay (the initiative's stated needs).
- [ ] `confidence`, `review_required`, and the diagnostics shape are machine-readable (not prose) so completion/skip/missing-context signals are consumable by the Loop and Validation.
- [ ] The TS binding for the envelope is generated from the schema (via the T-0013 pipeline) and the drift check passes.
- [ ] `valid/` and `invalid/` fixtures exercise the envelope (missing required field fails; well-formed envelope passes), run by the T-0013 harness.
- [ ] No concrete artifact payloads are defined here (those are downstream); a minimal placeholder payload may be used in fixtures, clearly marked.

## Implementation Notes

### Technical Approach

- Model the envelope as a base schema that concrete types reference; prefer `allOf` [envelope + type-specific payload] or a `payload` property whose schema is selected by `artifact_type` (document the chosen pattern so downstream tasks follow it consistently).
- Keep `ownership` here as a `$ref` to the ownership sub-schema that [[DGOS-T-0015]] authors (forward-reference is fine; the envelope references it, T-0015 fills it). Coordinate the `$ref` path with T-0015.
- Define versioning as explicit fields plus written rules; the enforcement *tests* (compat/back-compat) live in [[DGOS-T-0020]] — this task defines the rules and fields they will check.
- Align field names/semantics with what `daimyo` already emits (it has `DecisionRecord`, evidence, confidence/risk scores) so the [[DGOS-T-0019]] reconciliation is minimal — but the schema is authoritative where they differ; record any divergence for T-0019 to resolve.

### Dependencies

- **Upstream:** [[DGOS-T-0013]] (package, codegen, fixture harness).
- **Downstream:** [[DGOS-T-0015]] (ownership/touch sub-schemas referenced by `ownership`), [[DGOS-T-0016]]/[[DGOS-T-0017]]/[[DGOS-T-0018]] (payloads extend this envelope), [[DGOS-T-0020]] (compat rules enforced), [[DGOS-T-0019]] (daimyo conforms).

### Risk Considerations

- **Envelope churn:** if envelope fields change after downstream payloads are authored, every type re-bases. Mitigation: get the field set + composition mechanism right here (it's why this is opus + high) and freeze it before T-0016+ start.
- **Weak versioning rules** reintroduce the prose-parsing/weak-contract failure the initiative exists to prevent. Mitigation: make `schema_version`/`protocol_version` semantics explicit and testable by T-0020.
- **Hash/provenance under-specified** breaks supersession/replay (which daimyo's reconciliation + checkpoint logic rely on). Mitigation: define hashing/refs concretely, validated by fixtures.

### Execution Profile

**Recommended Agent: opus + high.** The envelope + versioning rules are the contract substrate every other artifact type and both downstream consumers (daimyo, future Engines/Roles) depend on; a wrong field set or composition mechanism forces re-basing across the whole catalog.

## Status Updates

*To be added during implementation.*
