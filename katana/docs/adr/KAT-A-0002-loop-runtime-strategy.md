# KAT-A-0002 — Loop Runtime Strategy

## Status
Accepted (2026-05-09)

## Context
Initiative KAT-I-0003 calls for a work → eval → gate → loop → done runtime
per task. The metis-ralph plugin (commands at
/Users/danielcassil/plugins/metis/plugins/metis/commands/metis-ralph.md and
sibling -tasks / -initiative variants) already runs Ralph-style loops over
metis tasks. We considered reusing it as the runtime.

## Options
1. Reuse metis-ralph as the runtime (call its slash commands from katana).
2. Wrap metis-ralph (thin adapter — call its setup script, hand it a katana doc).
3. Build our own loop runtime (`src/workflow/loop.ts`).

## Decision
Option 3 — build our own.

## Rationale
- metis-ralph is a Claude-Code-only slash command that depends on
  `mcp__metis__*` tools. Katana ships its own MCP surface
  (KAT-A-0001, src/mcp/tools/schemas.ts) and must run on Cursor /
  Codex / OpenAI per vision Constraints.
- metis-ralph hardcodes the work step prompt and uses metis frontmatter
  shape (no `pass`, no `model_tier`, no `scaffold_task`); our two-pass model
  needs first-class engine support (see KAT-T-0104 handoff).
- metis-ralph's eval step is "agent self-asserts <promise>TASK COMPLETE</promise>".
  We need mechanical eval via the gate engine (KAT-I-0002 / KAT-T-0110).
- metis-ralph requires user approval for `completed` transition; the katana
  engine must drive transitions itself based on gate results.
- The runtime we need fits in ~150 LOC (see KAT-T-0109). Wrapping is more
  work than rewriting and creates a Claude-Code coupling vision forbids.

## Consequences
- We do not reuse metis-ralph. We do not wrap it. We do not depend on it.
- We retain the *concept* of an iterative loop with a "promise"-style
  termination signal, reimplemented in src/workflow/loop.ts.
- If metis-ralph evolves, we ignore it.

## Out of scope
- Cross-platform agent dispatch (KAT-I-0006 ModelDispatcher adapters).
- Resumable loops across process restarts (post-MVP).
