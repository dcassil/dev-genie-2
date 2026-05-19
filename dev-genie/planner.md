# Planner Product Specification

## Summary

Planner is a shared planning capability for the dev-genie ecosystem. It classifies work, selects an execution pattern, builds dependency and parallelism maps, and produces structured planning artifacts that downstream tools can consume.

Planner is not specific to web applications. It must work for web apps, APIs, desktop apps, CLIs, libraries, data pipelines, game systems, agent plugins, infrastructure, embedded systems, and engines with no UI. Domain-specific concepts such as screens, routes, components, endpoints, jobs, commands, scenes, workers, or modules are supplied by pluggable schema libraries rather than hardcoded into Planner core.

Planner's default pattern library ships with four initial patterns:

- Greenfield / foundation
- Feature slice
- Refactor
- Port / migration

These defaults are extensible. Teams and plugins can add new planning patterns, domain vocabularies, gates, and planning artifact schemas without changing Planner core.

## Ecosystem Role

dev-genie is an umbrella orchestrator. It detects project state and installs or coordinates sub-plugins.

guardrails owns architecture patterns, scaffold rules, lint/type constraints, and implementation guardrails.

audit owns quality scoring, regression checks, and quality baselines.

katana owns workflow execution: work documents, board state, decomposition, phase transitions, task loops, and MCP-driven execution.

Planner owns work shaping before execution:

- What kind of work is this?
- What altitude is the work at?
- Which planning pattern applies?
- What reusable foundations are needed?
- What blocks what?
- What can run in parallel?
- What should be handled asynchronously?
- What has changed since the previous plan?
- What should downstream tools do next?

The intended ecosystem flow is:

```text
dev-genie detects the repo
-> Planner classifies project/work shape
-> guardrails applies architecture constraints
-> katana initializes workflow execution when needed
-> Planner produces project/epic/story/task plans
-> katana decomposes and executes work
-> audit evaluates quality and regression risk
-> Planner performs delta replanning when work changes
```

Planner should be usable independently, but its primary value is as shared planning intelligence for the whole dev-genie ecosystem.

## Goals

- Provide a formal planning pass before decomposition or execution.
- Support project-level, epic-level, story-level, and task-level planning with different rules at each altitude.
- Keep planning language universal across product and engineering domains.
- Make planning patterns extensible through a pattern library.
- Make domain schemas extensible through a schema library.
- Emit structured artifacts that tools can consume without scraping prose.
- Support initial planning and delta replanning when new work arrives midstream.
- Identify shared foundations and reusable primitives before repeated feature work begins.
- Identify sequencing, blockers, async waits, and parallel work groups.
- Preserve human control at strategic altitudes while enabling mostly automatic story/task execution.

## Non-Goals

- Planner does not execute implementation tasks.
- Planner does not own a kanban board.
- Planner does not own architecture scaffolds or lint rules.
- Planner does not own audit scoring.
- Planner does not force all work into web app concepts.
- Planner does not require Katana, though Katana should be its main workflow consumer.
- Planner does not replace human judgment for strategic product direction.

## Core Concepts

### Work Altitude

Planner must distinguish the altitude of the work item.

```text
Portfolio / ecosystem
Project / product
Epic / capability
Story / executable slice
Task / concrete implementation unit
```

The same pattern can behave differently at different altitudes.

Project and epic planning are living orchestration layers. They can accept new stories, re-rank work, revise dependencies, and involve humans midstream.

Story planning is execution shaping. A story should quickly become a bounded task graph.

Task planning is tactical. A task should have enough context to execute through a work/eval/gate loop.

### Planning Mode

Planner supports multiple modes:

```text
initial
delta
execution
review
```

`initial` creates the first plan for a scope.

`delta` updates an existing plan when new work is added, requirements change, completed work needs follow-up, or active work is impacted.

`execution` prepares a story or task for implementation.

`review` evaluates whether a plan is still valid.

### Work Pattern

A work pattern describes the shape of the work and the preferred planning/decomposition strategy.

Default patterns:

```text
greenfield
feature
refactor
port
mixed
```

