---
id: katana
level: vision
title: "Katana"
short_code: "KAT-V-0001"
created_at: 2026-05-09T16:10:16.567342+00:00
updated_at: 2026-05-09T16:10:39.626940+00:00
archived: false

tags:
  - "#vision"
  - "#phase/published"


exit_criteria_met: false
strategy_id: NULL
initiative_id: NULL
---

# Katana Vision

## Purpose

Katana is an agent-focused kanban workflow that decomposes work from product docs → epics → user stories → tasks, with templates, gates, and a two-pass task model designed around the strengths and weaknesses of LLM coding agents. It is delivered as a Claude Code plugin + MCP server + template set, usable standalone or as part of the dev-genie meta-plugin. It is platform-agnostic (Claude, OpenAI/Codex, Cursor, others) via a strategy/plugin abstraction at every touch point.

## Product Overview

**Audience.** Developers using AI coding agents to plan and execute multi-step work, who want a structured, doc-driven flow that produces consistent agent output without micromanaging every step.

**Core idea.** LLMs produce dramatically better code when they're given:
1. The right amount of upstream context (vision/epic/story).
2. A constrained scaffold to fill in (interfaces, types, comments, file stubs).
3. A focused, narrow task — implementation only, no architectural decisions.

Katana operationalizes this with a two-pass task model: a **high-pass** task run by a stronger model that produces the scaffold (placeholder files, type defs, contract comments), followed by a **low-pass** task run by a cheaper/faster model that fills in the implementation against that scaffold. Each task type is a distinct document so the workflow knows which model to dispatch and what to validate.

## Current State

- Metis exists and demonstrates the value of doc-driven planning for agents (templates, phase machine, short codes, MCP integration, lint, search).
- Prior experiments (sonet vs haiku on identical specs) show that scaffold-first / fill-in-second yields better output from weaker models than asking them to design and implement in one pass.
- No existing tool combines: kanban-shaped workflow, agent-platform abstraction, two-pass task model, and template/gate enforcement.

## Future State

A repo with a katana plugin installed has:
- A document hierarchy (Product Doc → Epic → User Story → Task[high-pass] → Task[low-pass]) with template files and required-field validation.
- Gates that block downstream decomposition until upstream docs meet completeness criteria, and that block phase progression until exit criteria are satisfied.
- A workflow loop (work → eval → gate → loop → done) that drives a doc through its phases with the right model for each step.
- An MCP surface for create/edit/search/transition/decompose, agnostic to which agent platform is calling it.
- A pluggable kanban board (internal-default, swappable to Jira/Linear/etc.).
- A pluggable storage backend (sqlite+md by default, other backends possible).
- A pluggable agent-platform adapter (Claude slash commands and skills, Cursor rules, OpenAI/Codex equivalents, etc.) so the same workflow runs anywhere.

## Major Features

- **Document templates** for: Product Doc (architecture / system-design / UI variants), Epic (architecture / major-feature-design / UI variants), User Story (architecture / interface-contract / UI variants), Task[high-pass], Task[low-pass], Task[UI] (optional).
- **Gates** — pre-decomposition completeness gates, phase-transition exit-criteria gates, parent-readiness gates.
- **Two-pass task execution** — different models, different document types, different prompts/skills.
- **Workflow engine** — work/eval/gate/loop/done state machine; reuse Ralph-style loops where it fits.
- **MCP server** — CRUD + search + transition + decompose; storage-backend pluggable.
- **Kanban board interface** — internal MVP, plugin contract for Jira/Linear/external.
- **Agent-platform strategy** — touchpoints (slash commands, MCP, agent rules files) implemented per platform behind a common interface.

## Success Criteria

- A team can install katana into a fresh repo and produce a Product Doc → Epic → Stories → Tasks tree without writing custom code.
- The two-pass execution measurably improves weak-model output quality vs. one-pass on identical specs.
- The same katana workflow runs unchanged on Claude Code, Cursor, and at least one OpenAI/Codex-like surface.
- An external kanban (Jira) can be plugged in via the board interface without modifying core katana code.

## Principles

- **Doc-driven, agent-executable.** Every workflow step is grounded in a document with a template and a gate, not in agent memory.
- **Subtraction over prescription.** Templates and scaffolds remove decisions from weak models, not add layers.
- **Pluggable at every boundary.** Agent platform, storage, kanban backend, and (where it fits) gate logic are interfaces, not hardcoded.
- **Model-fit per step.** Strong models for design and scaffolding; cheap models for fill-in. Make this explicit in the data model, not implicit in prompts.
- **Standalone-first, composable.** Katana works without dev-genie. dev-genie can install/configure it like any other sub-plugin.
- **Reuse existing tools where they fit.** Borrow from metis (storage, short codes, phase machine), Claude Code skills/hooks (gates, loops), and Ralph-style loops where applicable; don't rebuild what works.

## Constraints

- Must run as a Claude Code plugin and an MCP server; the MCP must be usable from any MCP-capable client.
- Cannot assume the host repo uses metis. Katana ships its own workspace.
- Cannot assume a specific agent platform — any platform-specific surface is an adapter.
- MVP does not include Jira/Linear integration or import-from-existing-board (deferred but interface must accommodate it).
- Templates and gates must be authorable by humans without changing code (markdown + config), so non-engineers can extend them.
