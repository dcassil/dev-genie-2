---
id: context-engine
level: initiative
title: "Context Engine"
short_code: "DGOS-I-0007"
created_at: 2026-05-21T17:45:11.469946+00:00
updated_at: 2026-05-21T17:45:11.469946+00:00
parent: DGOS-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/discovery"


exit_criteria_met: false
estimated_complexity: M
strategy_id: NULL
initiative_id: context-engine
---

# Context Engine Initiative

## Context

Loops and Roles need bounded, relevant context rather than full repo or chat inheritance. Without a dedicated Context Engine, each runtime surface will assemble context differently, increasing cost, inconsistency, and hidden coupling.

This initiative preserves the original Context Engine intent and aligns it with the recursive loop and typed Role invocation model.

## Goals & Non-Goals

**Goals:**
- Assemble minimal useful context bundles for Roles and execution nodes.
- Use artifact refs, repo facts, validation history, and ownership boundaries to choose context deterministically.
- Reduce overloading of model context windows.
- Make context selection inspectable and reproducible.

**Non-Goals:**
- Decide strategy or completion authority.
- Replace Repo Intelligence with direct scanning logic.
- Let execution nodes pull arbitrary broad context by default.

## Architecture

### Overview

The Context Engine sits between artifact and repository facts on one side and Role or Loop invocation on the other. It selects the smallest useful context bundle for the operation being requested.

### Sequence Diagrams

Role or Loop requests context -> Context Engine loads active artifacts, parent ownership, repo facts, and recent validation/decision records -> emits a bounded context bundle -> caller uses that bundle for the next step.

## Detailed Design

Context assembly should consider:

- current artifact and direct parent chain
- relevant sibling or dependency artifacts only when ownership boundaries require them
- repo facts from Repo Intelligence
- recent validation failures and DecisionRecords
- relevant files or interfaces tied to the owned work surface

The engine should bias toward narrow bundles and record why each item was included.

Sibling context should not be loaded by leaf choice alone. The parent decides whether sibling context is needed by comparing declared ownership surfaces and runtime touch reports, then requests targeted sibling context only for soft or hard conflict cases.

## Alternatives Considered

- Let each Role or Loop assemble context ad hoc: rejected because it leads to inconsistent and unreviewable context choices.
- Always load large parent chains and broad file sets: rejected because it increases cost and confusion.
- Use only chat history for context: rejected because durable, machine-readable state is a core requirement.

## Implementation Plan

- [ ] Define `ContextBundle` shape and provenance fields.
- [ ] Implement deterministic selection rules for artifacts, repo facts, and file refs.
- [ ] Add support for validation-history, DecisionRecord inclusion, and parent-triggered sibling-context expansion.
- [ ] Add role- and loop-specific context profiles.
- [ ] Add fixture coverage for narrow vs expanded context selection paths.
