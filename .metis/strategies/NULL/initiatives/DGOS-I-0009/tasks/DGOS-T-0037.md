---
id: scaffold-the-engines-package-and
level: task
title: "Scaffold the engines package and Decision Policy Engine types + protocol schemas"
short_code: "DGOS-T-0037"
created_at: 2026-05-24T19:02:37.889198+00:00
updated_at: 2026-05-24T19:02:37.889198+00:00
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

# Scaffold the engines package and Decision Policy Engine types + protocol schemas

## Parent Initiative

[[DGOS-I-0009]] — Decision Policy & Governance. This is the **load-bearing groundwork task** of the initiative. It creates the new `engines/` sibling package and establishes the typed protocol contracts (`PolicyVerdict`, `PolicyConfig`/governance config, `PolicyDecisionInput`) plus the in-code domain types that every subsequent task in this initiative consumes. A wrong abstraction here forces compounding rework across classification (DGOS-T-0038), rules (DGOS-T-0039), conflict (DGOS-T-0040), the verdict assembler (DGOS-T-0041), the loader (DGOS-T-0042), and the daimyo adapter (DGOS-T-0043).

## Objective

Create a new sibling package `engines/` (peer of `protocol/`, `daimyo/`, `roles/`, `protocol-proof/`) following the proven `roles/` layout, and within it scaffold the Decision Policy Engine at `engines/src/decision-policy/` with: (1) the JSON Schema source-of-truth additions to `protocol/` for the Engine's typed I/O, (2) the in-code domain types that re-use rather than re-declare daimyo's autonomy substrate, and (3) the package's Ajv protocol-validation plumbing. No policy *logic* is implemented here beyond stubs that the downstream tasks fill in — this task delivers the package, the contracts, and the compile/test/lint substrate.

The Engine's typed contract per ADR-1 (deterministic Engine, typed I/O, no model call): given a `PolicyDecisionInput` (a protocol `DecisionRequest` payload plus the loaded `PolicyConfig`), it returns a `PolicyVerdict` — `{ outcome: "permit" | "route" | "stop", conflict_class: "no_conflict" | "soft_conflict" | "hard_conflict", review_required: boolean, route_to: "parent_loop" | "role" | "human" | null, classified_domain, classified_scope, rationale, matched_rule_refs, engine_version }`.

## Acceptance Criteria

- [ ] A new package `engines/` exists as a peer of `protocol`/`daimyo`/`roles`/`protocol-proof`, with `package.json` (name `engines`, version `0.1.0`), `tsconfig.json`/`tsconfig.build.json`, `eslint.config.mjs`, and `.claude-plugin/plugin.json` matching the conventions of `roles/` (see `roles/package.json`), with `file:../protocol` and `file:../daimyo` dependencies.
- [ ] `engines/` is **library-only** (no `.claude-plugin/marketplace.json` entry — it exposes no command or MCP server yet); a root `.gitignore` un-ignore line for `engines/dist/` is added consistent with the repo `dist/` rule. This decision is restated in a status update.
- [ ] Two new JSON Schemas are added to `protocol/schemas/` as the source of truth, snake_case wire fields, consistent with the existing `decision-request.schema.json`/`decision-record.schema.json` style and the `artifact-envelope` composition pattern where applicable: `policy-verdict.schema.json` (the Engine output: `outcome` enum `permit|route|stop`, `conflict_class` enum, `review_required` bool, `route_to` enum-or-null, `classified_domain` enum `engineering|product|design`, `classified_scope` enum `local|moderate|major`, required `rationale` string, `matched_rule_refs` string array, `engine_version` string) and `policy-config.schema.json` (governance config: an `autonomy_profile` object with `engineering`/`product`/`design` each one of `always_in_loop|big_questions_only|delegate`, a `product_baseline_approved` boolean, and a `static_rules` object — its detailed rule shape is finalized by DGOS-T-0039 but the top-level key and a permissive placeholder for rules are reserved here).
- [ ] The `protocol` package's generated TypeScript bindings are regenerated so `PolicyVerdict` and `PolicyConfig` types are available from `protocol`'s package entry (run protocol's existing codegen script; do not hand-roll the artifact TS types — JSON Schema stays the source of truth, mirroring DGOS-T-0029's rule).
- [ ] `engines/src/decision-policy/` exports a `PolicyDecisionInput` type and a `DecisionPolicyEngine` interface/class with a single `evaluate(input: PolicyDecisionInput): PolicyVerdict` method (synchronous, no `Promise`, no I/O, no model client — enforcing the deterministic Engine contract structurally). For this task `evaluate` may return a minimal hard-coded `route`/fall-through verdict; subsequent tasks implement the real logic.
- [ ] The Engine's autonomy types are **re-exported from daimyo, not re-declared**: `engines/` imports `AutonomyProfile`, `AutonomyLevel`, `AutonomyDomain`, `DecisionScope` (and references `evaluateAutonomyThreshold`/`DEFAULT_AUTONOMY_PROFILE`) from daimyo's package entry (`daimyo/src/decision/autonomy.ts`). A test asserts the imported `AutonomyProfile` shape is used directly (no parallel local interface with the same fields).
- [ ] Ajv protocol-schema validation is wired in `engines/` by porting the `validatorFor(artifactType)` approach from `roles/src/schemas/protocol-schemas.ts` (Ajv 2020 loader reading the sibling `protocol/schemas` dir), with a test that the loader resolves in the `engines/` package context and validates a sample `PolicyVerdict` and `PolicyConfig`.
- [ ] `engines/` `npm run typecheck`/`lint`/`test`/`build` all pass clean; no eslint/tsconfig rule disabled; no `any`/`unknown` casts, `ts-ignore`, or `ts-expect-error` escape hatches. `protocol` and `daimyo` still build/test clean after the schema additions.