Plugins can add additional patterns such as:

```text
research-spike
incident-response
performance-campaign
security-hardening
data-migration
platform-integration
release-campaign
test-coverage-campaign
```

### Planning Pass

A planning pass produces a structured planning artifact. It should answer:

- What is the work?
- What pattern applies?
- What domain schema applies?
- What pass structure applies?
- What dependencies exist?
- What can run in parallel?
- What must wait?
- What reusable foundations are needed?
- What risks should be handled first?
- What human decisions are required?
- What downstream tool should handle the next step?

### Pattern Pass

Some patterns define ordered passes. For example, greenfield work commonly uses:

```text
P1 foundation / skeleton
P2 shared primitives
P3 feature slices
P4 hardening / release
```

Not every pattern needs these exact passes. The pass system must be pattern-defined, not hardcoded.

## Default Pattern Library

### Greenfield / Foundation Pattern

Use when creating a new product, service, module, plugin, library, game system, data pipeline, or major standalone subsystem.

Typical passes:

```text
P1 Foundation / skeleton
P2 Shared primitives
P3 Capability slices
P4 Hardening / release
```

Universal examples:

- For a web app, P1 may include routing, layout shell, state boundaries, and API contracts.
- For an API, P1 may include service boundaries, route shape, persistence boundaries, config, and health checks.
- For a CLI, P1 may include command structure, config loading, IO boundaries, and error/reporting shape.
- For a game engine, P1 may include runtime loop, scene/module boundaries, asset loading, and core systems.
- For an agent workflow plugin, P1 may include workspace layout, MCP server shape, document model, and platform adapter ports.

P2 identifies reusable pieces:

- UI components
- API clients
- domain services
- storage adapters
- schema validators
- command helpers
- telemetry/logging primitives
- test fixtures
- shared workflow gates

P3 implements vertical capability slices.

P4 hardens the system through tests, docs, smoke tests, release wiring, and operational checks.

Planning gates:

- Foundation skeleton is defined before repeated capability work begins.
- Shared primitives are identified before duplicated implementation spreads.
- Architecture decisions are captured when they constrain multiple slices.
- P3 work has clear acceptance criteria.

### Feature Slice Pattern

Use when adding a new capability to an existing system.

Typical phases:

```text
fit analysis
contract/design
vertical implementation slice
expansion / variants
validation
```

Universal examples:

- A web app feature may add a user flow, component states, and backend calls.
- An API feature may add endpoints, request/response contracts, service logic, and persistence behavior.
- A desktop feature may add commands, panels, local state, and file interactions.
- An engine feature may add a subsystem capability, runtime hook, or new data processing stage.

Planning gates:

- Existing system conventions are identified.
- Integration boundaries are named.
- The smallest useful vertical slice is defined.
- Acceptance criteria cover user-visible or consumer-visible behavior.
- Required shared primitives are either existing or promoted to separate work.

### Refactor Pattern

Use when changing structure while preserving intended behavior.

Typical phases:

```text
characterize current behavior
define seam / boundary
refactor behind stable contract
migrate usage incrementally
remove old path
validate parity
```

Universal examples:

- Extracting a service from a controller.
- Replacing a UI state model without changing screens.
- Splitting a large module into smaller packages.
- Changing a rendering engine while keeping output equivalent.
- Reorganizing a CLI command implementation without changing command behavior.

Planning gates:

- Current behavior is characterized through tests, snapshots, traces, fixtures, or documented invariants.
- A stable seam is identified.
- Rollback or incremental migration strategy is known for risky changes.
- Parity criteria are explicit.
- Cleanup happens only after replacement is validated.

### Port / Migration Pattern

Use when rebuilding existing behavior in a new runtime, framework, platform, architecture, language, or subsystem.

Typical phases:

```text
source audit
target mapping
parity scaffold
incremental port
parity validation
cutover
cleanup
```

Universal examples:

- Moving a feature from a legacy web app into a new frontend.
- Porting an API from one framework to another.
- Moving a CLI feature into a desktop shell.
- Rebuilding a game mechanic in a new engine.
- Moving workflow behavior from one agent platform to another.

