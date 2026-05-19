---
id: {{id}}
level: task-high-pass
title: "{{title}}"
short_code: "{{short_code}}"
subtype: null
parent: {{parent}}
story_id: {{story_id}}
pass: high
model_tier: strong
created_at: {{created_at}}
updated_at: {{updated_at}}
archived: false
phase: {{phase}}
tags:
  - "#task-high-pass"
  - "#phase/{{phase}}"
exit_criteria_met: false
blocked_by: []
strategy_id: {{strategy_id}}
initiative_id: {{initiative_id}}
---

## Parent User Story

_One-line link to the parent user story. Do not restate the story._

[{{parent}}]

## Goal

_One paragraph: what scaffold this task produces._

REQUIRED

## Files to Create or Modify

_Bulleted list of relative paths with one-line purpose each._

- `path/to/file.ts` — Purpose of this file.

## Scaffold Contract

_For each file: declared exports (names + types/signatures), required JSDoc / contract comments at function level, placeholder body convention._

### `path/to/file.ts`

**Exports:**
```typescript
export interface NamedInterface {
  field: Type;
}

export function functionName(param: Type): ReturnType;
export const CONSTANT_NAME: Type;
```

**Contract:**
- `NamedInterface` — JSDoc describing the purpose and usage of the interface.
- `functionName` — JSDoc describing inputs, outputs, and contract. Body: `throw new Error("TODO: implement (KAT-TL-XXXX)")`.
- `CONSTANT_NAME` — JSDoc describing the constant. Assign placeholder value.

## Types & Interfaces

_Typed blocks (TS or pseudo-code) lifted from the parent story's interface contract._

```typescript
// Types and interfaces from parent user story
export interface ExampleType {
  property: string;
}
```

## Cross-References

_Short codes only: parent story, sibling high-pass tasks, ADRs._

- Parent: {{parent}}
- Related: KAT-US-XXXX, KAT-A-XXXX

## Do / Don't for Executor

_OPTIONAL but recommended._

- DO focus on types, interfaces, and export stubs — no implementation logic.
- DO write contract comments explaining what each export does and what the low-pass task will implement.
- DO use the placeholder convention consistently: `throw new Error("TODO: implement (KAT-TL-XXXX)")`.
- DON'T implement business logic, loops, or conditional branches.
- DON'T write tests or deployment code.
- DON'T assume the low-pass task will infer the scaffold from code — make the contract explicit in JSDoc.

## Acceptance

_Checklist: scaffold files compile/parse, exports match contract, no implementation logic in bodies, placeholder convention used uniformly._

- [ ] All files in "Files to Create or Modify" exist.
- [ ] All exports declared in "Scaffold Contract" are present in files.
- [ ] Type signatures match the contract (parameter types, return types).
- [ ] All function bodies use the placeholder convention: `throw new Error("TODO: implement (KAT-TL-XXXX)")`.
- [ ] JSDoc comments are present on all exported functions, interfaces, and constants.
- [ ] No business logic, loops, or conditionals in function bodies.
- [ ] Files parse without syntax errors (run TypeScript compiler if applicable).

## Hand-off to Low-Pass

_The short code of the low-pass task that will consume this scaffold (KAT-TL-####); may be TBD until decomposition._

TBD
