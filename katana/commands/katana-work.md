---
name: katana-work
description: Start working a katana task — read it, transition to active, implement the changes
argument-hint: <task-short-code>
---

Drive task $ARGUMENTS from `todo` through `active` to `completed`:

1. `mcp__katana__read_document` on the short code. Read the goal, deliverables, contracts, do/don't, acceptance criteria.
2. If phase is `todo`, call `mcp__katana__transition_phase` to advance to `active`.
3. Implement the task's deliverables in the host repo. Honor the do/don't rules. For `task-high-pass`, write scaffolds + contracts + JSDoc, not implementations. For `task-low-pass`, fill the implementation against the scaffold referenced by `scaffold_task`.
4. Run tests / lints / type checks per the repo's conventions.
5. When acceptance criteria are met, call `mcp__katana__transition_phase` again to advance to `completed`.
6. Report what changed, citing file paths with line numbers.

If the task body contains template placeholders or unclear scope, surface the gap to the user instead of guessing.
