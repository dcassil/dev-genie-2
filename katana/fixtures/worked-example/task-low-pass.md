---
id: filter-impl-low
level: task-low-pass
title: "Implement applyFilter() Body"
short_code: "KAT-TL-9001"
subtype: null
parent: "KAT-US-9001"
story_id: "KAT-US-9001"
pass: low
model_tier: cheap
scaffold_task: "KAT-TH-9001"
created_at: 2026-05-09T16:34:00.000000+00:00
updated_at: 2026-05-09T16:34:00.000000+00:00
archived: false
tags:
  - "#task-low-pass"
  - "#phase/todo"
exit_criteria_met: false
blocked_by: []
strategy_id: null
initiative_id: null
---

## Parent User Story

[KAT-US-9001](./user-story.md) — Define applyFilter() Interface Contract

## Scaffold Source

[KAT-TH-9001](./task-high-pass.md) — All scaffolded files, function signatures, interface definitions, and type contracts are locked. You must not modify these.

## Files to Implement

- `src/filter.ts` — Implement the `applyFilter()` function body to filter records by field-value criterion.

## Implementation Notes

- `applyFilter(records, filterKey, filterValue)` — Iterate over the records array. For each record, check if `record[filterKey] === filterValue`. If true, include it in the result. Return the filtered array. Handle the case where `filterKey` does not exist on a record (treated as no match, so excluded from results). Use strict equality (`===`) for comparison.

## Test Hooks

Tests and fixtures are located in `test/filter.test.ts`. The implementation must pass all test suites in that directory.

## Allowed Edits

**Allowlist:**
- Replace the placeholder `throw new Error("TODO: implement (KAT-TL-9001)")` with working implementation logic.
- Add loop bodies, conditionals, and variable assignments within `applyFilter`.
- Add private helper functions (static functions within the module, not exported).

**Denylist (DO NOT CHANGE):**
- Function signature: `(records: Record<string, any>[], filterKey: string, filterValue: any) => Record<string, any>[]`.
- Exported `applyFilter` function name.
- JSDoc comment on `applyFilter`.
- File path `src/filter.ts`.
- File name and structure.
- No new files may be created.

## Acceptance

- [ ] The placeholder `throw new Error("TODO: implement (KAT-TL-9001)")` has been replaced with working implementation.
- [ ] The function signature has not changed.
- [ ] No new exported symbols have been added.
- [ ] No new files have been created.
- [ ] The implementation correctly filters records by `filterKey === filterValue`.
- [ ] Records where `filterKey` does not exist are excluded from results.
- [ ] All test suites in `test/filter.test.ts` pass.
- [ ] Code passes linting (if applicable).

## Cross-References

- Scaffold task: KAT-TH-9001
- Parent story: KAT-US-9001