Planning gates:

- Source behavior is audited before implementation.
- Target architecture mapping is documented.
- Parity criteria are defined.
- Cutover plan exists when old and new systems overlap.
- Cleanup is deferred until parity is proven.

### Mixed Pattern

Use when a scope combines multiple patterns.

Example:

```text
Project: new platform plugin
  Greenfield: workspace and MCP server
  Feature: command registry
  Port: behavior copied from an older plugin
  Refactor: shared utilities extracted from existing code
```

Mixed planning must produce separate sub-plans with explicit boundaries and dependencies.

## Extensible Pattern Library

Planner core ships with default patterns, but patterns are data.

A pattern definition should include:

```yaml
id: greenfield
name: Greenfield / Foundation
version: 1
applies_when:
  - new system
  - major standalone subsystem
altitudes:
  - project
  - epic
passes:
  - id: p1-foundation
    label: Foundation / Skeleton
    purpose: Establish core structure and boundaries.
  - id: p2-primitives
    label: Shared Primitives
    purpose: Build reusable pieces needed by multiple slices.
  - id: p3-slices
    label: Capability Slices
    purpose: Implement useful vertical increments.
  - id: p4-hardening
    label: Hardening / Release
    purpose: Validate, document, and prepare for use.
required_outputs:
  - dependency_graph
  - risk_list
  - decomposition_strategy
gates:
  - planning.pattern-selected
  - planning.dependencies-mapped
  - planning.pass-order-declared
```

Pattern packages can be provided by:

- Planner core
- dev-genie
- guardrails
- katana
- audit
- project-local `.planner/patterns/`
- organization-level plugin catalogs

Pattern resolution order should be:

```text
project-local overrides
-> installed plugin patterns
-> planner default patterns
```

## Pluggable Schema Library

Planner must avoid hardcoding web-app terms. It should use universal fields in core and domain schema packs for domain-specific details.

Core schema fields:

```yaml
id: string
title: string
altitude: portfolio | project | epic | story | task
planning_mode: initial | delta | execution | review
pattern: string
pattern_version: string
domain_schema: string
status: draft | planned | ready | active | blocked | completed
summary: string
objectives: string[]
constraints: string[]
acceptance_criteria: string[]
dependencies: Dependency[]
parallel_groups: ParallelGroup[]
async_waits: AsyncWait[]
risks: Risk[]
decisions_required: Decision[]
downstream_actions: DownstreamAction[]
```

Domain schema packs can add fields.

Web app schema examples:

```yaml
screens: []
routes: []
components: []
client_state: []
server_actions: []
```

API schema examples:

```yaml
endpoints: []
request_contracts: []
response_contracts: []
auth_rules: []
rate_limits: []
```

Desktop app schema examples:

```yaml
windows: []
menus: []
commands: []
local_storage: []
native_integrations: []
```

Engine/library schema examples:

```yaml
modules: []
public_apis: []
runtime_hooks: []
data_structures: []
performance_constraints: []
```

Agent workflow schema examples:

```yaml
workspace_layout: []
mcp_tools: []
document_types: []
gates: []
platform_adapters: []
```

Schema packs should define:

- vocabulary
- required planning fields
- optional planning fields
- validation gates
- examples
- downstream tool hints

## Planning Artifacts

Planner should produce machine-readable output with a human-readable summary.

Minimum artifact:

```json
{
  "schema_version": 1,
  "id": "PLAN-0001",
  "scope": {
    "altitude": "epic",
    "target": "KAT-E-0004"
  },
  "mode": "delta",
  "pattern": {
    "id": "mixed",
    "subpatterns": ["feature", "refactor"]
  },
  "domain_schema": "agent-workflow",
  "summary": "New shared platform adapter work impacts one completed adapter and one planned adapter.",
  "passes": [],
  "dependencies": [],
  "parallel_groups": [],
  "async_waits": [],
  "risks": [],
  "decisions_required": [],
  "downstream_actions": []
}
```

Artifacts may be stored in:

