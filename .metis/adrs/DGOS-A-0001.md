---
id: 001-engine-role-loop-primitive-split
level: adr
title: "Engine / Role / Loop Primitive Split"
number: 1
short_code: "DGOS-A-0001"
created_at: 2026-05-21T17:33:49.504686+00:00
updated_at: 2026-05-21T18:03:47.722999+00:00
decision_date: 
decision_maker: Dev-Genie maintainers
parent: 
archived: false

tags:
  - "#adr"
  - "#phase/decided"


exit_criteria_met: false
strategy_id: NULL
initiative_id: NULL
---

# ADR-1: Engine / Role / Loop Primitive Split

## Context

The Dev-Genie vision and initiative set used the word `plugin` for runtime units with incompatible execution models. That overloaded term covered deterministic services, model-backed specialist personas, and long-running execution processes. Treating those units as one kind of component makes lifecycle, invocation, observability, testing, and governance ambiguous.

The concrete ambiguity appears in current planning language:

- Deterministic capabilities such as Validation, Context loading, Repo Intelligence, Strategy classification, and Decision Policy evaluation need repeatable inputs, repeatable outputs, and no model call in the core decision path.
- Specialist responsibilities such as Planner, Designer, Architect, Principal FE, Principal BE, Project Manager, and Quality Governor need LLM reasoning bounded by role prompts, context profiles, and artifact I/O contracts.
- Stateful execution responsibilities such as the Developer execution loop and the govern-verify orchestration loop need resumable task state, retry policy, validation feedback, and durable progress records.

A single `plugin` abstraction hides these differences and leads to weak contracts: deterministic units get described like agents, role reasoning gets mixed into engines, and loops appear as one-shot calls even though they must preserve state across decisions and validation cycles.

## Decision

Dev-Genie will split runtime vocabulary into three first-class primitives: Engine, Role, and Loop. The word `plugin` remains available only for packaging or installation boundaries when referring to local plugin folders, marketplace metadata, or platform distribution. Runtime design, artifact contracts, routing, and observability must use the primitive name.

### Engine

An Engine is deterministic runtime code with typed inputs and outputs and no LLM reasoning in its core path. Engines may call tools, parse files, run validators, evaluate policy, and emit artifacts, but the same inputs must produce the same decision result except for explicit environmental changes such as command output or filesystem state.

Examples include Document Engine, Strategy Engine, Repo Intelligence Engine, Context Engine, Validation Engine, Decision Policy Engine, Guardrails checks, Audit checks, and Dev-Genie installer/reconciliation behavior when run as deterministic setup logic.

Lifecycle:

- Versioned code and schema contract.
- Unit and fixture tests are required for core behavior.
- Inputs and outputs are stable enough for other primitives to depend on.
- Changes that alter routing, policy, validation, or artifact schema behavior require migration notes.

Invocation model:

- Called synchronously by CLI, MCP tool, adapter, Role, or Loop.
- Receives explicit artifacts, config, repo paths, command profiles, or policy inputs.
- Returns typed data, artifacts, diagnostics, or skip/block results without relying on prose parsing.

Observability requirements:

- Record input artifact refs, config refs, engine version, command refs, output artifact refs, deterministic decision rationale, warnings, and errors.
- Validation and policy engines must record gate implications.
- Repo scanners and context loaders must record why each fact or context item was included.

### Role

A Role is an LLM-backed specialist with a role-specific prompt, explicit context profile, and artifact I/O contract. A Role performs bounded reasoning for one responsibility area and may ask Engines for deterministic facts. Roles must not own long-running task state beyond the invocation and emitted artifacts.

Examples include Planner, Designer, Architect, Principal FE, Principal BE, Project Manager, Quality Governor, and Refactor/Migration specialist behavior when it performs model-backed planning or review.

Lifecycle:

- Versioned prompt and artifact contract.
- Scenario tests cover expected outputs, skip behavior, missing-context behavior, and review escalation.
- Role changes must identify affected decision scopes and artifacts.
- Roles can be replaced by stronger models without changing the surrounding runtime primitive contract.

Invocation model:

