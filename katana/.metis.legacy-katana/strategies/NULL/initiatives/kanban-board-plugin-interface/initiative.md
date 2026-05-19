---
id: kanban-board-plugin-interface
level: initiative
title: "Kanban Board Plugin Interface"
short_code: "KAT-I-0005"
created_at: 2026-05-09T16:15:00.000000+00:00
updated_at: 2026-05-09T16:15:00.000000+00:00
parent: KAT-V-0001
blocked_by: [mcp-server-and-storage]
archived: false

tags:
  - "#initiative"
  - "#phase/completed"


exit_criteria_met: false
estimated_complexity: M
strategy_id: NULL
initiative_id: kanban-board-plugin-interface
---

# Kanban Board Plugin Interface Initiative

## Context

Katana ships an internal kanban board (default) and exposes a plugin interface so external boards (Jira, Linear, GitHub Projects, etc.) can be swapped in. MVP delivers only the internal board; the plugin interface is the contract that lets us add others later without changing core code.

External boards complicate the picture: stories and epics on a human kanban are rarely written in katana's templates. We need a strategy for "import a foreign card → wrap it as a katana doc" — but this is post-MVP. For MVP, ensure the interface accommodates it.

## Scope

- Define BoardPort: list_columns, list_cards, create_card, update_card_status, link_card_to_doc, etc.
- Internal board MVP: rendered from katana docs (status comes from doc phase). No separate state.
- Plugin contract: how external boards register, authenticate, map columns to phases, map cards to docs.
- Round-trip example: doc phase change → board status update; no external sync in MVP.

## Out of scope

- Jira/Linear adapter implementations.
- Bi-directional sync with external boards.
- "Foreign card import" strategy (post-MVP; interface must allow it).

## Open questions

- Should the internal board be a CLI rendering, an HTML view, both? MVP: CLI/markdown render. Web view post-MVP.
- How are foreign-board cards mapped to katana doc levels (story? task?) when they don't follow the template?

## Exit criteria

- BoardPort interface defined and documented.
- Internal board MVP renders the current workspace (columns by phase, cards by doc).
- A stub adapter (no-op or fake) demonstrates the plugin contract works.