## Implementation Notes

### Technical Approach

- Mirror `roles/`'s package layout, tsconfig/eslint strictness, and `file:` linking exactly (see `roles/package.json`); inherit the same lint/type bar. Use esbuild + `tsc -p tsconfig.build.json` for the build, as `roles/` does.
- Add the two schemas to `protocol/schemas/`, then run protocol's existing schema→TS codegen (`protocol/scripts`) and rebuild `protocol`. Verify the generated `protocol` binding exports `PolicyVerdict`/`PolicyConfig` before consuming them in `engines/`.
- For the autonomy re-use: import from daimyo's package entry, not a deep path, if daimyo re-exports `./decision`; confirm daimyo's `src/index.ts`/exports surface `autonomy.ts` (it exports `./decision` per `daimyo/src/decision/index.ts`). If a needed symbol is not re-exported by daimyo's entry, the smallest correct fix is to add the re-export in daimyo (a one-line export + daimyo version patch-bump per the repo rule) rather than reaching into daimyo internals.
- Generalize `roles/src/schemas/protocol-schemas.ts` into `engines/src/schemas/protocol-schemas.ts`, copying its multi-candidate sibling-`protocol/schemas` path resolution.

### Dependencies

- **Upstream:** none within this initiative — first task. Depends only on the already-shipped `protocol` (schemas + codegen) and `daimyo` (autonomy types) packages.
- **Downstream:** every other task in DGOS-I-0009 (DGOS-T-0038 through DGOS-T-0043) builds on this package, the `PolicyVerdict`/`PolicyConfig` schemas, and the `DecisionPolicyEngine.evaluate` seam.

### Risk Considerations

- **Schema/type drift between `protocol` and `daimyo`'s in-code verdict.** daimyo already has a `DecisionVerdict` (`{type,suggested_choice,...}`) which is a *different* artifact from this `PolicyVerdict` (the Engine's deterministic outcome). Mitigation: name them distinctly, document that `PolicyVerdict` is the Engine-internal/Tier-0 outcome and `DecisionVerdict` is daimyo's wire verdict; the adapter (DGOS-T-0043) maps one to the other. Do not conflate the two.
- **Re-declaring the autonomy shape by accident.** Mitigation: the explicit "imported, not re-declared" acceptance test above.
- **Codegen path fragility** (protocol schema→TS generation). Mitigation: run and commit the regenerated binding; add the schema-loader resolution test.
- **Package sprawl vs cohesion.** `engines/` is deliberately a shared home for the Engine family (per the initiative's design section); do not create a one-off `decision-policy/` top-level package.

### Execution Profile

**Recommended Agent: opus + high.** Creates a new package, defines the protocol contracts and the `DecisionPolicyEngine` seam that all six downstream tasks consume, and must get the daimyo-autonomy re-use boundary right. Contract-defining, multi-file, cross-package (protocol codegen + daimyo re-export), and load-bearing for the entire initiative.

## Status Updates

*To be added during implementation.*