- `.planner/`
- `.dev-genie/`
- `.katana/`
- embedded sections inside Katana documents

Storage location should be configurable. Planner core should not require Katana.

## Initial Planning Flow

```text
intake request
-> detect work altitude
-> detect project/domain schema
-> select work pattern
-> identify constraints
-> identify foundation/shared needs
-> map dependencies
-> map parallelism
-> identify risk-first work
-> identify human decisions
-> emit plan artifact
-> route downstream actions
```

Downstream examples:

- Ask guardrails to scaffold an architecture.
- Ask Katana to create an epic/story/task graph.
- Ask audit to establish a baseline.
- Ask dev-genie to install a missing plugin.
- Ask the user for a strategic decision.

## Delta Planning Flow

Delta planning runs when work changes after planning already exists.

Triggers:

- new initiative added
- new epic added
- new story added to an active epic
- user changes priority
- active work discovers a blocker
- completed work needs extension
- architecture decision changes
- audit failure reveals systemic work

Delta flow:

```text
load current plan
-> classify new/changed work
-> impact map existing work
-> update dependency graph
-> update parallelism/async waits
-> decide WIP handling
-> create downstream actions
-> save revised plan
```

WIP decisions:

```text
continue
pause
block
revise
split
complete-follow-up
```

Completed work should not be reopened by default. If new work affects completed work, Planner should usually create linked follow-up work. Reopen only when the original acceptance criteria were invalid or falsely satisfied.

## Preview vs Formal Decomposition

Planner must distinguish exploratory decomposition from committed decomposition.

Preview decomposition is an internal high-pass planning step. It is generated when a project, initiative, epic, or story is created or materially edited. Its purpose is to expose hidden structure before the visible backlog is created.

Preview decomposition answers:

- What child work probably exists?
- What dependencies would appear if this scope were decomposed?
- What shared primitives or foundations are implied?
- What conflicts with sibling or parent work?
- What assumptions are unclear?
- What work should be split, merged, deferred, or promoted?
- Does this scope need all sibling scopes previewed before execution begins?

Formal decomposition creates visible, executable work items. In Katana, formal decomposition creates user-facing documents such as stories and tasks. In other tools, it may create tickets, migration phases, audit work items, or scaffold actions.

The two modes have different semantics:

```text
preview decomposition:
  internal
  replaceable
  not executable
  hidden by default
  used for conflict discovery and planning readiness

formal decomposition:
  user-visible
  tracked
  executable
  gated
  intended for active work
```

Preview decomposition should be content-addressed. A preview is current only when its source hash matches the latest planning source.

Example metadata:

```yaml
preview_id: PLAN-PREV-0004
source_ref: KAT-I-0009
source_hash: sha256-of-planning-source
generated_at: 2026-05-18T00:00:00Z
status: current | superseded
visibility: internal
pattern: mixed
domain_schema: agent-workflow
conflicts: []
candidate_children: []
formal_decomposition_status: not_started | ready | created | stale
```

When a source item is edited, Planner should supersede the previous preview and generate a new one. Old previews may be archived for traceability, but they should not remain in the active planning context by default. This avoids stale speculative child work confusing the agent.

Preview decomposition is especially important when multiple initiatives exist before execution begins. Decomposing all initiatives in preview mode can reveal cross-cutting foundations, sequencing conflicts, and incompatible architecture assumptions before any task locks in the wrong structure.

Planning gates for this model:

```text
preview.current
preview.source-hash-matches
preview.conflicts-reviewed
preview.cross-scope-impact-reviewed
formal-decomposition.ready
formal-decomposition.not-stale
```

Planner owns the preview model, stale detection, conflict analysis, dependency graph updates, and readiness decision. Downstream workflow tools own how and when a formal decomposition becomes real work.

## Project/Epic vs Story/Task Planning

Project and epic planning are living orchestration layers.

They answer:

- What capabilities belong here?
- What stories exist now?
- What order should they run?
- What stories block others?
- What shared foundations are emerging?
- What completed work needs follow-up?
- What active work should continue, pause, or change?

Story and task planning are execution layers.

They answer:

