---
id: {{id}}
level: product-doc
title: "{{title}}"
short_code: "{{short_code}}"
subtype: {{subtype}}
created_at: {{created_at}}
updated_at: {{updated_at}}
archived: false
phase: {{phase}}
tags:
  - "#product-doc"
  - "#phase/{{phase}}"
exit_criteria_met: false
phase: draft
blocked_by: []
strategy_id: {{strategy_id}}
initiative_id: {{initiative_id}}
---

## Purpose

_What problem does this solve and for whom?_

REQUIRED

## Audience

_Who are the primary stakeholders and decision-makers for this initiative?_

REQUIRED

## Problem & Current State

_What is the current situation, and what gaps or pain points exist?_

REQUIRED

## Goals / Non-Goals

_What does success look like, and what is explicitly out of scope?_

REQUIRED

## Architecture Overview

_High-level system structure, components, and how they interact._

CONDITIONAL (subtype = architecture | system-design)

## System Components & Boundaries

_Detailed breakdown of major components, their responsibilities, and boundaries._

CONDITIONAL (subtype = system-design)

## Data Model Sketch

_Key entities, relationships, and how data flows through the system._

CONDITIONAL (subtype = system-design)

## UX Surfaces & Flows

_User-facing interfaces, workflows, and interaction patterns._

CONDITIONAL (subtype = ui)

## Visual / Interaction Principles

_Design language, visual hierarchy, and interaction guidelines._

CONDITIONAL (subtype = ui)

## Constraints

_Technical, business, or organizational constraints that affect the solution._

REQUIRED

## Success Criteria

_Measurable outcomes that define whether this initiative succeeded._

REQUIRED

## Open Questions

_Unresolved design or technical decisions that need clarification._

OPTIONAL

## Child Epics

_List of epic short codes that decompose this product doc. May be empty before decomposition._

REQUIRED
