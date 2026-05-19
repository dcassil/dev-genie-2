---
id: workflow-test-harness-and-scenario
level: initiative
title: "Workflow Test Harness and Scenario Corpus"
short_code: "DGOS-I-0012"
created_at: 2026-05-19T17:18:28.881034+00:00
updated_at: 2026-05-19T17:18:28.881034+00:00
parent: DGOS-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/discovery"


exit_criteria_met: false
estimated_complexity: M
strategy_id: NULL
initiative_id: workflow-test-harness-and-scenario
---

# Workflow Test Harness and Scenario Corpus Initiative

## Context

Before the engines are built, the repo needs a workflow test harness and scenario corpus. These tests should prove each engine independently and prove full workflows end-to-end. The corpus should be artifact-driven, deterministic where possible, and usable by both unit tests and dogfood runs.

## Goals & Non-Goals

**Goals:**
- Define a standard scenario format with input artifacts, repo fixture, policy config, expected plugin calls, expected output artifacts, and review prompts.
- Provide fixtures for product planning, runtime decisions, dashboard task mapping, design autonomy, architecture escalation, validation recovery, and plugin skip behavior.
- Let each engine run against scenarios before full orchestration exists.
- Make failures explain which contract or plugin behavior regressed.

**Non-Goals:**
- Build a full UI test runner.
- Require live model calls for every scenario.
- Replace normal unit tests in plugin packages.

## Detailed Design

Scenario files should live under a test corpus such as tests/workflows/scenarios. Each scenario declares:

- name and purpose
- starting repository fixture
- starting artifacts
- decision policy config
- allowed autonomous scopes
- expected plugin route sequence
- expected artifacts and skip records
- expected human review checkpoints
- validation expectations

The harness should support dry-run execution with fake plugin adapters and later live dogfood execution with real plugins.

## Alternatives Considered

- Add workflow tests only after implementation: rejected because the implementation would drift without fixed acceptance scenarios.
- Use prose-only acceptance examples: rejected because routing, policy, and artifact outputs must be mechanically checked.
- Require full end-to-end tests for every change: rejected because each engine also needs isolated contract tests.

## Implementation Plan

- [ ] Define workflow scenario schema.
- [ ] Add fixture loading and fake plugin adapters.
- [ ] Add assertions for route sequence, artifacts, policy decisions, and review checkpoints.
- [ ] Add scenario corpus for DGOS-I-0013 through DGOS-I-0019.
- [ ] Wire the harness into CI once package layout is settled.
