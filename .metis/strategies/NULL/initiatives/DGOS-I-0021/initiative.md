---
id: decision-scope-configuration-and
level: initiative
title: "Decision Scope Configuration and Review Modes"
short_code: "DGOS-I-0021"
runtime_primitive: protocol
created_at: 2026-05-19T17:19:12.415252+00:00
updated_at: 2026-05-19T17:19:12.415252+00:00
parent: DGOS-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/discovery"


exit_criteria_met: false
estimated_complexity: M
strategy_id: NULL
initiative_id: decision-scope-configuration-and
---

# Decision Scope Configuration and Review Modes Initiative

## Context

Users need to control how autonomous the system is per decision scope. This initiative defines the policy configuration protocol consumed by the Decision Policy Engine and surfaced to Roles and Loops. Planning may be fully autonomous, design may be review-on-major, architecture may be review-required, and implementation details may be autonomous.

## Goals & Non-Goals

**Goals:**
- Add user-configurable review modes per scope: planning, product, design, architecture, frontend, backend, data/schema, migration, quality, execution.
- Support defaults by workflow type and repo maturity.
- Allow temporary overrides for a task, story, epic, or session.
- Surface current policy in generated agent instructions.

**Non-Goals:**
- Build a complex settings UI in the first pass.
- Let task-level overrides weaken protected global rules silently.

## Detailed Design

Policy config should live in repo-native YAML/JSON, likely under .katana or a shared config path. It should support inheritance:

system defaults -> repo policy -> workflow policy -> artifact override -> explicit human approval.

Each decision scope can be autonomous, notify, review, human_only, or forbidden. Confidence thresholds and risk tiers can refine each mode.

## Alternatives Considered

- One global autonomy toggle: rejected because teams trust different scopes differently.
- Per-primitive local settings only: rejected because orchestration needs a single policy source.
- Hidden CLI flags only: rejected because policy must be durable repo memory.

## Implementation Plan

- [ ] Define autonomy policy config file.
- [ ] Add scope defaults for MVP workflows.
- [ ] Add artifact/session override mechanism.
- [ ] Add policy summary to context bundles and agent instruction docs.
- [ ] Add gates that prevent forbidden overrides.
