---
id: mcp-server-and-storage
level: initiative
title: "MCP Server and Storage Backend"
short_code: "KAT-I-0004"
created_at: 2026-05-09T16:15:00.000000+00:00
updated_at: 2026-05-09T16:15:00.000000+00:00
parent: KAT-V-0001
blocked_by: [document-templates-and-schema]
archived: false

tags:
  - "#initiative"
  - "#phase/completed"


exit_criteria_met: false
estimated_complexity: L
strategy_id: NULL
initiative_id: mcp-server-and-storage
---

# MCP Server and Storage Backend Initiative

## Context

Katana exposes its core operations through an MCP server so any MCP-capable client (Claude Code, Cursor, Codex/OpenAI tools, etc.) can drive the workflow. The MCP surface is the contract; the storage layer is an implementation detail behind a port.

Metis already has a working storage model (sqlite + markdown files, short codes, search, lint). Strongly consider forking or adapting that code rather than rebuilding. We must decide MVP-1 between:

- **Fork-and-adapt** — copy the metis storage layer into katana, strip what we don't need, add what we do.
- **Depend-on-metis** — call metis as a library/MCP from inside katana. Tighter coupling; less duplication.
- **Greenfield** — write our own. Full control; most work.

Default lean: fork-and-adapt for MVP. Reassess after.

## Scope

- Define the MCP tool surface: create_document, edit_document, read_document, search_documents, transition_phase, decompose, list_documents, validate (gates), open_document.
- Define the storage port: read/write a doc, list children, search, transition. Pluggable backends behind this port.
- Default backend: sqlite + markdown (likely adapted from metis).
- Short-code generator and uniqueness guarantees.
- Workspace concept: katana docs live in a `.katana/` directory (mirroring metis's `.metis/`).
- Decide adapt-vs-depend-vs-greenfield with a short ADR.

## Out of scope

- Gate execution (validation-gates initiative); MCP just routes calls.
- Agent-platform glue (slash commands, rules files); separate initiative.

## Open questions

- What's the ADR outcome for the storage strategy? Spike during decomposition.
- Does katana need its own search index or can it lean on the metis FTS index?
- What's the migration story if we fork-and-adapt and metis evolves later?

## Exit criteria

- MCP tool list documented with input/output schemas.
- Storage port interface defined; one backend implementation working.
- Round-trip test: create a Product Doc → Epic → Story → Tasks via MCP, list/search them, transition phases.
- ADR recorded for the adapt/depend/greenfield decision.
