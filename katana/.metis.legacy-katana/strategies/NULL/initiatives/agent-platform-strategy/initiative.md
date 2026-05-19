---
id: agent-platform-strategy
level: initiative
title: "Agent Platform Strategy Pattern"
short_code: "KAT-I-0006"
created_at: 2026-05-09T16:15:00.000000+00:00
updated_at: 2026-05-09T16:15:00.000000+00:00
parent: KAT-V-0001
blocked_by: [mcp-server-and-storage]
archived: false

tags:
  - "#initiative"
  - "#phase/completed"


exit_criteria_met: false
estimated_complexity: L
strategy_id: NULL
initiative_id: agent-platform-strategy
---

# Agent Platform Strategy Pattern Initiative

## Context

Katana must run on multiple agent platforms — Claude Code, Cursor, OpenAI/Codex-style tooling, and others. Each platform has different surfaces:

- **Claude Code** — plugins, skills (slash commands), MCP, hooks, `CLAUDE.md`.
- **Cursor** — `.cursor/rules`, MCP via `.cursor/mcp.json`, agent commands.
- **OpenAI / Codex** — different tool/agent contract; possibly `AGENTS.md`.

The MCP server is the platform-neutral core. Around it, each platform gets an adapter that surfaces katana commands and rules in that platform's idiom. We use a strategy/plugin pattern so adapters live behind a common interface.

## Scope

- PlatformAdapter interface: install, uninstall, register-command, register-rule, generate-agent-doc.
- ClaudeCodeAdapter — plugin scaffold, skills (`/katana-decompose`, `/katana-work`, etc.), MCP wiring, `CLAUDE.md` injection.
- CursorAdapter — rules + MCP config.
- (At least one) OpenAI/Codex-shaped adapter, even if minimal, to validate the abstraction.
- Adapter registry: `katana install <platform>` picks the right adapter.
- Decide which slash commands are universal (all adapters) vs. platform-specific.

## Out of scope

- The MCP server implementation itself (separate initiative).
- Agent rules content authoring beyond the bare-minimum MVP rules.

## Open questions

- Which platforms must be in MVP? Lean: Claude Code (full), Cursor (basic), one OpenAI/Codex example.
- Where does the workflow loop run — inside the adapter, or as part of the MCP server? Likely the loop is platform-driven (agent-side) and the MCP just exposes operations. Confirm during workflow-engine spike.

## Exit criteria

- PlatformAdapter interface defined.
- Claude Code adapter installs cleanly into a fresh repo and exposes katana commands.
- At least one non-Claude adapter installed and functional for a smoke-test workflow.
- ADR recorded on universal-vs-platform-specific command split.
