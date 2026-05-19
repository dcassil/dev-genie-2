---
id: devgenie-architecture-and-integration
level: initiative
title: "dev-genie Architecture Pattern and Integration"
short_code: "KAT-I-0007"
created_at: 2026-05-09T16:15:00.000000+00:00
updated_at: 2026-05-09T16:15:00.000000+00:00
parent: KAT-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/completed"


exit_criteria_met: false
estimated_complexity: M
strategy_id: NULL
initiative_id: devgenie-architecture-and-integration
---

# dev-genie Architecture Pattern and Integration Initiative

## Context

dev-genie is a meta-plugin with a registry of sub-plugins (currently `guardrails`, `audit`). Katana is the third sub-plugin. The existing dev-genie sub-plugin model assumes installable scaffolding that lays down rules / hooks / configs. Katana is shaped differently: it's a plugin **plus** an MCP server **plus** a doc workspace. We may need a new "architecture pattern" entry in dev-genie (alongside the existing `guardrails:arch-*` patterns) to describe katana's footprint and install steps.

This initiative blocks dev-genie integration but does not block katana's standalone work. Katana must be standalone-first. Integration is additive.

## Scope

- Audit dev-genie's current sub-plugin contract: registry shape, detection logic, install/setup commands, verification.
- Decide whether katana fits an existing pattern or needs a new one. Likely needs a new pattern: "agent-workflow plugin with MCP and workspace."
- Extend dev-genie:
  - Add katana to the orchestration registry.
  - Add detection for "katana already installed."
  - Add setup command/skill for first-time install.
  - Define the new architecture pattern if needed (analogous to `guardrails:arch-node-api`).
- Decide what `dev-genie init` flow looks like with katana included.
- Document how to install katana standalone vs. via dev-genie.

## Out of scope

- The katana plugin itself (separate initiatives).
- Changes to other dev-genie sub-plugins (guardrails, audit).

## Open questions

- Does dev-genie's current sub-plugin contract already support our shape, or do we need to extend it? Spike before deciding.
- Should katana's MCP registration go through dev-genie or be installed directly? Likely directly, so katana works without dev-genie.

## Exit criteria

- dev-genie sub-plugin contract is documented.
- Decision recorded on whether a new arch pattern is needed; if yes, the pattern skill exists.
- Katana entry added to dev-genie orchestration registry.
- Smoke test: `dev-genie init` in a fresh repo offers and installs katana cleanly.
