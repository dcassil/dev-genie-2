---
id: planner-shared-capability
level: initiative
title: "Planner shared capability for ecosystem work shaping"
short_code: "DGEN-I-0009"
created_at: 2026-05-18T00:00:00+00:00
updated_at: 2026-05-18T00:00:00+00:00
parent: DGEN-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/discovery"


exit_criteria_met: false
estimated_complexity: L
strategy_id: NULL
initiative_id: planner-shared-capability
---

# Planner shared capability for ecosystem work shaping

## Context

dev-genie currently orchestrates guardrails, audit, and Katana through project detection and an ordered sub-plugin registry. The ecosystem now needs a shared Planner capability that sits before execution and answers: what kind of work is this, what pattern applies, what should be sequenced first, what can run in parallel, what is blocked, and which downstream tool should handle each action.

Planner should not be web-app-specific. It must support web apps, APIs, desktop apps, CLIs, libraries, data pipelines, engines, infrastructure, agent workflow plugins, and other domains through a pluggable schema library.

The product specification lives at `dev-genie/planner.md`. This initiative tracks turning that specification into an ecosystem capability and integrating it with dev-genie's orchestration flow.

## Goals & Non-Goals

**Goals:**
- Define Planner as a shared capability for work classification, pattern selection, dependency mapping, and delta replanning.
- Ship default planning patterns: greenfield/foundation, feature slice, refactor, port/migration, and mixed.
- Define an extensible pattern library format so teams and plugins can add new patterns.
- Define a pluggable schema library so domain-specific vocabulary is not hardcoded into Planner core.
- Add preview-vs-formal decomposition semantics, including stale preview detection and conflict discovery.
- Integrate Planner into `/dev-genie-init` as an advisory planning step before registry orchestration.
- Keep dev-genie core limited to orchestration glue: detecting Planner, invoking Planner, storing summaries, and routing downstream actions.
- Define how guardrails, Katana, and audit consume Planner outputs.

**Non-Goals:**
- Do not make dev-genie core own Planner's pattern definitions, planning gates, preview decomposition logic, or schema packs.
- Do not replace guardrails architecture scaffolding.
- Do not replace Katana workflow execution or board state.
- Do not replace audit scoring.
- Do not force every project to install Katana.

## Detailed Design

Planner should produce structured artifacts with a human-readable summary. The minimum artifact includes:

```json
{
  "schema_version": 1,
  "id": "PLAN-0001",
  "scope": {
    "altitude": "project",
    "target": "DGEN-V-0001"
  },
  "mode": "initial",
  "pattern": {
    "id": "mixed",
    "subpatterns": ["greenfield", "feature", "refactor", "port"]
  },
  "domain_schema": "agent-workflow",
  "summary": "Planner classifies the work and routes downstream actions to dev-genie sub-plugins.",
  "passes": [],
  "dependencies": [],
  "parallel_groups": [],
  "async_waits": [],
  "risks": [],
  "decisions_required": [],
  "downstream_actions": []
}
```

Default pattern library:

- `greenfield` — foundation/skeleton, shared primitives, capability slices, hardening.
- `feature` — fit analysis, contract/design, vertical slice, expansion, validation.
- `refactor` — characterize behavior, define seam, refactor behind contract, migrate usage, validate parity.
- `port` — source audit, target mapping, parity scaffold, incremental port, parity validation, cutover, cleanup.
- `mixed` — combines multiple patterns in one scope with explicit boundaries.

Domain schema packs add vocabulary and validation rules for specific kinds of systems:

- web app: screens, routes, client state, server actions;
- API: endpoints, request/response contracts, auth rules, rate limits;
- desktop app: windows, menus, commands, local storage;
- engine/library: modules, public APIs, runtime hooks, data structures;
- agent workflow: workspace layout, MCP tools, document types, gates, platform adapters.

dev-genie integration should follow this shape:

```text
project-detection
-> Planner classify/plan
-> Planner recommends orchestration route
-> dev-genie invokes guardrails/audit/Katana as needed
-> dev-genie stores init-level summary under .dev-genie/
```

