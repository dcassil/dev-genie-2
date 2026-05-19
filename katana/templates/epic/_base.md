---
id: {{id}}
level: epic
title: "{{title}}"
short_code: "{{short_code}}"
subtype: {{subtype}}
parent: "{{parent}}"
created_at: {{created_at}}
updated_at: {{updated_at}}
archived: false
phase: {{phase}}
tags:
  - "#epic"
  - "#phase/{{phase}}"
exit_criteria_met: false
phase: discovery
blocked_by: []
strategy_id: {{strategy_id}}
initiative_id: {{initiative_id}}
---

## Parent Product Doc

_Link to the parent product doc by short code; no restated content._

REQUIRED

## Summary

_1–3 sentences summarizing this epic's scope and goals._

REQUIRED

## Scope

_What is included in this epic?_

REQUIRED

## Out of Scope

_What is explicitly not included?_

REQUIRED

## Architecture Decisions

_Key architectural choices and their rationale._

CONDITIONAL (subtype = architecture)

## Affected Modules / Surfaces

_Which modules, services, or user-facing surfaces does this epic touch?_

CONDITIONAL (subtype = architecture | major-feature)

## Feature Behavior

_Detailed description of how the feature works from a user or system perspective._

CONDITIONAL (subtype = major-feature)

## UX Flows & States

_User workflows, interaction patterns, and state transitions._

CONDITIONAL (subtype = ui)

## Component Inventory

_List of UI components, screens, or design elements involved._

CONDITIONAL (subtype = ui)

## Risks & Open Questions

_Known risks, dependencies, and unresolved design decisions._

OPTIONAL

## Exit Criteria

_Mechanically checkable conditions that mark this epic as complete._

REQUIRED

## Child User Stories

_List of user-story short codes that decompose this epic. May be empty before decomposition._

REQUIRED
