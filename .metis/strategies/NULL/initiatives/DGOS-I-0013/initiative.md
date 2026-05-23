---
id: protocol-proof-mvp
level: initiative
title: "Protocol Proof MVP"
short_code: "DGOS-I-0013"
created_at: 2026-05-21T17:47:46.081919+00:00
updated_at: 2026-05-23T23:30:16.281213+00:00
parent: DGOS-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/completed"


exit_criteria_met: false
estimated_complexity: M
strategy_id: NULL
initiative_id: protocol-proof-mvp
---

# Protocol Proof MVP Initiative

## Context

The vision still calls for a smallest-possible proof before the broader existing-repo flow is attempted. That constraint remains valid after the retro: prove one Role, one artifact, and one validation gate before scaling outward.

This initiative preserves that focus and acts as the architectural proof point.

## Goals & Non-Goals

**Goals:**
- Prove the Role invocation and artifact protocol thesis with the smallest realistic flow.
- Use one hand-authored Story as input and one validated architecture artifact as output.
- Exercise the MVP subset of `RoleInvocation` and `RoleResult`.
- Dogfood the result on a real Dev-Genie planning change.

**Non-Goals:**
- Prove the full recursive execution loop.
- Implement every Role or every artifact schema.
- Treat the proof as a substitute for the larger major-feature flow.

## Architecture

### Overview

The proof flow is: one Story -> one Architect Role invocation -> one `ArchitectureImpact` artifact -> one validation gate -> one dogfood application to a real planning change.

### Sequence Diagrams

Hand-authored Story prepared -> Architect Role invoked with MVP envelope -> `ArchitectureImpact` emitted -> validation passes or fails -> result is applied to a real Dev-Genie planning change.

## Detailed Design

The proof should stay intentionally narrow. The point is not feature breadth; it is proving that typed invocation, typed result, and validation-gated artifact flow work in practice.

Success should require clear evidence that:

- the Role can consume bounded context
- the artifact contract is sufficient
- validation can judge the result without prose-only interpretation
- the output is useful enough to dogfood on a real planning change

### Approved design direction (2026-05-23)

The proof is built on the two completed foundations (daimyo substrate, protocol schemas). Decisions:

- **`ArchitectureImpact` is a real protocol artifact** — authored in the `protocol` package as a new v1-catalog artifact type (JSON Schema source-of-truth + generated TS binding + fixtures, envelope `allOf` payload). The proof dogfoods the protocol rather than forking a proof-local shape; `protocol` gets a minor version bump.
- **Thin proof harness reusing daimyo + protocol, with a DIRECT Role runner.** A small dedicated package **`protocol-proof`** (sibling, depends on `daimyo` + `protocol`) reuses daimyo's structured-model-call engine + Validation built-in + the protocol types. The flow is a *direct Role runner* — `RoleInvocation → versioned Architect prompt → RoleResult whose output artifact is an ArchitectureImpact → validation gate` — and **does NOT use the recursive supervisor** (explicit non-goal). This Role-runner seam is the minimal version of what DGOS-I-0010 later generalizes.
- **Dogfood on the smallest self-referential slice** — run the proof to produce an ArchitectureImpact for a tiny real dev-genie planning step (e.g. the proof's own immediate next step), not coupled to another initiative's scope. Keeps the proof minimal per its non-goals.

Success evidence required (unchanged): the Role consumes bounded context; the typed invocation/result + ArchitectureImpact contract is sufficient; validation judges the result without prose-only interpretation; the output is useful enough to dogfood.

## Alternatives Considered

- Skip the proof and build the major-feature flow directly: rejected because too many moving parts would fail at once.
- Build a synthetic demo unrelated to real Dev-Genie work: rejected because dogfooding is part of the value of the proof.
- Expand the proof to multiple Roles immediately: rejected because the smallest stable slice is the goal.

## Implementation Plan

- [ ] Define the minimal Story input and `ArchitectureImpact` output contract.
- [ ] Implement the MVP subset of `RoleInvocation` and `RoleResult` needed for the proof.
- [ ] Add a validation gate for the proof artifact.
- [ ] Run the proof against a hand-authored Story.
- [ ] Dogfood the result on a real Dev-Genie planning change.

## Decomposition (decided 2026-05-23)

3 tasks. `ArchitectureImpact` → protocol; thin `protocol-proof` package + direct Role runner (no recursive supervisor); dogfood on smallest self-referential slice.

| Task | Title | Depends on | Agent |
|------|-------|-----------|-------|
| [[DGOS-T-0021]] | ArchitectureImpact artifact in `protocol` | — | opus + medium |
| [[DGOS-T-0022]] | Architect Role: versioned prompt + direct Role runner | T-0021 | opus + high |
| [[DGOS-T-0023]] | E2E proof harness + validation gate + dogfood run | T-0021, T-0022 | opus + medium |

**Critical path:** T-0021 → T-0022 → T-0023 (sequential). T-0022 is the keystone (the direct Role-runner seam I-0010 later generalizes).

## Outcome (2026-05-23)

**Completed — thesis deterministically proven; live dogfood deferred as an environment follow-up (decision-maker accepted).**

The proof validates the architectural thesis: `Story → typed RoleInvocation → ArchitectRoleRunner → typed RoleResult + ArchitectureImpact → structured ValidationReport`, reusing daimyo's structured-model-call engine + Validation built-in and the protocol schemas — with **no recursive supervisor** (the proof's non-goal). The validation gate judges via a structured `ValidationReport` (schema-valid + acceptance check), not prose. 7 deterministic tests (good→pass, bad-intent→fail, schema-invalid→fail) cover the wiring + gate.

**Caveat / follow-up:** the live model dogfood did not run — the direct structured-model-call client found no credential (`ANTHROPIC_AUTH_TOKEN`/`ANTHROPIC_BASE_URL` empty in spawned shells; the T-0001 spike worked only because the Agent SDK resolves Claude Code's own session). The model is known reachable, so this is an environment gap, not a design gap. To close it fully later: provide a real `ANTHROPIC_API_KEY` and run `PROTOCOL_PROOF_LIVE_SDK_TESTS=1 npm run dogfood:live` in `protocol-proof/` (the opt-in script, PROOF.md, and evidence stub are in place). Of the four success-evidence points, (1)–(3) are met deterministically; (4) "useful enough to dogfood" awaits the live run.

Also noted as minor debt: `protocol-proof/src/types/daimyo.d.ts` hand-declares `StructuredModelCallError` rather than consuming daimyo's exported type (DGOS-T-0022) — tidy up if daimyo's type exports are tightened.