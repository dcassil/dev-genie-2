# Katana Install Paths

This document describes the two ways a user installs and initializes katana: as a standalone tool, and through dev-genie orchestration.

## Standalone Path

**User action:** Install the katana plugin and invoke `/katana-init` directly.

1. User installs the katana Claude Code plugin (e.g., `claude plugin install katana` or via local path).
2. User runs `/katana-init`.
3. Katana scaffolds `.katana/` directory with `config.toml`, `vision.md`, template files, and workspace metadata.
4. Katana registers its own MCP server directly via `claude mcp add` (or equivalent), making it available to the local Claude Code session.
5. dev-genie is not required, not consulted, and not invoked. The standalone path is complete.

**Result:** User has a fully functional katana workspace with MCP server registered, independent of dev-genie.

## dev-genie Path

**User action:** Run `/dev-genie-init`, which walks the sub-plugin registry.

1. User runs `/dev-genie-init`.
2. dev-genie orchestration walks the sub-plugin registry in order: guardrails → audit → katana.
3. For the katana registry entry, dev-genie invokes `/katana-init` (the same command as the standalone path).
4. Katana scaffolds `.katana/` and registers its own MCP server (identical behavior to the standalone path).
5. dev-genie does not perform any katana-specific scaffolding or MCP registration on katana's behalf.
6. Post-setup verification reuses the registry's verification rules: confirm `.katana/config.toml` and `.katana/vision.md` exist, and that `claude mcp list` shows the katana MCP server.

**Result:** User has the same fully functional katana workspace as the standalone path, as part of a coordinated dev-genie setup flow.

## MCP Registration Ownership

**Katana registers its own MCP server during `/katana-init`. dev-genie never registers MCP servers on katana's behalf.**

This design decision keeps the standalone path complete and self-contained, avoiding a divergent code path where dev-genie and standalone installations differ. Whether invoked standalone or through dev-genie, `/katana-init` produces identical output: a `.katana/` directory and an MCP server registered in the host session.

## Cross-References

- **Registry entry:** `/Users/danielcassil/Code/gaurd-rails-boilerplate/dev-genie/skills/orchestration/SKILL.md` § "3. katana" — documents install-check signals, setup command, and post-setup verification for the dev-genie orchestration flow.
- **Detection signals:** `/Users/danielcassil/Code/gaurd-rails-boilerplate/dev-genie/skills/project-detection/SKILL.md` § "Step 4 — katana detection" — documents signals that suggest a project may benefit from katana.
