---
id: metis-feature-parity-survey
level: initiative
title: "Metis Feature Parity Survey"
short_code: "KAT-I-0008"
created_at: 2026-05-09T16:15:00.000000+00:00
updated_at: 2026-05-09T16:15:00.000000+00:00
parent: KAT-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/completed"


exit_criteria_met: false
estimated_complexity: S
strategy_id: NULL
initiative_id: metis-feature-parity-survey
---

# Metis Feature Parity Survey Initiative

## Context

Metis solves a lot of problems we'll otherwise re-encounter: short codes, phase machine, lint, search, sync, archive, agent integration files (`CLAUDE.md` injection), code-index. We should explicitly enumerate what metis does, decide for each capability whether katana should:

- **Inherit** (fork the code into katana),
- **Depend** (call out to metis),
- **Defer** (post-MVP),
- **Skip** (not needed for katana's model).

This is a discovery initiative — its output is a decision document, not code. The decisions feed every other initiative.

## Scope

Catalog metis capabilities and decide per-capability:

- Document storage (sqlite + md) — likely Inherit.
- Short codes and uniqueness — Inherit.
- Phase machine — Inherit (extend with our doc types).
- Lint (`metis lint`, `metis lint_workspace`) — Inherit.
- Search (FTS) — Inherit.
- Sync (`metis sync`) — Inherit.
- Archive — Inherit.
- Templates and required-section enforcement — Inherit/extend.
- ADR support — Decide (post-MVP candidate).
- Agent integration: `CLAUDE.md`, Cursor rules — Adapt (covered by agent-platform initiative).
- Code-index (`.metis/code-index.md`) — Decide; likely defer.
- Patterns / preset config (`full`, `streamlined`, `direct`) — Decide; likely Skip in MVP.
- CLI surface — Decide; MCP is required, CLI is convenience.

Also enumerate what katana adds that metis doesn't have, to make sure we don't lose them in inheritance:

- Two-pass task model.
- Pluggable platform adapter, board adapter, storage backend.
- Gate engine as first-class composable config.
- Work-eval-gate-loop runtime per task.

## Out of scope

- Implementing any of the above. This initiative is decision-only.

## Exit criteria

- Capability table with decisions (Inherit/Depend/Defer/Skip) and rationale per row.
- List of additions katana brings beyond metis.
- Cross-references from each other initiative back to relevant rows so decomposition has full context.
