---
id: remove-prompt-only-role-handoffs
level: initiative
title: "Remove Prompt-Only Role Handoffs From Existing Plugins"
short_code: "DGOS-I-0030"
created_at: 2026-05-19T17:19:48.463925+00:00
updated_at: 2026-05-19T17:19:48.463925+00:00
parent: DGOS-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/discovery"


exit_criteria_met: false
estimated_complexity: M
strategy_id: NULL
initiative_id: remove-prompt-only-role-handoffs
---

# Remove Prompt-Only Role Handoffs From Existing Plugins Initiative

## Context

Existing plugin behavior is still heavily skill/prompt oriented. The target system requires plugins to exchange artifacts with structured outputs. Prompt-only handoffs should be removed or wrapped behind typed contracts.

## Goals & Non-Goals

**Goals:**
- Identify prompt-only handoffs in Dev-Genie, Guardrails, Audit, and Katana commands/skills.
- Replace or wrap them with typed input/output artifacts.
- Require produced/skipped/blocked/needs_human status for plugin outputs.
- Keep human-readable markdown as explanation, not as the only API.

**Non-Goals:**
- Remove useful skills entirely.
- Rewrite all plugin code at once.
- Force every command to become MCP immediately.

## Detailed Design

Each plugin should expose a minimal contract:

- accepted input artifacts
- produced output artifacts
- possible skip conditions
- possible decision scopes
- validation gates
- confidence and missing-context reporting

Skills can remain as platform-specific UX, but core behavior should be available through deterministic tools or typed artifact adapters.

## Alternatives Considered

- Keep skills as the primary interface: rejected because orchestration cannot reliably parse prose.
- Convert everything to code immediately: rejected because some role reasoning remains model-driven.
- Remove skills entirely: rejected because platform UX still matters.

## Implementation Plan

- [ ] Inventory prompt-only handoffs in existing plugins.
- [ ] Define typed contracts for each plugin role.
- [ ] Add adapters that produce artifact protocol outputs.
- [ ] Update orchestration docs to call contracts, not prose skills.
- [ ] Remove or deprecate duplicate prompt-only flows after contract coverage exists.
