---
id: compatibility-versioning
level: task
title: "Compatibility/Versioning Enforcement & Fixture Corpus"
short_code: "DGOS-T-0020"
created_at: 2026-05-23T18:56:13.150320+00:00
updated_at: 2026-05-23T18:56:13.150320+00:00
parent: DGOS-I-0001
blocked_by: []
archived: false

tags:
  - "#task"
  - "#phase/todo"


exit_criteria_met: false
strategy_id: NULL
initiative_id: DGOS-I-0001
---

# Compatibility/Versioning Enforcement & Fixture Corpus

## Parent Initiative

[[DGOS-I-0001]] — turns the versioning rules from [[DGOS-T-0014]] into enforced, tested guarantees and assembles the full fixture corpus across the v1 catalog, so producers can evolve schemas without silently breaking consumers.

## Objective

Implement **machine-enforced compatibility/versioning checks** and assemble the **full fixture corpus** across all v1 artifact types. This is the initiative's "fixture-based tests for schema validation and compatibility checks" deliverable: prove that valid artifacts validate, invalid ones don't, and that a `schema_version`/`protocol_version` change is classified correctly (backward-compatible vs breaking) by an automated check rather than reviewer memory.

## Acceptance Criteria

- [ ] A comprehensive fixture corpus exists with `valid/` and `invalid/` examples for every v1 artifact type (`ExecutionRecord`, `ValidationReport`, `DecisionRequest`, `DecisionRecord`, `RoleInvocation`, `RoleResult`) plus the shared sub-schemas — run by the T-0013 harness in CI/`npm test`.
- [ ] A **schema-evolution / back-compat check** is implemented: given a prior version of a schema and the current one, the check classifies the change as backward-compatible or breaking and asserts that `schema_version`/`protocol_version` were bumped accordingly (e.g. adding an optional field is compatible; removing/retyping a required field is breaking and must bump appropriately). Encode the rules T-0014 wrote.
- [ ] A **producer/consumer compatibility test**: a consumer pinned to `protocol_version` N can still read artifacts a producer emits within N's compatibility guarantees; an incompatible bump is detected.
- [ ] At least one fixture per type is a **real artifact captured from `daimyo`** (post-[[DGOS-T-0019]]) to prove the protocol matches what the runtime actually emits — not just hand-written examples.
- [ ] The drift check (generated TS vs schema) from [[DGOS-T-0013]] is part of the same `npm test`/CI gate, so schema, binding, and fixtures can never silently diverge.
- [ ] All checks run green; the README documents how to add a fixture and how the compat check decides compatible-vs-breaking.
- [ ] `protocol` version bumped if its surface changed; the package's test/build all pass.

## Implementation Notes

### Technical Approach

- Build the back-compat classifier on top of the JSON Schemas: compare the previous committed schema against the current (a stored snapshot or git-based prior) and apply structural rules (added-optional = compatible; removed/required-tightened/retyped = breaking). Keep the rules the ones [[DGOS-T-0014]] documented.
- Capture daimyo-produced fixtures by serializing real artifacts from a daimyo run/test (after [[DGOS-T-0019]] makes daimyo emit protocol-conformant artifacts) and committing them as `valid/` fixtures — this is the strongest proof the contract matches reality.
- Fold the T-0013 drift check, the fixture validation, and the compat check into one test gate so the source-of-truth invariant is continuously enforced.

### Dependencies

- **Upstream:** [[DGOS-T-0013]] (harness + drift check), [[DGOS-T-0014]] (versioning rules to enforce), [[DGOS-T-0015]]–[[DGOS-T-0018]] (all schemas to fixture), [[DGOS-T-0019]] (daimyo emits conformant artifacts to capture as fixtures).
- **Downstream:** none in this initiative — this is the closing quality gate. Future producers (Engines/Roles, DGOS-I-0008/0009/0010) inherit the corpus + compat check.

### Risk Considerations

- **Compat classifier too permissive** lets a breaking change ship without a version bump — the exact failure the initiative wants to prevent. Mitigation: err toward classifying ambiguous changes as breaking; test the classifier itself with known compatible/breaking pairs.
- **Hand-written-only fixtures** can drift from runtime reality. Mitigation: require at least one captured-from-daimyo fixture per type.
- **Split gates** (drift vs fixtures vs compat in different commands) let one rot. Mitigation: single `npm test` gate.

### Execution Profile

**Recommended Agent: opus + medium.** Substantive test/tooling work (compat classifier + corpus + unified gate) building on the fixed schemas and the T-0013 harness; the reasoning is in the compat-classification rules, which T-0014 already specified, so it's pattern-completion rather than new architecture.

## Status Updates

*To be added during implementation.*
