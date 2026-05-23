---
id: protocol-package-scaffold-json
level: task
title: "Protocol Package Scaffold, JSON-Schema→TS Codegen & Fixture Harness"
short_code: "DGOS-T-0013"
created_at: 2026-05-23T18:56:05.057569+00:00
updated_at: 2026-05-23T18:56:05.057569+00:00
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

# Protocol Package Scaffold, JSON-Schema→TS Codegen & Fixture Harness

## Parent Initiative

[[DGOS-I-0001]] — establishes the foundation for the shared artifact protocol: the package, the JSON-Schema-source-of-truth → TypeScript-binding codegen pipeline, and the fixture-validation harness every subsequent task uses.

## Objective

Create a new top-level sibling package **`protocol`** that holds the artifact protocol's **JSON Schemas as the authoritative source of truth** and a **generated TypeScript binding**, plus the **fixture-based validation harness** the rest of the initiative builds on. Per the initiative's design-of-record (decided 2026-05-23): JSON Schema is the portable contract; the TS types are *generated/reconciled from it*, not authored independently; Rust is dropped for v1. This task ships no concrete artifact schemas — it ships the authoring/codegen/test machinery so tasks T-0014–T-0020 can add schemas uniformly.

## Acceptance Criteria

- [ ] A `protocol/` package exists at repo top level, mirroring the conventions of `daimyo`/`katana` (npm package + `.claude-plugin/plugin.json` if it ships as a plugin, or a plain workspace package if not — choose and document; committed build output un-ignored in root `.gitignore` if a build emits artifacts).
- [ ] A `schemas/` directory holds JSON Schema files (draft 2020-12 or a documented chosen draft); a single command validates that all schema files are themselves well-formed.
- [ ] A **codegen pipeline** turns the JSON Schemas into a TypeScript binding (a generated `src/generated/` or `dist/` of types). The generated output is reproducible from `npm run <codegen>` and the command fails if generated output is stale (drift check), so the schema stays the source of truth.
- [ ] A **fixture harness**: a directory layout for `valid/` and `invalid/` example payloads per artifact type, plus a test runner that asserts valid fixtures pass and invalid fixtures fail their schema. Adding a new artifact type later requires only dropping in a schema + fixtures.
- [ ] TypeScript + lint config matches the repo's existing standards (no new relaxed rules; reuse sibling conventions). `npm run typecheck`/`lint`/`test`/`build` (whatever subset applies) all pass on the empty-but-wired package.
- [ ] A short README documents: schema = source of truth, how to add an artifact type, how to regenerate the TS binding, and how fixtures work.
- [ ] No concrete v1 artifact schemas are authored here (those are T-0014–T-0018) — but at least one trivial throwaway schema + fixtures may exist to prove the pipeline, clearly marked as a sample to delete.

## Implementation Notes

### Technical Approach

- Pick a JSON-Schema→TS generator (e.g. `json-schema-to-typescript`) and wire it as an `npm run codegen` script; commit the generated output and add a CI-style drift check (`codegen && git diff --exit-code`-style) as a test or script.
- Pick a runtime JSON Schema validator (e.g. `ajv`) for the fixture harness; the harness loads each schema, compiles it, and runs `valid/`/`invalid/` fixtures through it.
- Decide whether `protocol` is a Claude-Code plugin or a plain package. It is consumed as a library by `daimyo` (and future Engines/Roles), so a plain workspace/npm package it depends on is the likely right call — but mirror `daimyo`'s tooling so the marketplace/build story stays uniform. Document the choice.
- Keep the package free of any runtime dependency on `daimyo` or sibling plugins — the dependency arrow points *into* `protocol`, never out.

### Dependencies

- **Upstream:** none — this is the foundation task for DGOS-I-0001.
- **Downstream:** [[DGOS-T-0014]] (envelope), [[DGOS-T-0015]]/[[DGOS-T-0016]]/[[DGOS-T-0017]]/[[DGOS-T-0018]] (artifact schemas), [[DGOS-T-0019]] (daimyo reconciliation imports the generated binding), [[DGOS-T-0020]] (fixture corpus + compat checks extend this harness).

### Risk Considerations

- **Generated/source drift:** if the TS binding can diverge from the schema, the "source of truth" guarantee is hollow. Mitigation: the drift check must fail the build when generated output is stale.
- **Generator limitations:** some JSON Schema constructs don't map cleanly to TS. Mitigation: choose the generator early and constrain schema authoring to the supported subset; document the constraints for downstream tasks.
- **Packaging ambiguity:** picking plugin-vs-library wrong creates rework. Mitigation: it's a library consumed by daimyo; default to a plain package and document.

### Execution Profile

**Recommended Agent: opus + high.** This sets the schema-authoring + codegen + fixture pattern that all seven downstream tasks depend on; a weak pipeline (especially a missing drift check) silently undermines the source-of-truth guarantee across the whole initiative.

## Status Updates

*To be added during implementation.*
