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

Dev-Genie is a repo-native AI engineering operating system: a composable set of runtime primitives, deterministic tools, durable markdown/YAML artifacts, gates, and agent workflows that can take work from product intent through planning, architecture, task execution, validation, and long-lived repository memory.

The system exists to make AI-assisted engineering behave more like a strong human team. Product, design, architecture, project management, implementation, and quality responsibilities stay distinct. Each Role consumes structured artifacts, produces structured artifacts, records confidence and missing context, and knows when to ask another Role or Engine for a decision instead of guessing.

## Product/Solution Overview

The system is built from small independently useful pieces:

- `dev-genie/` is the meta package and installer. Its deterministic setup Engine detects repository state, reconciles existing configuration, and wires the right runtime primitives together.
- `katana/` is the workflow kernel package. It owns repo-native work documents, phase machines, gates, board state, MCP tools, platform adapters, task execution Loops, orchestration Loops, context loading, and validation routing.
- `guardrails/` owns deterministic architecture catalogs, scaffolds, lint/type constraints, and implementation guardrail instructions used by Engines and Roles.
- `audit/` owns deterministic quality scanning, composite health scoring, baseline persistence, and regression-blocking hooks used by the Validation Engine.
- Planner and repo-intelligence capabilities are promoted from the existing Dev-Genie docs/tools into first-class primitives: the Planner Role produces planning artifacts, while the Strategy and Repo Intelligence Engines classify work and inspect repositories.

The system supports greenfield products, major features in existing projects, minor changes, bugs, refactors, framework migrations, old-to-new ports, ports into existing ecosystems, and mixed workflows where these shapes overlap.

## Runtime Primitives

Runtime behavior is split into three primitives. Package boundaries can contain more than one primitive, but runtime routing must invoke the primitive, not the package name.

### Engines

Engines are deterministic, typed, and non-LLM in their core path. Engines include:

- Dev-Genie Installer/Reconciliation Engine for repository detection, setup, lock-aware mutation, and idempotent managed writes.
- Document Engine for repo-native markdown/YAML artifacts, schemas, validation, indexing, cross-links, and migrations.
- Strategy Engine for work classification, project-state classification, delivery-shape detection, and strategy recipe selection.
- Repo Intelligence Engine for package, framework, script, CI, hook, audit-state, route, schema, component, and ownership facts.
- Context Engine for minimal context bundle assembly, artifact-chain loading, relevant file selection, validation-history loading, and durable note selection.
- Validation Engine for document gates, lint, typecheck, tests, build, audit, dependency checks, architecture rules, and completion checks.
- Decision Policy Engine for deterministic autonomy, review, routing, forbidden-action, and human-block evaluation.
- Guardrails Engine for architecture catalog checks, scaffold constraints, lint/type rule enforcement, and implementation guardrail checks.
- Audit Engine for deterministic static scanning, quality scoring, baseline persistence, and regression blocking.

### Roles

Roles are LLM-backed specialist invocations with role-specific prompts, context profiles, and artifact I/O contracts. Roles include:

- Planner Role for ProductDoc, Epic, Story, PlanningPass, Roadmap, runtime product/planning decisions, and task-set seeds.
- Designer Role for DesignPlan, WireframePlan, ViewInventory, interaction states, UX DecisionRecords, and UI skip results.
- Architect Role for ArchitectureImpact, ArchitectureDecision, architecture DecisionRecords, task patches, and architecture follow-up seeds.
- Principal FE Role for FrontendPlan, component plans, page/view plans, state plans, FE task seeds, and frontend skip results.
- Principal BE Role for BackendPlan, DomainModel, SchemaPlan, APIContract, MigrationMap, BE task seeds, and backend skip results.
- Project Manager Role for TaskSet shaping, dependency graphs, hybrid task mapping, ownership surfaces, and review checkpoints.
- Quality Governor Role for QualityPlan, quality risk review, validation interpretation, gate policy recommendations, and quality DecisionRecords.
- Refactor/Migration Role for model-backed migration planning, porting plans, refactor strategy, and migration risk decisions.

### Loops

Loops are long-running, stateful runtime processes with durable task or orchestration state. Loops include:

- Developer Execution Loop for bounded task execution, constrained context loading, file edits, validation, retries, DecisionRequest emission, ExecutionRecords, and durable memory updates.
- Validation Recovery Loop behavior inside execution for retrying after structured lint/type/test/build/audit failures and escalating when failures reveal planning, architecture, or quality gaps.
- Orchestrator Loop for initial workflow routing, nested DecisionRequest workflows, task patch/resume behavior, child primitive invocations, and durable routing records.
- Multi-Agent Wave Execution Loop for dependency graphs, wave planning, isolated worktrees, child-agent records, query/wait/send/report/terminate operations, and resumable orchestration.

## Current State

Katana already provides the strongest kernel foundation: Product Doc -> Epic -> User Story -> Task documents, short codes, SQLite + markdown storage, MCP CRUD/search/transition/decomposition tools, templates, built-in gates, a phase machine, platform adapter contracts, a board, and a work/eval/gate loop.

Dev-Genie already provides setup, project detection, existing-repo reconciliation, baseline comparison, lock-aware config mutation, idempotent managed writers, and dogfood-tested apply flows.

Guardrails already provides stack-specific architecture patterns and lint/type rule scaffolds. Audit already provides deterministic static scanning, composite scores, baseline persistence, and pre-commit regression enforcement.

