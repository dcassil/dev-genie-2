---
id: validation-engine-and-gate-adapter
level: initiative
title: "Validation Engine and Gate Adapter Integration"
short_code: "DGOS-I-0007"
runtime_primitive: engine
created_at: 2026-05-19T16:57:20.660936+00:00
updated_at: 2026-05-19T16:57:20.660936+00:00
parent: DGOS-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/discovery"


exit_criteria_met: false
estimated_complexity: L
strategy_id: NULL
initiative_id: validation-engine-and-gate-adapter
---

# Validation Engine and Gate Adapter Integration Initiative

## Context

Katana has document gates. Guardrails has architecture and lint/type constraints. Audit has quality regression scoring. These should be coordinated through a deterministic Validation Engine so completion is decided mechanically and written to ValidationReport artifacts rather than accepted from Developer Execution Loop assertion.

## Goals & Non-Goals

**Goals:**
- Define a validation matrix per artifact/task type.
- Route lint, typecheck, tests, build, audit, dependency checks, document gates, and architecture rules.
- Store ValidationReport artifacts and feed failures back into execution loops.
- Keep Guardrails and Audit independently installable while making them callable from Katana.

**Non-Goals:**
- Replace project-specific CI.
- Require every repo to use every validator.
- Auto-fix validation failures outside the active task scope.

## Detailed Design

Validation profiles declare commands, required gates, optional checks, severity, retry behavior, and completion requirements. Katana invokes validators via adapters and writes a ValidationReport with command output summaries, pass/fail status, and actionable pointers.

Pre-commit rules from Audit and Guardrails should become reusable gate adapters where possible.

## Alternatives Considered

- Keep validation in package-specific commands only: rejected because the execution loop needs one completion decision.
- Trust test scripts from package.json blindly: rejected because some repos lack scripts or have incomplete coverage.
- Fail on absolute quality scores: rejected because existing repos need regression-based adoption.

## Implementation Plan

- [ ] Define ValidationReport and validation profile schemas.
- [ ] Add adapters for Katana gates, package scripts, Guardrails checks, and Audit scans.
- [ ] Feed validation failures into runLoop priorGateFailures.
- [ ] Add completion gates for task, story, and epic artifacts.
- [ ] Add pre-commit gate integration for protected branches, migration ranges, and lint/type rule edits.