Preview decomposition is internal and replaceable. Formal decomposition creates visible downstream work. dev-genie should route this distinction to Katana when Katana is installed, but dev-genie core should not own the decomposition model itself.

## Requirements

### Functional Requirements

- REQ-001: Planner has a documented core artifact schema.
- REQ-002: Planner has a documented pattern definition format.
- REQ-003: Planner has a documented schema-pack format for domain vocabularies.
- REQ-004: Planner ships default patterns for greenfield, feature, refactor, port, and mixed work.
- REQ-005: Planner supports initial planning and delta replanning.
- REQ-006: Planner supports preview decomposition and formal decomposition readiness as separate concepts.
- REQ-007: `/dev-genie-init` can invoke Planner or a Planner-compatible advisory step before sub-plugin orchestration.
- REQ-008: dev-genie stores the Planner init summary without becoming the owner of Planner logic.
- REQ-009: Planner can emit downstream actions for guardrails, Katana, audit, and future tools.

### Non-Functional Requirements

- NFR-001: Planner language must be domain-neutral by default.
- NFR-002: Pattern and schema packs must be extensible without modifying Planner core.
- NFR-003: Planner recommendations must be inspectable by humans before destructive or strategic actions.
- NFR-004: Planner must support use without Katana installed.
- NFR-005: dev-genie orchestration must remain idempotent and compatible with existing `.dev-genie/init.last-run.json` behavior.

## Architecture

Planner should be either a standalone sub-plugin, a shared library, or both. The long-term preferred shape is a standalone shared capability with a library/MCP surface:

```text
dev-genie core
  -> invokes Planner classify/plan/replan
  -> routes downstream actions

Planner
  -> owns pattern library
  -> owns schema library
  -> owns planning gates
  -> owns preview decomposition semantics

guardrails
  -> contributes architecture and schema-pack metadata

Katana
  -> consumes Planner output for workflow decomposition and execution

audit
  -> consumes Planner output for risk-aware evaluation
```

Potential commands:

```text
planner classify
planner plan
planner replan
planner validate-plan
planner list-patterns
planner list-schemas
```

Potential MCP tools:

```text
classify_work
create_plan
read_plan
update_plan
replan_delta
validate_plan
list_patterns
list_schema_packs
```

## Alternatives Considered

- **Put Planner inside Katana.** Rejected because dev-genie, guardrails, audit, and future tools need planning before Katana is installed or outside Katana-managed workflows.
- **Put Planner inside dev-genie core.** Rejected because dev-genie should remain an orchestrator, not the owner of pattern logic and schema libraries.
- **Hardcode web-app schemas.** Rejected because the ecosystem must support APIs, CLIs, engines, agent plugins, infrastructure, and other non-UI systems.
- **Create visible tasks from every preview decomposition.** Rejected because speculative children pollute the execution backlog and confuse agents.

## Implementation Plan

1. Review and refine `dev-genie/planner.md` as the product specification.
2. Decide packaging: standalone sub-plugin, shared library, or hybrid.
3. Define the core plan artifact schema and save format.
4. Define the pattern library schema and implement the default patterns.
5. Define the domain schema-pack format and seed web app, API, engine/library, and agent-workflow examples.
6. Add a Planner invocation point to `/dev-genie-init` after project detection and before registry orchestration.
7. Store init-level Planner summaries in `.dev-genie/` and include them in idempotent re-run comparison.
8. Update guardrails docs to describe schema-pack contribution from architecture patterns.
9. Update Katana integration docs to consume Planner preview/formal decomposition output.
10. Update audit docs to consume Planner pattern/risk context for baseline and regression recommendations.
11. Add tests or dogfood scenarios for greenfield app, existing API, refactor, port, and agent-workflow plugin cases.

## Exit Criteria

- `dev-genie/planner.md` is accepted as the Planner product specification.
- Metis documents in dev-genie and Katana track the Planner work and its integration boundary.
- A packaging decision is recorded for Planner ownership.
- The default pattern library and schema-pack format are documented.
- `/dev-genie-init` has a defined Planner integration point.
- Katana has a defined consumer contract for preview and formal decomposition artifacts.
- dev-genie core remains limited to orchestration responsibilities.