- What pattern applies to this slice?
- What tasks are required?
- What order should tasks run?
- Is high-pass / low-pass execution needed?
- What gates apply?
- What is the acceptance boundary?

Adding a new story to an existing epic triggers two planning actions:

```text
epic delta planning
-> update story graph and impact map

story execution planning
-> create task graph for the new story
```

## Gates

Planner should define planning gates that other tools can invoke.

Core gates:

```text
planning.pattern-selected
planning.altitude-selected
planning.schema-selected
planning.objectives-present
planning.acceptance-present
planning.dependencies-mapped
planning.parallelism-reviewed
planning.risks-reviewed
planning.decisions-routed
planning.downstream-actions-present
```

Pattern gates:

```text
greenfield.foundation-defined
greenfield.shared-primitives-reviewed
feature.integration-boundary-defined
feature.vertical-slice-defined
refactor.current-behavior-characterized
refactor.parity-criteria-defined
port.source-audit-complete
port.target-mapping-defined
port.cutover-plan-defined
```

Domain schema packs can add their own gates.

## Integration With dev-genie

dev-genie should invoke Planner early in `/dev-genie-init`.

Current dev-genie flow:

```text
project-detection
-> greenfield registry walk OR existing reconciliation
```

Proposed flow:

```text
project-detection
-> Planner project classification
-> Planner recommends orchestration route
-> greenfield registry walk OR existing reconciliation
-> Planner saves init plan
```

Planner can help dev-genie decide:

- whether guardrails should scaffold, reconcile, or skip
- which guardrails architecture pattern applies
- whether Katana should be offered
- whether the project looks like an agent-workflow MCP workspace
- whether audit should run before or after a migration/refactor
- which sub-plugin outputs block later steps

dev-genie should remain the orchestrator. Planner should return recommendations and structured downstream actions.

dev-genie core should own only orchestration glue:

- Detect whether Planner is available.
- Offer or install Planner in the right order.
- Invoke Planner during `/dev-genie-init`.
- Store init-level planning summaries under `.dev-genie/`.
- Route Planner downstream actions to guardrails, audit, Katana, or future tools.
- Report unresolved human decisions.

dev-genie core should not own pattern definitions, preview decomposition logic, planning gates, schema packs, or cross-initiative conflict detection. Those remain Planner responsibilities.

## Integration With guardrails

guardrails owns architecture patterns and automated code constraints.

Planner consumes guardrails pattern metadata and can recommend one or more architecture patterns.

Planner should not copy guardrails scaffold files or own lint rules. Instead, it emits:

```json
{
  "tool": "guardrails",
  "action": "select_architecture",
  "architecture": "agent-workflow-mcp-workspace",
  "reason": "Project ships plugin surface, MCP server, and doc workspace."
}
```

Guardrails can also provide schema packs and planning pattern extensions.

Example: `agent-workflow-mcp-workspace` can contribute an agent-workflow domain schema with:

- workspace layout
- MCP tool surface
- document hierarchy
- phase machine
- gates
- platform adapters

## Integration With Katana

Katana should consume Planner artifacts before decomposition.

Katana uses Planner output to decide:

- whether an epic/story is ready to decompose
- which work pattern applies
- which task types to create
- whether high-pass / low-pass handoff is required
- what order tasks should run
- what can be parallelized
- what is blocked by human decision
- what gates must pass before phase transitions

Katana should own:

- board state
- document hierarchy
- task execution loop
- MCP workspace operations
- high-pass / low-pass handoff

Planner should own:

- pattern selection
- work shaping
- dependency graph
- delta replanning

Katana may store Planner artifacts inside `.katana/`, but Planner must not require Katana.

For preview decomposition, Katana should:

- Trigger Planner preview generation when a Katana initiative, epic, or story is created or materially edited.
- Store or link the current preview artifact without showing candidate children on the normal board.
- Mark formal decomposition as stale when the source document changes after preview.
- Block `decompose_document` when the preview is missing, stale, or has unresolved conflicts.
- Convert approved formal decomposition output into visible Katana documents.
- Link created documents back to the Planner artifact that produced them.

