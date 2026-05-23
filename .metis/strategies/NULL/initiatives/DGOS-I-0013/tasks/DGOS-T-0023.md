---
id: end-to-end-proof-harness
level: task
title: "End-to-End Proof Harness, Validation Gate & Dogfood Run"
short_code: "DGOS-T-0023"
created_at: 2026-05-23T22:55:27.072758+00:00
updated_at: 2026-05-23T22:55:27.072758+00:00
parent: DGOS-I-0013
blocked_by: []
archived: false

tags:
  - "#task"
  - "#phase/todo"


exit_criteria_met: false
strategy_id: NULL
initiative_id: DGOS-I-0013
---

# End-to-End Proof Harness, Validation Gate & Dogfood Run

## Parent Initiative

[[DGOS-I-0013]] — closes the proof: wire the full flow, gate the artifact with validation, run it for real, dogfood it, and record whether the thesis holds.

## Objective

Complete the proof end to end in the `protocol-proof` package: a **hand-authored input Story** → the [[DGOS-T-0022]] direct Role runner → a **validation gate** (reusing daimyo's Validation built-in) that judges the produced `ArchitectureImpact` **without prose-only interpretation** → a **real dogfood run** on the smallest self-referential planning slice → a recorded verdict on the four success-evidence points the initiative requires. This is what turns the pieces into an actual proof that typed invocation, typed result, and validation-gated artifact flow work in practice.

## Acceptance Criteria

- [ ] A **hand-authored Story** input exists (committed in the package, e.g. a markdown/JSON Story), small and realistic — the single input the proof consumes.
- [ ] The harness wires the full flow: Story → `RoleInvocation` → Role runner ([[DGOS-T-0022]]) → `RoleResult` + `ArchitectureImpact` → **validation gate**.
- [ ] The **validation gate reuses daimyo's Validation built-in**: it checks (a) the `ArchitectureImpact` is schema-valid against the protocol, and (b) an acceptance check (command and/or bounded model-call) judges whether the artifact satisfies the Story's intent — producing a structured `ValidationReport` (pass/fail), **not a prose verdict**. A failing artifact yields a fail; a good one yields a pass.
- [ ] A **dogfood run** is executed against the smallest self-referential slice (e.g. produce an `ArchitectureImpact` for the proof's own immediate next planning step), using the live model via the gateway credentials. The produced artifact + ValidationReport are captured as committed evidence in the package.
- [ ] A short **proof writeup** records the four required evidence points with reference to the captured run: (1) the Role consumed bounded context; (2) the typed invocation/result + ArchitectureImpact contract was sufficient; (3) validation judged the result without prose-only interpretation; (4) the output was useful enough to dogfood. If any point fails, that is itself a valid, recorded finding (do not fake success).
- [ ] Deterministic unit/integration tests (fake model client) cover the wiring + gate (good artifact → pass, bad artifact → fail); live dogfood is separate and not a hard CI gate (guard it like daimyo's opt-in live tests).
- [ ] `npm run typecheck`/`lint`/`test`/`build` clean from `protocol-proof/`; protocol-proof version set/bumped as appropriate. No escape hatches.

## Implementation Notes

### Technical Approach

- Reuse daimyo's Validation built-in for the gate (command-runner and/or model-fallback acceptance check) so the proof exercises the real Validation path, and emit a protocol `ValidationReport`. Schema-validity check uses the protocol's Ajv validation.
- Keep the live dogfood run behind an opt-in flag (mirror daimyo's `DAIMYO_LIVE_SDK_TESTS` pattern) so the default suite stays deterministic; commit the captured artifact + report from a real run as evidence.
- For the dogfood target, pick a genuinely small self-referential slice so the proof stays minimal (per the initiative's non-goals) — e.g. the ArchitectureImpact for the proof's own next step or a trivial dev-genie planning tweak.
- The proof writeup lives in the package (README or a `PROOF.md`) and references the committed evidence files.

### Dependencies

- **Upstream:** [[DGOS-T-0021]] (ArchitectureImpact schema), [[DGOS-T-0022]] (Role runner + Architect prompt), [[DGOS-I-0011]] daimyo (Validation built-in).
- **Downstream:** none — this closes the initiative. The result informs the DGOS-A-0005 review trigger and future Roles work (DGOS-I-0010).

### Risk Considerations

- **Faked success:** the temptation to declare the thesis proven without a real run. Mitigation: a committed live-run artifact + ValidationReport is required evidence; a negative finding is acceptable and must be recorded honestly.
- **Prose-only validation** creeping in. Mitigation: the gate must emit a structured ValidationReport (schema-valid + acceptance), not a prose judgment.
- **Dogfood scope creep** coupling the proof to a big planning change. Mitigation: smallest self-referential slice.

### Execution Profile

**Recommended Agent: opus + medium.** Integration + wiring of already-built pieces (runner, ArchitectureImpact schema, daimyo Validation) into an end-to-end gated flow, plus a real dogfood run and an honest evidence writeup. Substantive but pattern-following; the design decisions are settled upstream.

## Status Updates

*To be added during implementation.*
