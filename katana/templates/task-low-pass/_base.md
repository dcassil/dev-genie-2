---
id: {{id}}
level: task-low-pass
title: "{{title}}"
short_code: "{{short_code}}"
subtype: null
parent: {{parent}}
story_id: {{story_id}}
pass: low
model_tier: cheap
scaffold_task: {{scaffold_task}}
created_at: {{created_at}}
updated_at: {{updated_at}}
archived: false
phase: {{phase}}
tags:
  - "#task-low-pass"
  - "#phase/{{phase}}"
exit_criteria_met: false
blocked_by: []
strategy_id: {{strategy_id}}
initiative_id: {{initiative_id}}
---

## Parent User Story

_One-line link to the parent user story. Do not restate the story._

[{{parent}}]

## Scaffold Source

_All files, exports, signatures, and types are defined by the high-pass task below. Make no changes to these._

[{{scaffold_task}}](../task-high-pass/_base.md) — All scaffolded files, function signatures, interface definitions, and type contracts are locked. You must not modify these.

## Files to Implement

_Relative paths and which exported symbols need implementation. Copy directly from high-pass task's "Files to Create or Modify"._

- `path/to/file.ts` — List of exported functions/constants with placeholder bodies to implement.

## Implementation Notes

_Short, scoped guidance per file or per symbol. No new architecture._

- `functionName()` — Brief explanation of what this function should do, inputs expected, outputs required.
- `ConstantName` — Brief explanation of the constant's purpose and expected value or structure.

## Test Hooks

_OPTIONAL. Pointer to test files or fixtures the implementation must satisfy._

Tests and fixtures are located in `path/to/tests/`. The implementation must pass all test suites in that directory.

## Allowed Edits

_Explicit allowlist and explicit denylist._

**Allowlist:**
- Function bodies (replace `throw new Error("TODO: ...")` with implementation).
- Private helper functions within scaffolded files (keep them local, do not export).
- `const` initializers and computed values for constants and enums.
- Loop bodies, conditionals, and all internal control flow.

**Denylist (DO NOT CHANGE):**
- Function signatures (parameter names, types, return types).
- Exported interface or type definitions.
- Export statements (`export const`, `export interface`, `export function`, `export class`).
- JSDoc comments on exported symbols.
- File structure and file names.
- Creation of new files (all files come from {{scaffold_task}}).

## Acceptance

_Checklist: every placeholder body replaced; no signature or export changed; no new files created; tests/lint pass._

- [ ] All function bodies that used `throw new Error("TODO: ...")` are replaced with working implementation.
- [ ] All exported symbols (functions, interfaces, constants) remain unchanged from the scaffold.
- [ ] No new files have been created.
- [ ] No function signature, parameter type, or return type has been modified.
- [ ] No exported interface or type definition has been modified.
- [ ] All tests pass (if test hooks are defined).
- [ ] Code passes linting (if applicable).

## Cross-References

_Short codes only._

- Scaffold task: {{scaffold_task}}
- Parent story: {{parent}}
