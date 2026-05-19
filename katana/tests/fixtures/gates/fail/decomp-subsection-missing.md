<!-- expected-gate: decomp-schema -->
<!-- expected-code: decomp.subsection-missing -->
---
id: subsection-missing-story
level: user-story
title: "Missing Subsection"
short_code: "KAT-US-8022"
subtype: interface-contract
parent: "KAT-E-8001"
created_at: 2026-05-09T18:19:00.000000+00:00
updated_at: 2026-05-09T18:19:00.000000+00:00
archived: false
phase: ready
tags:
  - "#user-story"
  - "#phase/ready"
exit_criteria_met: false
blocked_by: []
strategy_id: null
initiative_id: null
---

## Parent Epic

[KAT-E-8001](../pass/epic.md) — Test Epic

## Story

User story missing Low-pass subsection.

## Acceptance Criteria

- Error triggered on missing subsection.

## Interface Contract

```typescript
export interface Test {
  id: string;
}
```

## Data Shapes

Standard shapes.

## Edge Cases

None.

## Out of Scope

Other validations.

## Child Tasks

### High-pass

- KAT-TH-8023
