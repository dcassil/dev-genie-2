---
id: protocol-proof-mvp-one-role-one
level: initiative
title: "Protocol Proof MVP — One Role, One Artifact, One Gate"
short_code: "DGOS-I-0031"
runtime_primitive: protocol
created_at: 2026-05-19T20:06:52.773946+00:00
updated_at: 2026-05-19T20:06:52.773946+00:00
parent: DGOS-V-0001
blocked_by:
  - DGOS-I-0002
  - DGOS-A-0002
archived: false

tags:
  - "#initiative"
  - "#phase/discovery"


exit_criteria_met: false
estimated_complexity: M
strategy_id: NULL
initiative_id: protocol-proof-mvp-one-role-one
---

# Protocol Proof MVP — One Role, One Artifact, One Gate Initiative

## Context

The current "Existing Repo Major Feature MVP Flow" is too broad to be the first proof. It requires artifact protocol, repo intelligence, strategy/planning, architecture, FE/BE planning, project management, developer execution, and validation before the system learns whether the core artifact-protocol thesis works.

This initiative proves the smallest end-to-end version of that thesis: one Role consumes one structured input artifact, produces one structured output artifact, and one gate validates that output well enough for a real repo decision.

This is the v0.1 proof point before the broader v0.5 flow in DGOS-I-0008. It is blocked only by the minimal artifact protocol subset from DGOS-I-0002 and the Role invocation convention in DGOS-A-0002.

## Goals & Non-Goals

**Goals:**
- Pick one Role: Architect. Architect has high leverage, a bounded responsibility, and a cleaner output contract than Planner.
- Pick one input artifact: a hand-authored Story.
- Produce one output artifact: ArchitectureImpact.
- Validate with one gate: artifact metadata completeness plus reviewer rubric.
- Dogfood the proof by using it to plan a real change to this repository.
- Keep the implementation small enough to expose protocol flaws quickly.

**Non-Goals:**
- Full strategy or planner pipeline.
- Multi-role handoff.
- Developer execution loop.
- Multi-agent waves.
- Full Document Engine implementation.
- Full ArchitectureImpact schema.
- Full user-facing workflow UI.

## Detailed Design

### Hand-Authored Story

The v0.1 input is a markdown/YAML Story file created by a human or a test fixture. It must contain:

- stable id
- title
- problem statement
- desired behavior
- acceptance criteria
- constraints
- known affected areas, if any
- source request text
- human review notes, if any

This avoids needing Planner for v0.1 while still giving Architect a realistic artifact to consume.

### Architect Invocation

The Orchestrator or a thin proof CLI invokes the Architect Role through DGOS-A-0002:

```bash
dev-genie role invoke architect --input <RoleInvocation.json> --output <RoleResult.json>
```

For v0.1, the invocation can be implemented by a local proof runner or fake adapter, but it must use the real `RoleInvocation` and `RoleResult` envelope shape. It must not rely on prose parsing.

### ArchitectureImpact Schema Subset

The v0.1 ArchitectureImpact artifact must include:

- id
- source_story_ref
- source_story_hash
- role_invocation_ref
- status: `produced`, `skipped`, `blocked`, `needs_human`, or `failed`
- summary
- affected_packages
- affected_files_or_globs
- architectural_concerns
- constraints
- decisions_needed
- validation_implications
- implementation_notes
- confidence
- missing_context
- human_review_required
- author_role: `architect`
- created_at
- artifact_schema_version

This is a subset of DGOS-I-0002's broader artifact protocol. The subset should be deliberately small and stable.

### Single Validation Gate

The v0.1 gate validates:

- required metadata is present
- `source_story_hash` matches the input Story
- `role_invocation_ref` exists
- status is valid
- confidence is present and in range
- missing context is an explicit list
- affected surfaces are either populated or explicitly marked unknown with a reason
- reviewer rubric is completed

Reviewer rubric:

- Is the impact grounded in the Story?
- Are affected repo areas plausible?
- Are decisions needed clearly separated from implementation notes?
- Are validation implications actionable?
- Would this help a developer or planner make the next decision?

### Dogfood Scenario

Dogfood this proof on a real Dev-Genie repo change. Recommended first dogfood target:

- Story: define where `RoleInvocation` and `RoleResult` schemas live and how the proof runner records invocation traces.
- Architect Role output: ArchitectureImpact for schema placement, package ownership, validation gate placement, and follow-up risks.
- Gate: validate the ArchitectureImpact before using it to create the next implementation task.

## Alternatives Considered

- Keep DGOS-I-0008 as the MVP: rejected because it is too large to learn from quickly and has too many co-dependent primitives.
- Pick Planner as the proof Role: rejected because Planner outputs are softer, more subjective, and harder to validate than ArchitectureImpact.
- Start with Developer execution: rejected because code mutation, validation recovery, and task completion semantics are not needed to prove artifact handoff.
- Start with Repo Intelligence: rejected because a deterministic Engine alone does not prove the Role invocation and artifact handoff thesis.

## Implementation Plan

- [ ] Define the minimal hand-authored Story fixture format.
- [ ] Define the minimal `RoleInvocation` and `RoleResult` envelope fields required for Architect.
- [ ] Define the ArchitectureImpact schema subset.
- [ ] Implement or fake the local Architect Role runner using the DGOS-A-0002 convention.
- [ ] Implement the single ArchitectureImpact validation gate.
- [ ] Add a fixture test that runs Story -> Architect Role -> ArchitectureImpact -> validation gate.
- [ ] Create the dogfood Story for schema placement and trace recording.
- [ ] Run the proof against the dogfood Story.
- [ ] Use the validated ArchitectureImpact to create the next implementation task or initiative update.

## Recommended Agent

Use `opus` or equivalent frontier model with high reasoning for the Architect Role during the dogfood run. The implementation itself should be deterministic and testable without requiring that model.

## Exit Criteria

- A hand-authored Story fixture exists.
- An Architect invocation consumes that Story through a `RoleInvocation` envelope.
- A valid ArchitectureImpact is produced through a `RoleResult` envelope.
- One validation gate accepts valid output and rejects malformed output.
- The proof is dogfooded on a real Dev-Genie repo planning change.
- Findings are recorded back into DGOS-I-0002, DGOS-A-0002, or follow-up initiatives as needed.
