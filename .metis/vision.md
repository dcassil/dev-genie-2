---
id: dev-genie
level: vision
title: "dev-genie"
short_code: "DGOS-V-0001"
created_at: 2026-05-21T17:15:17.612629+00:00
updated_at: 2026-05-21T17:42:10.160194+00:00
archived: false

tags:
  - "#vision"
  - "#phase/published"


exit_criteria_met: false
strategy_id: NULL
initiative_id: NULL
---

# Dev-Genie Engineering OS Vision

## Runtime Primitives

Runtime behavior is split into three primitives. Package boundaries can contain more than one primitive, but runtime routing must invoke the primitive, not the package name.

### Engines

Engines are deterministic, typed, and non-LLM in their core path. Engines include the installer and reconciliation engine, document engine, strategy engine, repo intelligence engine, context engine, validation engine, decision policy engine, guardrails engine, and audit engine.

### Roles

Roles are LLM-backed specialist invocations with role-specific prompts, context profiles, and artifact I/O contracts. Roles include Planner, Designer, Architect, Principal FE, Principal BE, Project Manager, Quality Governor, and Refactor/Migration.

### Loops

Loops are long-running, stateful runtime processes with durable records, but they are one recursive primitive rather than separate unrelated systems.

A child claims done. A parent verifies done. Completion is never a self-assertion.

- Leaf nodes are the only nodes that edit code. They read the task, make bounded changes, run fast local validation on their own scope, check acceptance criteria, ensure coverage expectations are met, and return a completion claim.
- Inner nodes govern children and never edit code. When children claim done, the parent runs the authoritative validation pass across the owned scope, dispatches rework when needed, and only then marks completion upward.
- Multi-agent wave execution is an inner node with more than one child.
- Orchestration is the root inner node.

The parent-child return contract is `done`, `needs-decision`, or `failed`. Decisions route sideways to the correct Role and bubble upward according to scope.

## Purpose

Dev-Genie is a repo-native AI engineering operating system: a composable set of runtime primitives, deterministic tools, durable markdown and YAML artifacts, gates, and agent workflows that can take work from product intent through planning, architecture, task execution, validation, and long-lived repository memory.

The system exists to make AI-assisted engineering behave more like a strong human team. Product, design, architecture, project management, implementation, and quality responsibilities stay distinct. Each Role consumes structured artifacts, produces structured artifacts, records confidence and missing context, and knows when to ask another Role or Engine for a decision instead of guessing.

## Product/Solution Overview

The system is built from small independently useful pieces:

- `dev-genie/` is the meta package and installer. Its deterministic setup engine scaffolds the workspace, detects repository state, reconciles existing configuration, and wires the right runtime primitives together.
- `katana/` is the document-scoped workflow package. It owns repo-native work documents, templates, short codes, frontmatter and schema rules, the board, the phase machine, MCP CRUD/search/transition tools, and platform adapters.
- `guardrails/` owns deterministic architecture catalogs, scaffolds, lint and type constraints, and implementation guardrail instructions used by Engines and Roles.
- `audit/` owns deterministic quality scanning, composite health scoring, baseline persistence, and regression-blocking hooks used by the Validation Engine.
- Planner, repo-intelligence, validation, decision-policy, and context capabilities are first-class runtime primitives with explicit contracts rather than implicit prompt choreography.

Each plugin remains independently usable, but no single plugin owns the complete end-to-end workflow.

## Current State

Katana already provides the strongest document foundation: product and execution documents, short codes, SQLite plus markdown storage, MCP CRUD/search/transition/decomposition tools, templates, built-in gates, a phase machine, platform adapter contracts, and a board.

Dev-Genie already provides setup, project detection, existing-repo reconciliation, baseline comparison, lock-aware config mutation, idempotent managed writers, and dogfood-tested apply flows. Guardrails already provides stack-specific architecture patterns and lint/type rule scaffolds. Audit already provides deterministic static scanning, composite scores, baseline persistence, and pre-commit regression enforcement.

The gaps are in cross-primitive contracts and orchestration: artifact contracts are not yet shared across primitives, repo intelligence is still too embedded in Dev-Genie, planning is still mostly markdown specification, completion authority is not yet cleanly enforced by validation, and execution evidence is not yet written back as durable records.

## Future State

A repository using Dev-Genie has a `.metis/` strategic workspace and a `.katana/` execution workspace. Work enters as a request, gets classified by the Strategy Engine, inspected by the Repo Intelligence Engine, planned through the relevant Roles, decomposed into executable task sets, implemented through the recursive govern-verify loop, and validated by gates rather than by agent self-assertion.

