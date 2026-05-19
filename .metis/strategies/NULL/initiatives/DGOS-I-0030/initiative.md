---
id: remove-prompt-only-role-handoffs
level: initiative
title: "Remove Prompt-Only Role Handoffs From Existing Packages"
short_code: "DGOS-I-0030"
runtime_primitive: meta
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

# Remove Prompt-Only Role Handoffs From Existing Packages Initiative

## Context

Existing package behavior is still heavily skill/prompt oriented. The target system requires Engines, Roles, and Loops to exchange artifacts with structured outputs. Prompt-only handoffs should be removed or wrapped behind typed contracts so model-backed Roles remain observable and deterministic Engines remain parse-free.

DGOS-A-0002 defines the v1 Role invocation convention: the Orchestrator invokes a Role through a local subprocess Role runner using `RoleInvocation` and `RoleResult` JSON artifact envelopes. This initiative must convert existing prompt-only behavior toward that convention, not toward an undefined "typed contracts" idea.

## Goals & Non-Goals

**Goals:**
- Identify prompt-only handoffs in Dev-Genie, Guardrails, Audit, and Katana commands/skills.
- Replace or wrap Role handoffs with the DGOS-A-0002 subprocess Role runner convention.
- Define `RoleInvocation` inputs and `RoleResult` outputs for each model-backed Role.
- Require produced/skipped/blocked/needs_human status for primitive outputs.
- Keep human-readable markdown as explanation, not as the only API.

**Non-Goals:**
- Remove useful skills entirely.
- Rewrite all package code at once.
- Force every Role to become MCP immediately.

## Detailed Design

Each model-backed Role should expose a concrete DGOS-A-0002 contract:

- `dev-genie role invoke <role-id> --input <RoleInvocation.json> --output <RoleResult.json>`
- accepted input artifact schemas
- produced output artifact schemas
- possible skip conditions and skip verifier requirements
- possible decision scopes
- allowed Engines/tools
- timeout, retry, budget, and model tier policy
- confidence, missing-context, review, diagnostics, and trace reporting

Skills and slash commands can remain as platform-specific UX, but they must either call the Role runner or produce the same `RoleResult` envelope. The orchestrator must never parse freeform role prose to determine success, artifact refs, confidence, skip state, or human-review requirements.

Deterministic Engines do not need the Role runner. They keep direct typed tool/function/CLI interfaces. Long-running Loops do not use the one-shot Role convention for their own state; they may invoke Roles through it when they need bounded specialist reasoning.

## Alternatives Considered

- Keep skills as the primary Role interface: rejected because orchestration cannot reliably parse prose.
- Convert everything to code immediately: rejected because some role reasoning remains model-driven.
- Remove skills entirely: rejected because platform UX still matters.
- Use MCP as the primary Role interface: rejected for v1 by DGOS-A-0002 because it couples Role availability to MCP server lifecycle and client support.

## Implementation Plan

- [ ] Inventory prompt-only handoffs in existing packages.
- [ ] Define `RoleInvocation` and `RoleResult` schemas for each Role.
- [ ] Add local subprocess Role runner wrappers for Planner, Architect, Designer, Principal FE/BE, Project Manager, and Quality Governor.
- [ ] Update skills and slash commands to call the runner or emit compatible envelopes.
- [ ] Update orchestration docs to call the Role runner, not prose skills.
- [ ] Remove or deprecate duplicate prompt-only flows after contract coverage exists.
