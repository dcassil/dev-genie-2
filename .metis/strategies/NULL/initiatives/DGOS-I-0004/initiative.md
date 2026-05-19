---
id: repo-intelligence-engine-extraction
level: initiative
title: "Repo Intelligence Engine Extraction"
short_code: "DGOS-I-0004"
runtime_primitive: engine
created_at: 2026-05-19T16:57:11.868341+00:00
updated_at: 2026-05-19T16:57:11.868341+00:00
parent: DGOS-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/discovery"


exit_criteria_met: false
estimated_complexity: M
strategy_id: NULL
initiative_id: repo-intelligence-engine-extraction
---

# Repo Intelligence Engine Extraction Initiative

## Context

Dev-Genie already has read-only repo detection modules for package managers, lint/type configs, CI, hooks, audit state, scripts, and agent-config locks. These should become a reusable Repo Intelligence Engine: a deterministic primitive that emits RepoProfile facts for Roles and Loops instead of remaining hidden inside init/reconciliation.

## Goals & Non-Goals

**Goals:**
- Produce a RepoProfile artifact from deterministic scanners.
- Preserve the existing detection and reconciliation behavior.
- Add framework/package/route/component/schema/test/command inventory over time.
- Make downstream Roles and Loops query repo facts instead of re-scanning ad hoc.

**Non-Goals:**
- Build a full semantic code index in the first pass.
- Replace specialized static analysis tools such as audit.
- Infer product intent from code without human or artifact input.

## Detailed Design

RepoProfile should include manifests, package manager, frameworks, scripts, lint/type configs, CI, hooks, test commands, audit state, agent configs, architecture catalog match, and confidence. Later versions can add routes, DB schemas, UI components, API surfaces, and code ownership surfaces.

The first implementation can wrap existing modules under dev-genie/skills/project-detection and expose a stable CLI/MCP-compatible JSON shape.

## Alternatives Considered

- Leave detection in Dev-Genie init: rejected because Planner, Architect, Context, and Validation also need the same facts.
- Start with AST-wide indexing: rejected as too broad for the MVP.
- Use model-only repo summaries: rejected because these facts are deterministic and should be repeatable.

## Implementation Plan

- [ ] Define RepoProfile schema.
- [ ] Wrap existing detectConfig and build/CI scanners behind repo-intelligence.scan.
- [ ] Store RepoProfile as a Katana artifact.
- [ ] Feed RepoProfile into Planner and Guardrails/Audit reconciliation.
- [ ] Add route/schema/component inventory after MVP flow works.
