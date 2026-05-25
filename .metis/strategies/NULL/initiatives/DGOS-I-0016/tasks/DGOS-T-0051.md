---
id: author-installplan
level: task
title: "Author InstallPlan + ReconciliationReport protocol schemas"
short_code: "DGOS-T-0051"
created_at: 2026-05-25T17:50:59.829732+00:00
updated_at: 2026-05-25T17:50:59.829732+00:00
parent: DGOS-I-0016
blocked_by: []
archived: false

tags:
  - "#task"
  - "#phase/todo"


exit_criteria_met: false
strategy_id: NULL
initiative_id: DGOS-I-0016
---

# Author InstallPlan + ReconciliationReport protocol schemas

## Parent Initiative

[[DGOS-I-0016]] — Installer & Reconciliation Engine. **Load-bearing foundation task.** Every other task in this initiative consumes the `InstallPlan` and `ReconciliationReport` types this task adds to `protocol/`: the engine scaffold (DGOS-T-0052) types its `plan()`/`apply()` against them, the planner (DGOS-T-0054) builds an `InstallPlan`, and the applier (DGOS-T-0056) emits a `ReconciliationReport`. A wrong field shape here forces compounding rework across all of them, so it is on the critical path and assigned the highest tier.

## Objective

Add two new JSON Schemas to `protocol/schemas/` as the source of truth for the Installer Engine's typed I/O — `install-plan.schema.json` (the deterministic output of `plan()`) and `reconciliation-report.schema.json` (the structured output of `apply()`) — following the exact pattern used to add `policy-verdict`/`policy-config` (standalone Engine I/O contracts, not envelope `allOf` payloads). Regenerate the protocol TypeScript bindings, add valid + invalid fixtures, add compatibility baseline entries, and minor-bump the protocol version. No engine logic is written here — this task delivers only the typed wire contracts and their codegen/test/compat substrate.

## Acceptance Criteria

- [ ] `protocol/schemas/install-plan.schema.json` exists with `$schema` draft 2020-12, a `$id` matching the sibling-schema convention, `type: object`, `additionalProperties: false`, snake_case wire fields. Top-level required keys: `plan_version` (string, minLength 1), `engine_version` (string, minLength 1), `repo_classification` (enum `greenfield | existing`), `mutations` (array). Each `mutations[]` item: required `mutation_id` (string, minLength 1), `target` (string), `target_path` (string), `action` (enum `create | update | skip`), `write_strategy` (enum `managed_region | layered | json_merge | full_file | delegated`), `managed_marker` (string or null), `reason_code` (string enum — see below), `rationale` (string, minLength 1), `source_writer` (enum `dev-genie:agent-config | dev-genie:eslint-layered | dev-genie:claude-settings | dev-genie:audit | katana:platform`); `additionalProperties: false` on the item.
- [ ] `protocol/schemas/reconciliation-report.schema.json` exists with the same conventions. Top-level required keys: `report_version` (string), `engine_version` (string), `repo_classification` (enum `greenfield | existing`), `had_conflict` (boolean), `counts` (object with required integer fields `applied`, `skipped`, `blocked`, `conflict`), and `outcomes` (array). Each `outcomes[]` item: required `mutation_id` (string), `status` (enum **`applied | skipped | blocked | conflict`**), `reason_code` (string enum), `rationale` (string, minLength 1), and optional `detail` (object, e.g. conflicting region hash / lock source line); `additionalProperties: false` on the item.
- [ ] The `reason_code` enums are an explicit, closed set drawn from the existing `validation-report`/`policy-verdict` reason-code discipline. At minimum the plan reason codes include `missing`, `stale`, `already_satisfied`, `conflicting`, `locked`; the report reason codes include `already_satisfied`, `written`, `lock_blocked`, `managed_region_drift`, `delegated_skip`. Reason codes are reviewed against `protocol/schemas/validation-report.schema.json` (or the closest existing vocabulary) and reuse its naming style rather than inventing parallel terms.
- [ ] Both schemas are **standalone Engine I/O contracts, not `artifact-envelope` `allOf` payloads** — matching how `policy-verdict.schema.json` / `policy-config.schema.json` were added (confirm by diffing their structure). A `$comment` on each schema states this explicitly.
- [ ] `protocol`'s generated TypeScript bindings are regenerated via the existing codegen (`npm run codegen` in `protocol`, which runs `scripts/codegen.ts` → `generateTypeBindings()`); the regenerated binding exports `InstallPlan` and `ReconciliationReport` (plus any nested item types the generator emits) from `protocol`'s package entry. The TS is generated, never hand-rolled — JSON Schema stays source of truth.
- [ ] Valid fixtures exist under `protocol/fixtures/install-plan/valid/` and `protocol/fixtures/reconciliation-report/valid/` covering: a greenfield plan, an existing-repo plan with a `skip` mutation, a report with all four statuses present, and a report with `had_conflict: true`. Invalid fixtures under the respective `invalid/` dirs cover: a missing required field, an out-of-enum `status`, and an out-of-enum `action`.
- [ ] Compatibility baseline entries are added (`protocol/compatibility/baseline/schemas/install-plan.schema.json` and `.../reconciliation-report.schema.json`) and `protocol`'s `check:compat` reports the change as **additive** (new schemas added; no existing schema field removed/narrowed).
- [ ] `protocol` version is **minor-bumped** in `protocol/package.json` (and `.claude-plugin/plugin.json` if it carries a version), consistent with the additive `policy-verdict`/`policy-config` precedent (e.g. `0.4.x → 0.5.0`). The bump is restated in a status update.
- [ ] `protocol`'s full gate passes clean: `npm run test` (which runs `validate:schemas` + `check:codegen` + `check:compat` + vitest), `typecheck`, `lint` (`--max-warnings=0`). No eslint/tsconfig rule disabled; no `any`/`unknown`/ts-ignore escape hatches. `pnpm -r build` stays green and the other four workspace packages remain unaffected (no consumer references the new types yet).

