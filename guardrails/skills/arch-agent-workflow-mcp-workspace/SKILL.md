---
name: arch-agent-workflow-mcp-workspace
description: Use when scaffolding an agent-workflow plugin that ships a Claude Code plugin surface plus an MCP server plus a doc workspace (e.g. katana, metis). Provides the pattern shape and integration points; lint configs are inherited from the host repo's chosen application architecture.
---

# Agent-Workflow Plugin with MCP and Workspace — agent-workflow-mcp-workspace

## What it provides

- **Plugin surface** — Claude Code skills and slash commands that gate work transitions and query the workspace.
- **MCP server** — stdio Node process registered via `claude mcp add`, exposing workspace CRUD and search operations.
- **Doc workspace** — `.<name>/` directory with `vision.md`, hierarchy subdirectories, `config.toml`, and `<name>.db` for document metadata and sync state.
- **Optional storage backend** — pluggable persistence layer (sqlite, Postgres) to store document snapshots and audit logs.

## Components

### Plugin

- **Skills** — reusable, composable Claude Code skills (e.g., `/create-document`, `/transition-phase`, `/search-workspace`).
- **Slash commands** — registered in `$CLAUDE_PLUGIN_ROOT/claude.mcp.json`; exposed via Claude Code's command palette.
- **Workspace metadata** — parsed from `.<name>/config.toml` and `.<name>/vision.md` to populate context prompts.

### MCP server

- **Stdio Node process** — spawned by Claude Code at startup, managed via `claude mcp add` or plugin initialization.
- **CRUD operations** — create document, read, update, delete; each gated by transition rules and exit criteria.
- **Search and index** — full-text search across workspace documents; aggregate queries (e.g., all tasks in a phase).
- **Transition logic** — validate phase transitions, enforce exit criteria, check parent/child dependencies.

### Workspace

- **`.<name>/` directory** — project-local metadata root.
  - `vision.md` — top-level strategic intent.
  - Hierarchy subdirectories — `strategies/`, `initiatives/`, `tasks/`, `adr/`, `backlog/`.
  - `config.toml` — workspace configuration (flight-level setup, document-type enablement, phase definitions).
  - `<name>.db` — SQLite metadata store (or reference to remote backend).

## Layers / boundaries

```
Agent platform (Claude Code)
  ↓
Plugin surface (skills + slash commands)
  ↓
MCP server (stdio Node process)
  ↓
Storage backend (sqlite, Postgres, or file-based)
  ↓
Workspace (vision + hierarchy + config + docs)
```

Each layer is pluggable:
- Plugin surface can be extended with new skills without touching the MCP server.
- MCP server can swap backends (file ↔ Postgres) without touching the plugin.
- Workspace layout is defined in `config.toml` and can be customized per project.

## Key rules

- **Standalone-first** — the plugin and workspace can be initialized without dev-genie or any external orchestration. Default entry point: `/<name>-init` skill.
- **Platform-agnostic via adapters** — plugin surface is Claude Code specific; MCP server is platform-agnostic (can run outside Claude).
- **Templates and gates author-able in markdown and config** — phase transitions, exit criteria, and template structure are defined declaratively in YAML/TOML, not hardcoded.
- **Document-centric** — all work state flows through the document hierarchy; the DB is a metadata index, not the source of truth.
- **No loose documents** — documents are always created through gates (e.g., under an initiative or as a backlog item), never orphaned.

## Install steps

### Standalone (via plugin's own init skill)

```bash
# In a Claude Code session:
/<name>-init
```

The skill creates `.<name>/` directory, initializes `vision.md`, `config.toml`, and `<name>.db`, then registers the MCP server.

### Via dev-genie orchestration

```bash
# In a Claude Code session with dev-genie installed:
/dev-genie-init [--template <name>]
```

Dev-genie orchestration detects the current repo's needs and offers to install the `<name>` plugin as a sub-plugin. Install check:
- `${CLAUDE_PLUGIN_ROOT}/../<name>/` exists.
- `<name>/` directory at workspace root (or `.<name>/` if colocated).
- Slash command registered in Claude Code.

Post-setup verification: `.<name>/vision.md` and `.<name>/config.toml` exist and are valid.

## When NOT to use

- **Pure lint and scaffold needs** — use `arch-node-api`, `arch-next-vercel`, or other application architecture patterns for building domain code.
- **Data-access-dominant CRUD apps** — use `arch-supabase-api` if your primary challenge is authorization and schema, not workflow orchestration.
