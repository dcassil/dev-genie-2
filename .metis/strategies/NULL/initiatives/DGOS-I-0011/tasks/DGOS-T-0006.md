---
id: validation-port-command-runner
level: task
title: "Validation Port & Command-Runner Built-In"
short_code: "DGOS-T-0006"
created_at: 2026-05-22T17:53:52.040775+00:00
updated_at: 2026-05-22T21:05:33.263947+00:00
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

# Validation Port & Command-Runner Built-In

## Parent Initiative

[[DGOS-I-0011]] — implements one of the two *required* capability ports from [[DGOS-A-0005]]. Validation **is** ADR-3's "parent verifies, never self-assertion" invariant made executable.

## Objective

Implement the **Validation capability port** and its **trivial standalone built-in**: run the task's declared command (lint/test/build) and check the exit code; if the task declares no command, fall back to a single bounded model call that returns an acceptance check `{ pass, fail, reasons }`. This is what an inner node uses to authoritatively verify a child's `done` claim, so completion is justified by evidence rather than the child's assertion.

## Acceptance Criteria

- [ ] A `Validation` port is defined (from the interface stub in [[DGOS-T-0002]]): given a task + its scope/evidence, return a structured result `{ status: pass | fail, reasons, report_ref }`.
- [ ] **Command-runner built-in:** when the task declares a validation command, run it via the shell-runner engine primitive ([[DGOS-T-0002]]), capture exit code + stdout/stderr, map exit 0 → pass and non-zero → fail, and persist a report the inner node can reference as authoritative evidence.
- [ ] **Model-call acceptance fallback:** when no command is declared, call the structured-model-call client with the task's acceptance criteria + the produced work/evidence and return `{ pass, fail, reasons }`; the fallback is clearly marked as weaker evidence than a command result.
- [ ] The result distinguishes **leaf-scope** (fast, narrow, the leaf's own changes) from **parent-scope** (authoritative, full owned surface) validation, since ADR-3 uses one engine at two scopes; the port accepts a scope parameter and the loop decides which to invoke.
- [ ] `exit_criteria_met`-style completion in the loop is driven by the **parent-scope** validation result, never a child claim (verified by a test where a child claims `done` but parent validation fails → node does not complete).
- [ ] The built-in is dependency-light and ships in the standalone `daimyo` package; the richer dev-genie Validation Engine (audit composite scores + guardrails gates + baselines) is an **injected adapter**, explicitly out of scope here but the port must accommodate it.
- [ ] Unit tests cover: command pass, command fail (non-zero exit), no-command model fallback pass, model fallback fail, and the child-claims-done-but-parent-fails case.

## Implementation Notes

### Technical Approach

- Build on the shell-runner and structured-model-call primitives from [[DGOS-T-0002]]; this task is mostly composition + result mapping + report persistence, not new infrastructure.
- Persist validation reports into the execution store ([[DGOS-T-0003]]) or as report files referenced by `report_ref`, so parent verification leaves a durable audit trail (ADR-1 observability: completion justified by artifacts/gates).
- Keep the port shape identical for built-in and injected adapter so dev-genie's Validation Engine drops in without loop changes.
- The model fallback must use a fixed, small payload (acceptance criteria + evidence) and return strictly typed JSON — no free-form prose pass/fail.

### Dependencies

- **Upstream:** [[DGOS-T-0002]] (Validation port stub + shell-runner + model-call primitives), [[DGOS-T-0003]] (where reports/evidence are persisted).
- **Downstream:** [[DGOS-T-0008]] (inner-node authoritative validation calls this), [[DGOS-T-0011]] (parent-scope validation across multi-child waves).

### Risk Considerations

- **Model fallback over-trusted:** an LLM acceptance check is softer than a command exit code. Mitigation: mark it explicitly as lower-confidence evidence and prefer declared commands; document this in the port.
- **Scope confusion:** running leaf-scope validation where parent-scope is required would let weak checks gate completion. Mitigation: scope is an explicit parameter and the completion path requires parent-scope.
- **Flaky commands:** non-deterministic test/lint commands produce flaky validation. Mitigation: surface stderr/exit detail in `reasons` so flakiness is diagnosable; retry policy lives in the loop, not here.

### Execution Profile

**Recommended Agent: opus + medium.** Substantive integration work (port + two evaluation strategies + report persistence + the completion-authority invariant) that composes existing primitives along a known pattern. It touches several files and carries the load-bearing "parent verifies" rule, but the design is fully specified, so medium rather than high.

## Status Updates

### 2026-05-22 — Validation port + command-runner built-in complete (via Codex gpt-5.5)

`Validation` port now takes `scope: "leaf" | "parent"` and returns `{ status: pass|fail, reasons, report_ref }`. Built-in lives in `daimyo/src/validation/` (outside core). Command-runner path uses the shell-runner primitive (exit 0 → pass, non-zero → fail, stdout/stderr in reasons) and persists reports into the `ExecutionStore` (`validationReportRefs` on nodes; evidence carries `report_ref`). No-command path falls back to the structured-model-call client and tags the result `model_fallback` as weaker evidence. Declared command read from `task.metadata.validation_command`/`validationCommand`.

**Orchestrator verification:** re-ran typecheck/lint/test/build — all green (27 passed / 5 live-skipped; 5 new validation tests: command pass, command fail, model-fallback pass/fail, and child-claims-done-but-parent-scope-fails for the completion-authority invariant). No regressions in prior execution-store/work-source suites despite the cross-cutting domain/store edits. `src/core` confirmed import-pure. Version 0.4.0 → 0.5.0. No escape hatches. **exit_criteria_met: true.** Completed.