---
name: katana-work
description: Work a Katana task from todo to active to completed when the user asks to start, execute, or finish a Katana task.
---

# Katana Work

Drive a Katana task through implementation.

Workflow:

1. Use `mcp__katana__read_document` on the task short code. Read the goal, deliverables, contracts, do/don't rules, and acceptance criteria.
2. If the phase is `todo`, call `mcp__katana__transition_phase` to advance it to `active`.
3. Implement the task deliverables in the host repo.
4. Honor high-pass and low-pass task boundaries:
   - `task-high-pass`: write scaffolds, contracts, types, interfaces, and comments, not full implementation.
   - `task-low-pass`: fill the implementation against the scaffold referenced by `scaffold_task`.
5. Run the repo's relevant tests, lints, and type checks.
6. When acceptance criteria are met, call `mcp__katana__transition_phase` again to advance the task to `completed`.
7. Report what changed with file references.

If the task body contains template placeholders or unclear scope, surface the gap to the user instead of guessing.