The artifact chain is:

Vision -> ProductDoc -> Epic -> Story -> TaskSet -> Task -> ExecutionRecord.

Supporting artifacts include ArchitectureDecision, ArchitectureImpact, DesignPlan, WireframePlan, FrontendPlan, BackendPlan, DomainModel, SchemaPlan, APIContract, Roadmap, QualityPlan, MigrationMap, RepoProfile, ValidationReport, DecisionRequest, DecisionRecord, and InsightNote.

Bootstrap is first-class:

- Phase 0: initialize the workspace and detect the repository state.
- Phase 1: write and approve the vision, then choose the architecture pattern with explicit human approval.
- Phase 2: create project-readiness initiatives for setup, guardrails, repo documentation, and audit baselining before normal execution begins.

Validation is one engine invoked at two scopes: a fast and narrow pass at the leaf to reduce rework, and an authoritative full pass at the parent to decide completion. Audit runs at the epic level to start and moves lower only if rework volume justifies it.

Decomposition should default to capability or contract boundaries that can be reviewed and validated independently. High-pass, low-pass, and UI split remains a strategy recipe choice rather than hardcoded Katana behavior, but it should be used only when it reduces coupling, and when used it should split stories rather than create overlapping tasks inside one story. For example, a user-facing admin settings change would decompose into distinct stories such as the admin settings entry point and shell, displaying real settings data, editing and persisting settings, and permissions or audit behavior, with each story then containing narrow implementation tasks within its own boundary.

## Major Features

- Document engine: durable repo-native markdown and YAML artifacts, schemas, indexing, cross-links, migrations, and shared artifact contracts.
- Strategy engine: deterministic classification of work type, project state, delivery shape, strategy recipe selection, and decomposition choices that default to capability or contract boundaries, using pass-oriented story splits only when they reduce coupling.
- Repo intelligence engine: repository facts for frameworks, scripts, CI, ownership, routes, schema, and architecture cues.
- Context engine: minimal useful context bundles for each Role or execution node.
- Validation engine: document gates, lint, typecheck, tests, build, audit, dependency checks, architecture rules, and completion authority.
- Recursive govern-verify loop: bounded execution at leaves, authoritative validation at parents, durable rework records, and resumable orchestration.
- Decision policy and governance: explicit autonomy boundaries, human-review gates, and deterministic routing for unresolved decisions.
- Runtime primitive ecosystem: planner, designer, architect, principal-be, principal-fe, project-manager, developer, refactor-migration, repo-intelligence, quality-governor, guardrails, and audit connected by artifact contracts rather than prompt-only handoffs.

## Success Criteria

- The protocol proof works first: a hand-authored Story flows through one Architect Role invocation into one validated ArchitectureImpact artifact, then that output is dogfooded on a real Dev-Genie planning change.
- A major feature in an existing repo can flow from request to repo profile to product and story artifacts to architecture impact to FE and BE plans to task set to first execution record with minimal manual glue.
- A running execution node can pause for a product, design, architecture, or quality decision, receive updated instructions or a follow-up work item, and continue without losing state.
- Validation gates, not executing-agent promises, determine whether documents and implementation tasks are complete.
- Evidence from execution and validation is written back as durable artifacts rather than lost in transient agent output.
- The same artifacts can be consumed by Claude Code, Codex, Cursor, and MCP-capable clients through platform adapters.
- Guardrails and Audit remain independently useful while their deterministic checks plug cleanly into the validation and context systems.

## Principles

- Small composable runtime primitives over one giant workflow.
- Structured artifacts over prompt-only handoffs.
- Deterministic tools before model reasoning when deterministic inspection is possible.
- Orchestration routes work; Roles do the role-specific thinking.
- A child claims done. A parent verifies done.
- Human review is explicit at strategic and high-risk boundaries.
- Runtime questions are normal work, not failures.
- Existing repo adoption must be reconciliation-first and idempotent.
- Block regressions rather than requiring perfect starting quality.

## Constraints

- Keep Katana standalone and usable without Dev-Genie.
- Keep Guardrails and Audit independently installable.
- Use repo-native files for durable state; avoid global hidden state except user-level tool configuration.
- Do not require one linear workflow. Strategy recipes must be declarative and composable.
- Avoid broad script piles. Prefer small CLIs and MCP tools with typed inputs and outputs.
- Support greenfield and existing repos, but prove the one-role artifact protocol before implementing the broader existing-repo major-feature flow.
- Do not replace human judgment for strategic decisions, architecture trade-offs, or unresolved model disagreements.