Katana should not invent its own competing preview model. Planner is the source of truth for what preview decomposition means; Katana is the source of truth for when preview output becomes executable workflow state.

## Integration With audit

audit can consume Planner artifacts to contextualize risk.

Examples:

- Refactor pattern: audit should emphasize regression risk and parity checks.
- Port pattern: audit should require source/target parity evidence.
- Greenfield pattern: audit should establish a baseline after foundation scaffolding.
- Feature pattern: audit should compare quality impact around touched modules.

Planner can emit audit actions:

```json
{
  "tool": "audit",
  "action": "baseline_after",
  "blocked_by": ["guardrails.scaffold", "katana.foundation-plan"]
}
```

## MCP / CLI Surface

Planner should eventually expose both CLI and MCP operations.

Initial commands:

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

## Example: Agent Workflow Plugin

Input:

```text
Build a workflow plugin that ships a Claude Code surface, MCP server, and doc workspace.
```

Planner output:

```text
domain_schema: agent-workflow
pattern: greenfield
passes:
  P1 foundation: workspace layout, document model, MCP skeleton
  P2 shared primitives: gate engine, storage port, platform adapter port
  P3 capability slices: document CRUD, board view, work loop, platform installers
  P4 hardening: smoke tests, integration tests, docs, dev-genie setup path
downstream:
  guardrails: select agent-workflow-mcp-workspace architecture
  katana: create product-doc / epic / story plan
  audit: baseline after scaffold
```

## Example: Midstream Story Added

State:

```text
Epic has 12 stories.
4 completed.
1 active.
7 todo.
User adds a story that crosses one completed story and one todo story.
```

Planner delta output:

```text
completed story:
  impact: extension
  action: create linked follow-up story, do not reopen by default

todo story:
  impact: design change
  action: revise before task decomposition

active story:
  impact: none | conflict | dependency
  action: continue | pause | block | revise

new story:
  action: run story execution planning, then decompose tasks
```

## Implementation Phases

### Phase 1: Spec and Data Model

- Define default pattern library.
- Define core planning artifact schema.
- Define domain schema pack format.
- Define planning gates.
- Write examples for web app, API, CLI, engine/library, and agent workflow plugin.

### Phase 2: dev-genie Integration

- Extend project-detection output with Planner-compatible signals.
- Add Planner invocation before greenfield registry walk.
- Save plan output to `.dev-genie/`.
- Use Planner recommendations to decide whether Katana should be offered.

### Phase 3: Katana Integration

- Add planning fields to Katana documents or attach Planner artifacts.
- Add planning-readiness gate before decomposition.
- Add delta replanning trigger when stories are added to active epics.
- Use planning pattern to guide task generation.

### Phase 4: Pattern and Schema Extensions

- Add project-local pattern packs.
- Add plugin-contributed schema packs.
- Add validation for pattern definitions.
- Add MCP tools for plan creation and validation.

### Phase 5: Evaluation and Feedback

- Feed audit results back into Planner.
- Detect repeated replanning causes.
- Suggest extraction of shared primitives when duplication appears.
- Track planning accuracy over time.

## Open Questions

- Should Planner be a standalone sub-plugin, a shared library, or both?
- Should Planner artifacts live in `.planner/` by default, or inside the caller's workspace?
- How much should Planner infer automatically versus ask the human?
- Should Katana require Planner for all decomposition, or only when a planning gate is enabled?
- How should pattern packs declare compatibility with domain schema packs?
- Should dev-genie install Planner before guardrails, or bundle Planner as an internal capability?

## Recommended Decision

Planner should become a standalone shared capability in the dev-genie ecosystem, with default patterns bundled and project/plugin extensions supported.

Katana should consume Planner output for workflow decomposition and execution. dev-genie should consume Planner output for orchestration. guardrails should provide architecture and domain schema packs. audit should consume Planner output for risk-aware evaluation.

This keeps responsibilities clean:

```text
Planner: shape and sequence work
Katana: execute work
guardrails: constrain implementation
audit: evaluate quality
dev-genie: orchestrate the ecosystem
```
