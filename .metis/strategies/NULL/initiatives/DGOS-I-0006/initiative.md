---
id: context-engine-and-minimal-context
level: initiative
title: "Context Engine and Minimal Context Loader"
short_code: "DGOS-I-0006"
runtime_primitive: engine
created_at: 2026-05-19T16:57:17.602007+00:00
updated_at: 2026-05-19T16:57:17.602007+00:00
parent: DGOS-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/discovery"


exit_criteria_met: false
estimated_complexity: M
strategy_id: NULL
initiative_id: context-engine-and-minimal-context
---

# Context Engine and Minimal Context Loader Initiative

## Context

Roles and Loops perform best when they receive the smallest complete context: active task, relevant parent docs, architecture/design constraints, repo facts, nearby files, validation failures, and durable notes. Context loading should be a deterministic Context Engine with typed ContextBundle outputs, not repeated prompt prose embedded in each Role.

## Goals & Non-Goals

**Goals:**
- Define context bundles for each Role and execution phase.
- Load parent/child artifacts, sibling plans, repo profile facts, relevant files, and validation history.
- Keep context minimal and explain why each item was included.
- Support micro-workflow context when a runtime question is raised.

**Non-Goals:**
- Build a vector database in the MVP.
- Load entire repositories by default.
- Replace role-specific instructions.

## Detailed Design

ContextBundle should include artifact refs, file refs, command refs, validation refs, notes, exclusions, and unresolved missing context. Each Role declares required and optional context slots. The context engine fills slots deterministically first, then allows targeted code search when needed.

## Alternatives Considered

- Let every Role or Loop gather context itself: rejected because it duplicates work and causes inconsistent context quality.
- Always load full parent chains and repo summaries: rejected because context bloat weakens task focus.
- Use only semantic search: rejected because many references are explicit artifact links.

## Implementation Plan

- [ ] Define ContextBundle schema.
- [ ] Add role context profiles for planner, architect, FE, BE, developer, quality.
- [ ] Implement artifact-chain loading from Katana storage.
- [ ] Add deterministic relevant-file hooks from task files, repo profile, and validation failures.
- [ ] Use the context engine in the developer execution loop.
