---
id: architectureimpact-artifact-in
level: task
title: "ArchitectureImpact Artifact in protocol"
short_code: "DGOS-T-0021"
created_at: 2026-05-23T22:55:25.000214+00:00
updated_at: 2026-05-23T23:02:50.709149+00:00
parent: DGOS-I-0013
blocked_by: []
archived: false

tags:
  - "#task"
  - "#phase/completed"


exit_criteria_met: false
strategy_id: NULL
initiative_id: DGOS-I-0013
---

# ArchitectureImpact Artifact in protocol

## Parent Initiative

[[DGOS-I-0013]] — the proof's output artifact. Per the approved design direction, `ArchitectureImpact` is a real protocol artifact (not proof-local), so the proof dogfoods the [[DGOS-I-0001]] protocol rather than forking it.

## Objective

Author **`ArchitectureImpact`** as a new artifact type in the `protocol` package: the typed output a single Architect Role invocation produces in the proof. It is the structured "what this Story implies architecturally" artifact that the proof's validation gate judges. Follow the exact pattern the v1 catalog established (JSON Schema source-of-truth + generated TS binding + valid/invalid fixtures, envelope `allOf` payload, run through the unified `npm test` gate).

## Acceptance Criteria

## Acceptance Criteria

## Acceptance Criteria

- [ ] A JSON Schema `schemas/architecture-impact.schema.json` defines `ArchitectureImpact` as an envelope-composed artifact (`allOf` [envelope + payload], refining `artifact_type` + `payload` only — the mechanism DGOS-T-0014 fixed).
- [ ] The payload captures a minimal-but-real architecture impact: at least a summary, affected/owned surfaces (reuse the ownership-surface sub-schema via `$ref` where appropriate), proposed changes or components, risks/tradeoffs, and any decisions/assumptions — machine-readable (structured, not a prose blob). Keep it the smallest shape that is genuinely useful for the proof's dogfood, documented.
- [ ] Generated TS binding via the codegen pipeline; `check:codegen` drift gate passes.
- [ ] `valid/` + `invalid/` fixtures for `ArchitectureImpact`, run by the harness; the unified `npm test` gate (validate-schemas + drift + compat + vitest) stays green.
- [ ] The compatibility baseline/manifest is updated for the new type, and `protocol` version is **minor-bumped** (new artifact type = additive surface change) per the rules DGOS-T-0014/T-0020 established.
- [ ] README updated: `ArchitectureImpact` added to the documented catalog.

## Implementation Notes

### Technical Approach

- Mirror an existing payload-bearing schema (e.g. `execution-record` / `validation-report`) for structure and the `allOf` composition; reuse the ownership-surface `$ref` for affected surfaces rather than inventing a parallel shape.
- Keep the payload minimal and proof-driven: it only needs the fields the Architect prompt can fill and the validation gate can check. Avoid speculative fields; document what was included and why.
- This is additive to the catalog → minor protocol bump; the compat classifier should classify it as backward-compatible (no existing schema changed).

### Dependencies

- **Upstream:** [[DGOS-I-0001]] protocol package (envelope, sub-schemas, codegen, fixture+compat gate) — all complete.
- **Downstream:** [[DGOS-T-0022]] (Role runner emits an `ArchitectureImpact`), [[DGOS-T-0023]] (validation gate checks it).

### Risk Considerations

- **Over-modeling:** a baroque ArchitectureImpact would slow the proof and overfit. Mitigation: smallest useful shape, documented; it can grow later.
- **Compat baseline drift:** forgetting the baseline/manifest update would break T-0020's gate. Mitigation: update baseline + minor-bump; run the unified gate.

### Execution Profile

**Recommended Agent: opus + medium.** A single additive schema following the now-well-established protocol pattern; the only real reasoning is choosing the smallest genuinely-useful payload shape and reusing the ownership sub-schema. Low risk, clear precedent.

## Status Updates

*To be added during implementation.*

- 2026-05-23: Added `ArchitectureImpact` to `protocol/` as an envelope-composed artifact schema with structured summary, affected/owned `OwnershipSurface` refs, proposed changes, risks, tradeoffs, decisions, and assumptions. Added valid/invalid fixtures, generated/exported TS bindings, updated README catalog docs with the DGOS-I-0013 proof consumer note, added compat baseline/manifest entries, and minor-bumped `protocol` package to 0.2.0 plus protocol manifest version to 1.1.0. Verification from `protocol/`: `npm run typecheck`, `npm run lint`, `npm test` (61 passed; compat 11 schemas, 0 changed), `npm run build`, and `npm run check:codegen` all clean.
- 2026-05-23 (orchestrator verification): re-ran the unified gate + check:codegen — green (61 tests, 11 schemas). ArchitectureImpact is envelope-composed (`allOf`, refines artifact_type+payload), reuses the ownership-surface sub-schema for affected surfaces, structured payload (no prose blob). Valid fixture `protocol-proof-architect-output.json` + a missing-affected-surfaces invalid. Additive surface → protocol minor-bumped 0.1.0→0.2.0; compat classifier saw 0 changed (backward-compatible). No escape hatches. **exit_criteria_met: true.** Completed.