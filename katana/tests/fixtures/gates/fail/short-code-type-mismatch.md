<!-- expected-gate: short-code-schema -->
<!-- expected-code: short-code.type-mismatch -->
---
id: type-mismatch-story
level: user-story
title: "Type Mismatch"
short_code: "KAT-E-8013"
subtype: interface-contract
parent: "KAT-E-8001"
created_at: 2026-05-09T18:09:00.000000+00:00
updated_at: 2026-05-09T18:09:00.000000+00:00
archived: false
phase: discovery
tags:
  - "#user-story"
  - "#phase/discovery"
exit_criteria_met: false
blocked_by: []
strategy_id: null
initiative_id: null
---

## Parent Epic

[KAT-E-8001](../pass/epic.md) — Test Epic

## Story

User story with epic short code type.

## Acceptance Criteria

- Error triggered on type mismatch.

## Interface Contract

```typescript
export interface Test {
  id: string;
}
```

## Data Shapes

Standard shapes per schema.

## Edge Cases

None.

## Out of Scope

Other validations.

## Child Tasks

### High-pass

### Low-pass
