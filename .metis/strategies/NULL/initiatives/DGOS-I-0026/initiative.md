---
id: principal-fe-be-autonomous
level: initiative
title: "Principal FE/BE Autonomous Implementation Planning"
short_code: "DGOS-I-0026"
runtime_primitive: role
created_at: 2026-05-19T17:19:32.943351+00:00
updated_at: 2026-05-19T17:19:32.943351+00:00
parent: DGOS-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/discovery"


exit_criteria_met: false
estimated_complexity: L
strategy_id: NULL
initiative_id: principal-fe-be-autonomous
---

# Principal FE/BE Autonomous Implementation Planning Initiative

## Context

The Principal FE Role and Principal BE Role should convert approved product/design/architecture intent into implementation plans, reusable component plans, data contracts, schema plans, and task seeds. They should also answer runtime FE/BE planning DecisionRequests while respecting Architect Role decisions and policy boundaries.

## Goals & Non-Goals

**Goals:**
- Principal FE emits FrontendPlan, component plan, page/view plan, state plan, and FE task seeds.
- Principal BE emits BackendPlan, DomainModel, SchemaPlan, APIContract, migration map, and BE task seeds.
- Both Roles can return skip records when their surface is not involved.
- Both Roles answer scoped runtime DecisionRequests.

**Non-Goals:**
- Execute developer tasks.
- Override Architect decisions on shared contracts.
- Create duplicated reusable components when existing ones fit.

## Detailed Design

Principal FE and BE consume repo profile, design/architecture artifacts, stories, and runtime questions. Dashboard strategy should push them to identify skeleton work, reusable primitives, data contracts, vertical slices, and hardening tasks.

Review policy controls schema/API/component-library changes. Low-risk implementation planning can be autonomous.

## Alternatives Considered

- Fold FE/BE planning into Planner: rejected because implementation planning needs domain-specific repo context.
- Let Developer discover reusable components during coding: rejected because duplication starts there.

## Implementation Plan

- [ ] Define FE/BE plan artifact schemas.
- [ ] Add skip behavior for no-surface cases.
- [ ] Add runtime FE/BE DecisionRequest handlers.
- [ ] Add reusable primitive detection for dashboards.
- [ ] Add task seed outputs for Project Manager.
