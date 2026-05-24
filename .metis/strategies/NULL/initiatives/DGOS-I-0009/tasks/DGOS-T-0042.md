---
id: governance-config-loader-and
level: task
title: "Governance config loader and schema validation for the autonomy profile and rules"
short_code: "DGOS-T-0042"
created_at: 2026-05-24T19:02:50.330084+00:00
updated_at: 2026-05-24T19:02:50.330084+00:00
parent: DGOS-I-0009
blocked_by: []
archived: false

tags:
  - "#task"
  - "#phase/todo"


exit_criteria_met: false
strategy_id: NULL
initiative_id: DGOS-I-0009
---

# Governance config loader and schema validation for the autonomy profile and rules

## Parent Initiative

[[DGOS-I-0009]] — Decision Policy & Governance. This task delivers the **governance config loader** that turns the persisted ADR-4 autonomy profile + static rules into the typed `PolicyConfig` the Engine consumes. It makes the Engine's governance config first-class, validated, and replayable, with a safe default so the Engine is always satisfiable (DGOS-A-0005 "always satisfiable; worst case unknown decision → ask human").

## Objective

Implement a typed loader in `engines/src/decision-policy/` that reads a project governance file (v1: `.dev-genie/governance.json`), validates it against `protocol/schemas/policy-config.schema.json` via the package's Ajv `validatorFor`, and returns a typed `PolicyConfig` (`autonomy_profile`, `product_baseline_approved`, `static_rules`). When the file is absent or partial it falls back deterministically to safe defaults (`DEFAULT_AUTONOMY_PROFILE` reused from daimyo, empty/`Read`-only static rules, `product_baseline_approved: false`). The loader is the *only* I/O-bearing module in the Engine package — the pure `evaluate` core never reads files; the loader hands it an in-memory `PolicyConfig`.

## Acceptance Criteria

- [ ] A `loadPolicyConfig(options: { projectDir: string; fileName?: string }): PolicyConfig` function reads `<projectDir>/.dev-genie/governance.json`, parses it, and validates against the `policy-config` schema using the package's `validatorFor("PolicyConfig")` (DGOS-T-0037 plumbing). Validation failure throws a typed `PolicyConfigError` with the Ajv error detail (no silent acceptance of malformed config).
- [ ] **Absent file** → returns a documented default `PolicyConfig`: `autonomy_profile = DEFAULT_AUTONOMY_PROFILE` (imported from daimyo, not re-declared), `product_baseline_approved: false` (the ADR-4-safe default — product delegation inactive until a baseline is approved), and a default static-rule set equivalent to daimyo's `DEFAULT_STATIC_RULES` (allow `Read/Grep/Glob/LS/TodoRead`) produced via DGOS-T-0039's `fromDaimyoStaticRules`. A test asserts the default exactly matches daimyo's defaults.
- [ ] **Partial file** (e.g. only `autonomy_profile` present) → missing keys fall back to defaults per-key, with the merge order documented and tested.
- [ ] The loaded `autonomy_profile` is validated to contain exactly the three domains with valid levels; an invalid domain/level value is a `PolicyConfigError`, not a silent default.
- [ ] A pure `resolvePolicyConfig(raw: unknown): PolicyConfig` is separated from the file read so config can also be supplied in-memory (the daimyo adapter in DGOS-T-0043 and tests inject config without touching disk). The file-reading wrapper is a thin shell over it.
- [ ] Tests cover: valid full file; absent file → defaults parity with daimyo; partial file per-key merge; invalid level → error; invalid domain key → error; malformed JSON → error; in-memory `resolvePolicyConfig` path.
- [ ] `engines/` typecheck/lint/test/build pass clean; no escape hatches. The file read is confined to the loader shell; `resolvePolicyConfig` and `evaluate` remain pure.

## Implementation Notes

### Technical Approach

- Reuse `DEFAULT_AUTONOMY_PROFILE` and the `AutonomyProfile`/`AutonomyLevel` types from daimyo (`daimyo/src/decision/autonomy.ts`) — do not re-declare the default or the shape. Reuse DGOS-T-0039's `fromDaimyoStaticRules` to produce the default static rules so loader defaults and daimyo defaults cannot drift.
- Split pure resolution (`resolvePolicyConfig`) from the I/O shell so the Engine's determinism story stays clean and the adapter can inject config. Mirror how `roles/` keeps schema validation pure and separate from any I/O.
- `.dev-genie/governance.json` is the v1 storage location chosen in the initiative's design section; the loader should accept an override path for tests and for the adapter. **Capturing/authoring** the profile (the three ADR-4 bootstrap questions) is explicitly out of scope here and owned by the bootstrap/init initiative — this task only consumes the file.

### Dependencies

- **Upstream:** [[DGOS-T-0037]] (package, `PolicyConfig` type + `policy-config` schema + Ajv `validatorFor`) and [[DGOS-T-0039]] (`fromDaimyoStaticRules` + finalized `static_rules` schema). Hard blockers.
- **Downstream:** [[DGOS-T-0043]] (the daimyo adapter loads or injects `PolicyConfig` before constructing the Engine).

### Risk Considerations

- **Silent acceptance of malformed governance config** would make policy behavior unpredictable and un-auditable. Mitigation: strict Ajv validation + typed `PolicyConfigError`, never a silent default on a *present-but-invalid* file (absent is the only defaulting case).
- **Default drift from daimyo** (loader defaults diverging from daimyo's `DEFAULT_AUTONOMY_PROFILE`/`DEFAULT_STATIC_RULES`). Mitigation: import the daimyo default + the parity test.

### Execution Profile

**Recommended Agent: opus + low.** A small, well-specified module touching the loader + the config schema usage, with clear reuse points (daimyo defaults, `fromDaimyoStaticRules`, Ajv `validatorFor`) and a clean pure/IO split. Limited cross-file reasoning; the design is settled and the implementation is the only question.

## Status Updates

*To be added during implementation.*