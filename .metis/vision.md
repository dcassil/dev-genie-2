---
id: dev-genie
level: vision
title: "dev-genie"
short_code: "DGOS-V-0001"
created_at: 2026-05-19T16:55:44.269505+00:00
updated_at: 2026-05-19T16:56:44.014985+00:00
archived: false

tags:
  - "#vision"
  - "#phase/published"


exit_criteria_met: false
strategy_id: NULL
initiative_id: NULL
---

# Dev-Genie Engineering OS Vision

## Purpose

Dev-Genie is a repo-native AI engineering operating system: a composable set of plugins, deterministic tools, durable markdown/YAML artifacts, gates, and agent workflows that can take work from product intent through planning, architecture, task execution, validation, and long-lived repository memory.

The system exists to make AI-assisted engineering behave more like a strong human team. Product, design, architecture, project management, implementation, and quality responsibilities stay distinct. Each role consumes structured artifacts, produces structured artifacts, records confidence and missing context, and knows when to ask another role for a decision instead of guessing.

## Product/Solution Overview

The system is built from small independently useful pieces:

- `dev-genie/` is the meta-plugin and installer. It detects repository state, reconciles existing configuration, and wires the right plugins together.
- `katana/` is the workflow kernel. It owns repo-native work documents, phase machines, gates, board state, MCP tools, platform adapters, task execution loops, orchestration, context loading, and validation routing.
- `guardrails/` owns architecture catalogs, scaffolds, lint/type constraints, and implementation guardrail instructions.
- `audit/` owns deterministic quality scanning, composite health scoring, baseline persistence, and regression-blocking hooks.
- Planner and repo-intelligence capabilities are promoted from the existing Dev-Genie docs/tools into first-class engines that classify work, inspect repositories, choose strategy recipes, and produce planning artifacts.

The system supports greenfield products, major features in existing projects, minor changes, bugs, refactors, framework migrations, old-to-new ports, ports into existing ecosystems, and mixed workflows where these shapes overlap.

## Current State

Katana already provides the strongest kernel foundation: Product Doc -> Epic -> User Story -> Task documents, short codes, SQLite + markdown storage, MCP CRUD/search/transition/decomposition tools, templates, built-in gates, a phase machine, platform adapter contracts, a board, and a work/eval/gate loop.

Dev-Genie already provides meta-plugin setup, project detection, existing-repo reconciliation, baseline comparison, lock-aware config mutation, idempotent managed writers, and dogfood-tested apply flows.

Guardrails already provides stack-specific architecture patterns and lint/type rule scaffolds. Audit already provides deterministic static scanning, composite scores, baseline persistence, and pre-commit regression enforcement.

The gaps are integration and durable orchestration: artifact contracts are not yet shared across plugins, repo intelligence is still embedded in Dev-Genie, planning is still mostly markdown specification, Katana needs dependency/wave planning and agent spawning, and runtime micro-decisions are not yet a first-class loop.

## Future State

A repository using Dev-Genie has a `.metis/` project memory for strategic work and a `.katana/` execution workspace for product/engineering artifacts. Work enters as a request, gets classified by strategy, inspected by repo intelligence, planned through the relevant role plugins, decomposed into executable task sets, implemented through Katana's bounded task loop, and validated by gates rather than by agent self-assertion.

The artifact chain is:

Vision -> ProductDoc -> Epic -> Story -> TaskSet -> Task -> ExecutionRecord.

Supporting artifacts include ArchitectureDecision, ArchitectureImpact, DesignPlan, WireframePlan, FrontendPlan, BackendPlan, DomainModel, SchemaPlan, APIContract, Roadmap, QualityPlan, MigrationMap, RepoProfile, ValidationReport, DecisionRequest, DecisionRecord, and InsightNote.

All plugin outputs declare `status`, `confidence`, `missing_context`, `human_review_required`, `source_artifacts`, `output_artifacts`, and optional `skip_reason`. Skip is a first-class result when no UI, backend, schema, migration, or design work is required.

## Major Features

- Document Engine: durable repo-native markdown/YAML artifacts, schemas, validation, indexing, cross-links, and migration from legacy Metis/Katana documents.
- Strategy Engine: deterministic classification of work type, project state, delivery shape, and strategy recipe selection.
- Orchestration Engine: routes artifacts between plugins, detects missing/weak artifacts, handles dependency graphs, and coordinates initial and nested workflows without doing the role-specific work itself.
- Context Engine: loads minimal useful context for each plugin or task: active task, parent story, product docs, architecture/design docs, repo profile, relevant files, validation failures, and durable notes.
- Validation Engine: runs document gates, lint, typecheck, tests, build, audit, dependency checks, architecture rules, and task completion checks.
- Execution Loop: bounded task work that loads constrained context, inspects files, makes minimal changes, validates, records outcomes, and updates durable memory.
- Micro-Workflow Protocol: when an executing agent hits a planning, design, architecture, backend, frontend, migration, or quality question, it raises a typed DecisionRequest. The correct plugin answers through a small workflow loop starting at that role, then updates the current task instructions or creates follow-up work if the decision is large enough.
- Multi-Agent Orchestration: dependency graphs, wave planning, generated agent instruction docs, isolated worktrees, child-agent status records, and resumable orchestration.
- Plugin Ecosystem: planner, designer, architect, principal-be, principal-fe, project-manager, developer, refactor-migration, repo-intelligence, quality-governor, guardrails, audit, and future plugins connected by artifact contracts rather than hardcoded prompt chains.

## Success Criteria

- A major feature in an existing repo can flow from request -> repo profile -> product/stories -> architecture impact -> FE/BE plans -> task set -> first execution record with minimal manual glue.
- A running implementation agent can pause for an AI planning/design/architecture decision, receive updated task instructions, and continue without losing state.
- The same artifacts can be consumed by Claude Code, OpenAI/Codex, Cursor, and MCP-capable clients through platform adapters.
- Validation gates, not developer-agent promises, determine whether documents and implementation tasks are complete.
- Guardrails and Audit remain independently useful but plug cleanly into Katana's validation and context systems.
- Legacy Katana and Dev-Genie visions remain preserved, but the parent Metis workspace becomes the current source of strategic truth.

## Principles

- Small composable plugins over one giant workflow.
- Structured artifacts over prompt-only handoffs.
- Deterministic tools before model reasoning when deterministic inspection is possible.
- Orchestration routes work; role plugins do the role-specific thinking.
- Human review is explicit at strategic and high-risk boundaries.
- Runtime questions are normal work, not failures. Agents ask the correct role instead of making hidden product, architecture, or design decisions.
- Templates and gates remove ambiguity for weaker models rather than adding ceremony.
- Existing repo adoption must be reconciliation-first and idempotent.
- Block regressions rather than requiring perfect starting quality.

## Constraints

- Keep Katana standalone and usable without Dev-Genie.
- Keep Guardrails and Audit independently installable.
- Use repo-native files for durable state; avoid global hidden state except user-level tool configuration.
- Do not require one linear workflow. Strategy recipes must be declarative and composable.
- Avoid broad script piles. Prefer small CLIs/MCP tools with typed inputs and outputs.
- Support greenfield and existing repos, but implement existing-repo major feature flow first.
- Do not replace human judgment for strategic decisions, architecture trade-offs, or unresolved model disagreements.