The gaps are integration and durable orchestration: artifact contracts are not yet shared across primitives, repo intelligence is still embedded in Dev-Genie, planning is still mostly markdown specification, Katana needs dependency/wave planning and agent spawning, and runtime micro-decisions are not yet a first-class Loop.

## Future State

A repository using Dev-Genie has a `.metis/` project memory for strategic work and a `.katana/` execution workspace for product/engineering artifacts. Work enters as a request, gets classified by the Strategy Engine, inspected by the Repo Intelligence Engine, planned through the relevant Roles, decomposed into executable task sets, implemented through Katana's bounded Developer Execution Loop, and validated by gates rather than by agent self-assertion.

The artifact chain is:

Vision -> ProductDoc -> Epic -> Story -> TaskSet -> Task -> ExecutionRecord.

Supporting artifacts include ArchitectureDecision, ArchitectureImpact, DesignPlan, WireframePlan, FrontendPlan, BackendPlan, DomainModel, SchemaPlan, APIContract, Roadmap, QualityPlan, MigrationMap, RepoProfile, ValidationReport, DecisionRequest, DecisionRecord, and InsightNote.

All Role outputs declare `status`, `confidence`, `missing_context`, `human_review_required`, `source_artifacts`, `output_artifacts`, and optional `skip_reason`. Skip is a first-class result when no UI, backend, schema, migration, or design work is required. Engine outputs declare deterministic input refs, output refs, version/config refs, diagnostics, and gate implications when applicable. Loop records declare state transitions, child primitive calls, retry counts, validation results, decisions, blocking reasons, and resume context.

## Major Features

- Document Engine: durable repo-native markdown/YAML artifacts, schemas, validation, indexing, cross-links, and migration from legacy Metis/Katana documents.
- Strategy Engine: deterministic classification of work type, project state, delivery shape, and strategy recipe selection.
- Orchestrator Loop: routes artifacts between primitives, detects missing/weak artifacts, handles dependency graphs, and coordinates initial and nested workflows without doing the role-specific work itself.
- Context Engine: loads minimal useful context for each Role or task: active task, parent story, product docs, architecture/design docs, repo profile, relevant files, validation failures, and durable notes.
- Validation Engine: runs document gates, lint, typecheck, tests, build, audit, dependency checks, architecture rules, and task completion checks.
- Developer Execution Loop: bounded task work that loads constrained context, inspects files, makes minimal changes, validates, records outcomes, and updates durable memory.
- Micro-Workflow Protocol: when an executing agent hits a planning, design, architecture, backend, frontend, migration, or quality question, it raises a typed DecisionRequest. The Orchestrator Loop routes to the correct Role through a small workflow, then updates the current task instructions or creates follow-up work if the decision is large enough.
- Multi-Agent Wave Execution Loop: dependency graphs, wave planning, generated agent instruction docs, isolated worktrees, child-agent status records, and resumable orchestration.
- Runtime Primitive Ecosystem: planner, designer, architect, principal-be, principal-fe, project-manager, developer, refactor-migration, repo-intelligence, quality-governor, guardrails, audit, and future primitives connected by artifact contracts rather than hardcoded prompt chains.

## Success Criteria

- DGOS-I-0031 proves the protocol thesis first: a hand-authored Story flows through one Architect Role invocation into one validated ArchitectureImpact artifact, then that output is dogfooded on a real Dev-Genie planning change.
- After the protocol proof, a major feature in an existing repo can flow from request -> repo profile -> product/stories -> architecture impact -> FE/BE plans -> task set -> first execution record with minimal manual glue.
- A running implementation agent can pause for an AI planning/design/architecture decision, receive updated task instructions, and continue without losing state.
- The same artifacts can be consumed by Claude Code, OpenAI/Codex, Cursor, and MCP-capable clients through platform adapters.
- Validation gates, not developer-agent promises, determine whether documents and implementation tasks are complete.
- Guardrails and Audit remain independently useful while their deterministic checks plug cleanly into Katana's validation and context systems.
- Legacy Katana and Dev-Genie visions remain preserved, but the parent Metis workspace becomes the current source of strategic truth.

## Principles

- Small composable runtime primitives over one giant workflow.
- Structured artifacts over prompt-only handoffs.
- Deterministic tools before model reasoning when deterministic inspection is possible.
- Orchestration routes work; Roles do the role-specific thinking.
- Human review is explicit at strategic and high-risk boundaries.
- Runtime questions are normal work, not failures. Agents ask the correct Role or Engine instead of making hidden product, architecture, or design decisions.
- Templates and gates remove ambiguity for weaker models rather than adding ceremony.
- Existing repo adoption must be reconciliation-first and idempotent.
- Block regressions rather than requiring perfect starting quality.

## Constraints

- Keep Katana standalone and usable without Dev-Genie.
- Keep Guardrails and Audit independently installable.
- Use repo-native files for durable state; avoid global hidden state except user-level tool configuration.
- Do not require one linear workflow. Strategy recipes must be declarative and composable.
- Avoid broad script piles. Prefer small CLIs/MCP tools with typed inputs and outputs.
- Support greenfield and existing repos, but prove the one-role artifact protocol before implementing the existing-repo major feature v0.5 flow.
- Do not replace human judgment for strategic decisions, architecture trade-offs, or unresolved model disagreements.