- Called by a Loop, routing layer, or explicit workflow step.
- Receives a ContextBundle and source artifacts.
- Emits produced, skipped, blocked, or needs_human results with confidence, missing_context, human_review_required, source_artifacts, output_artifacts, and optional skip_reason.
- May emit DecisionRecord, task patch, follow-up artifact seed, or review checkpoint.

Observability requirements:

- Record model/provider identity when available, prompt/profile version, context refs, source artifact refs, produced artifact refs, decision scope, confidence, missing context, policy outcome, and review requirement.
- Role outputs must be inspectable without reading chat history.
- Skips and blocked states are first-class observable outcomes.

### Loop

A Loop is a long-running stateful runtime process that coordinates work over time. It may call Engines and Roles, but its defining responsibility is preserving task or orchestration state across iterations, validation feedback, retries, nested decisions, and resume boundaries.

Examples include the Developer execution loop, validation recovery behavior inside task execution, multi-agent wave execution controller, and the recursive govern-verify loop.

Lifecycle:

- Versioned state machine and resume contract.
- Explicit retry, pause, cancellation, and completion semantics.
- Durable records for active state, child work, validation attempts, decisions, and final outcome.
- Recovery behavior is tested independently from Role reasoning quality.

Invocation model:

- Started with an artifact, task, workflow request, or wave plan.
- Iterates until complete, blocked, awaiting decision, awaiting human review, cancelled, or failed.
- Calls Engines for deterministic facts and gates.
- Calls Roles through routing when a model-backed decision is needed.

Observability requirements:

- Record state transitions, current artifact/task refs, child primitive invocations, retry counts, validation reports, DecisionRequests, DecisionRecords, task patches, blocking reasons, and resume tokens or record paths.
- A Loop must be reconstructable from durable state after process loss.
- Completion must be justified by artifacts and gates rather than the loop's assertion.

## Alternatives Analysis

| Option | Pros | Cons | Risk Level | Implementation Cost |
|--------|------|------|------------|-------------------|
| Keep `plugin` as one runtime word | Simple vocabulary; matches existing directory and marketplace language | Continues conflating deterministic services, LLM roles, and stateful loops; weakens contracts; makes routing and observability inconsistent | High | Low initially, high later |
| Use two primitives only: Tool and Agent | Easier than three terms; separates deterministic code from LLM behavior | Still conflates one-shot Roles with long-running Loops; hides state, retry, resume, and validation recovery requirements | Medium | Medium |
| Split into Engine, Role, and Loop | Matches actual runtime differences; gives each unit an explicit lifecycle, invocation model, and observability contract | Requires vocabulary migration across vision, initiatives, schemas, docs, and tests | Low | Medium |

## Rationale

The three-primitive split matches the system's real execution boundaries. Engines need deterministic contracts and mechanical tests. Roles need LLM prompts and artifact I/O contracts. Loops need state machines and durable progress records. These requirements are not interchangeable, and forcing them into one runtime word makes downstream initiatives harder to decompose and validate.

The split also preserves existing packaging flexibility. A local plugin package can contain any combination of Engines, Roles, and Loops, but the runtime contract must name the primitive being invoked. This keeps marketplace and folder language compatible while making architecture documents precise.

## Consequences

### Positive
- Runtime contracts become testable because each primitive has the right lifecycle and invocation expectations.
- Orchestration can route to Engines, Roles, and Loops without guessing whether a unit is deterministic, model-backed, or stateful.
- Observability becomes sharper: deterministic decisions, model decisions, and loop state transitions get different required records.
- Workflow tests can assert primitive-specific behavior such as skip records for Roles, validation reports for Engines, and resume records for Loops.
- The vocabulary makes it easier to keep role-specific reasoning out of deterministic engines and long-running state out of one-shot role calls.

### Negative
- Existing vision, initiative, schema, and test language must be migrated away from overloaded `plugin` usage.
- Some current initiatives straddle more than one primitive and will need explicit ownership boundaries during decomposition.
- Local package names may still use plugin terminology, so documentation must distinguish package boundaries from runtime primitives.
- Contributors must learn one more layer of vocabulary before adding new runtime behavior.

### Neutral
- The split does not require immediate code movement. It changes the architectural contract first, then guides future implementation and decomposition.
- The split does not decide which package owns a primitive. It only defines how runtime units behave and how they are observed.