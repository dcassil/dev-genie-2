---
id: test-task-low-pass
level: task-low-pass
title: "Test Task Low Pass"
short_code: "KAT-TL-8001"
subtype: null
parent: "KAT-US-8001"
story_id: "KAT-US-8001"
pass: low
model_tier: cheap
scaffold_task: "KAT-TH-8001"
created_at: 2026-05-09T18:04:00.000000+00:00
updated_at: 2026-05-09T18:04:00.000000+00:00
archived: false
phase: todo
tags:
  - "#task-low-pass"
  - "#phase/todo"
exit_criteria_met: false
blocked_by: []
strategy_id: null
initiative_id: null
---

## Parent User Story

[KAT-US-8001](./user-story.md) — Test User Story

## Scaffold Source

[KAT-TH-8001](./task-high-pass.md) — All scaffolded files, function signatures, and types are locked.

## Files to Implement

- `src/validate.ts` — Implement the `createValidator()` function and `TestValidator.validate()` method.

## Implementation Notes

- `createValidator()` — Factory function returning a TestValidator instance with working validate method.
- `TestValidator.validate()` — Method that validates document structure against schema rules.

## Test Hooks

Tests are located in `test/validate.test.ts`.

## Allowed Edits

**Allowlist:**
- Replace placeholder `throw new Error("TODO: implement (KAT-TL-8001)")` with working implementation.
- Add loop bodies and conditionals.
- Add private helper functions.

**Denylist (DO NOT CHANGE):**
- Function signatures.
- Exported names.
- JSDoc on exports.
- File path and structure.

## Acceptance

- [ ] Placeholder replaced with working implementation.
- [ ] Function signature unchanged.
- [ ] No new exported symbols.
- [ ] No new files created.
- [ ] All tests pass.
- [ ] Code passes linting.

## Cross-References

- Scaffold task: KAT-TH-8001
- Parent story: KAT-US-8001