## Implementation Notes

### Technical Approach

- Copy the structure of `protocol/schemas/policy-verdict.schema.json` and `policy-config.schema.json` for the standalone-contract pattern (no `allOf`/envelope). Use the same `$schema`/`$id` host (`https://dev-genie.local/protocol/schemas/...`), `additionalProperties: false`, snake_case fields, and per-property `description` strings (the existing schemas describe every field — match that bar).
- After authoring schemas, run protocol's codegen (`npm run codegen`) and rebuild (`npm run build`); verify the generated binding surfaces `InstallPlan`/`ReconciliationReport` before any downstream task consumes them.
- For compatibility baselines and fixtures, mirror the on-disk layout already present for `policy-verdict`/`policy-config` (`protocol/fixtures/<artifact>/valid|invalid/*.json`, `protocol/compatibility/baseline/schemas/<artifact>.schema.json`).
- Reason-code vocabulary: read `protocol/schemas/validation-report.schema.json` (and `policy-verdict`'s `conflict_class`) first; reuse the established status/conflict words (`applied`/`skipped`/`blocked`/`conflict`) rather than coining synonyms.
- Files touched: `protocol/schemas/install-plan.schema.json` (new), `protocol/schemas/reconciliation-report.schema.json` (new), regenerated `protocol` TS binding (generated file under `protocol/src` per codegen output), `protocol/fixtures/install-plan/**` (new), `protocol/fixtures/reconciliation-report/**` (new), `protocol/compatibility/baseline/schemas/*.schema.json` (new), `protocol/package.json` (version bump), and the protocol plugin manifest version if present.

### Dependencies

- **Upstream:** none — this is the first task. Depends only on the already-shipped `protocol` package (schemas + codegen + compat gate) established by DGOS-I-0009/DGOS-T-0037.
- **Downstream:** DGOS-T-0052 (engine scaffold) imports these types; DGOS-T-0054 (planner) constructs `InstallPlan`; DGOS-T-0056 (applier) emits `ReconciliationReport`; DGOS-T-0057 (fixtures/seam) validates real artifacts against these schemas.

### Risk Considerations

- **Over-fitting the schema to today's two writers.** Mitigation: the `target`/`source_writer` fields are extensible enums covering the known dev-genie + katana writers; keep `reason_code` a closed but reviewed set. Do not bake katana-only or dev-genie-only fields into the shared mutation shape — write_strategy + source_writer carry the variance.
- **Accidentally modeling these as envelope artifacts.** Mitigation: the explicit standalone-contract acceptance criterion + `$comment`, and the diff-against-policy-verdict check.
- **Codegen path fragility.** Mitigation: run and commit the regenerated binding; rely on protocol's `check:codegen` gate to catch drift.
- **Compat gate flagging a non-additive change.** Mitigation: only *add* schemas and baselines; touch no existing schema. Confirm `check:compat` reports additive before bumping.

### Execution Profile

**Recommended Agent: opus + high.** Defines the typed wire contracts every downstream task in the initiative consumes, must get the field shape and reason-code vocabulary right the first time (compounding rework otherwise), and spans the protocol schema + codegen + fixtures + compat-baseline + version-bump surface. Contract-defining and load-bearing.

## Status Updates

*To be added during implementation.*
