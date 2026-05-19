---
id: workflow-test-dashboard-strategy
level: initiative
title: "Workflow Test: Dashboard Strategy and Task Mapping"
short_code: "DGOS-I-0015"
created_at: 2026-05-19T17:18:46.174117+00:00
updated_at: 2026-05-19T17:18:46.174117+00:00
parent: DGOS-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/discovery"


exit_criteria_met: false
estimated_complexity: M
strategy_id: NULL
initiative_id: workflow-test-dashboard-strategy
---

# Workflow Test: Dashboard Strategy and Task Mapping Initiative

## Context

Dashboard work is the canonical strategy test because it needs product planning, UX, architecture, FE/BE planning, reusable components, vertical slices, and hardening. It also tests whether the system avoids naive page-only decomposition.

## Goals & Non-Goals

**Goals:**
- Verify dashboard strategy selects a hybrid plan: skeleton, reusable components, data contracts, vertical slices, hardening.
- Verify Designer, Architect, Principal FE, Principal BE, Quality Governor, and Project Manager all participate when needed.
- Verify no-backend or no-new-component cases produce skip records.
- Verify task sequencing prevents duplicated component work.

**Non-Goals:**
- Implement a real dashboard.
- Decide a final visual style.

## Detailed Design

Expected route:

RepoProfile -> Planner -> Designer -> Architect -> Principal BE -> Principal FE -> Quality Governor -> Project Manager.

Expected task strategy:

1. App/dashboard skeleton
2. Reusable primitives such as StatCard, DataTable wrapper, FilterBar, ChartPanel, EmptyState, ErrorState, LoadingSkeleton, DateRangeControl, DashboardSection
3. Data contracts and query/API functions
4. Vertical feature slices
5. Responsive/accessibility/test hardening

## Test Cases

- Existing component library: Principal FE reuses components and creates fewer primitive tasks.
- No backend changes: Principal BE returns skip with rationale.
- New data contract: Architect and Principal BE require review if policy marks API/schema as review-required.
- Project Manager emits hybrid task graph, not only page tasks.

## Implementation Plan

- [ ] Add dashboard repo fixture with partial component library.
- [ ] Add expected plugin route graph.
- [ ] Assert task categories and dependency order.
- [ ] Assert reusable component tasks precede vertical feature slice tasks.
