---
id: move-repo-detection-into-repo
level: initiative
title: "Move Repo Detection Into Repo Intelligence Plugin"
short_code: "DGOS-I-0029"
created_at: 2026-05-19T17:19:44.362532+00:00
updated_at: 2026-05-19T17:19:44.362532+00:00
parent: DGOS-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/discovery"


exit_criteria_met: false
estimated_complexity: M
strategy_id: NULL
initiative_id: move-repo-detection-into-repo
---

# Move Repo Detection Into Repo Intelligence Plugin Initiative

## Context

Repo detection currently lives inside Dev-Genie init/reconciliation. The same facts are needed by Planner, Architect, Designer, Principal FE/BE, Context Engine, and Validation Engine. Detection should move into a Repo Intelligence plugin while Dev-Genie keeps bootstrap ownership.

## Goals & Non-Goals

**Goals:**
- Move reusable detection modules into repo-intelligence ownership.
- Keep Dev-Genie init behavior working through an adapter.
- Emit RepoProfile artifacts for downstream plugins.
- Remove duplicate ad hoc repo probing from role plugins.

**Non-Goals:**
- Delete Dev-Genie reconciliation.
- Build full semantic indexing immediately.

## Detailed Design

Existing modules under dev-genie/skills/project-detection can become the initial scanner implementation. Dev-Genie calls repo-intelligence.scan during init. Planner and Context Engine consume persisted RepoProfile artifacts.

## Alternatives Considered

- Keep all detection in Dev-Genie: rejected because Dev-Genie should remain installer/meta-orchestrator.
- Copy detection into each plugin: rejected because facts would drift.

## Implementation Plan

- [ ] Create repo-intelligence plugin/module boundary.
- [ ] Move or wrap detectConfig, detectBuildCI, and agent-config lock detection.
- [ ] Define RepoProfile schema and artifact writer.
- [ ] Update Dev-Genie init to call Repo Intelligence.
- [ ] Update Planner/Context/Validation to consume RepoProfile.
