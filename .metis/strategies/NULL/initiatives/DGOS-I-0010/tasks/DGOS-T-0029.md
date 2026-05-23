---
id: scaffold-the-roles-package-and
level: task
title: "Scaffold the roles package and port the Architect Role onto a shared RoleRunner"
short_code: "DGOS-T-0029"
created_at: 2026-05-23T23:39:53.298041+00:00
updated_at: 2026-05-23T23:57:51.867775+00:00
parent: DGOS-I-0010
blocked_by: []
archived: false

tags:
  - "#task"
  - "#phase/completed"


exit_criteria_met: false
strategy_id: NULL
initiative_id: DGOS-I-0010
---

# Scaffold the roles package and port the Architect Role onto a shared RoleRunner

## Parent Initiative

[[DGOS-I-0010]] — Role Contracts & Autonomy. This is the load-bearing groundwork task: it creates the new `roles/` package and generalizes `protocol-proof`'s in-process `ArchitectRoleRunner` into a reusable shared `RoleRunner`, without regressing the proven Architect path. Every other task in this initiative builds on the package and runner contract created here.

## Objective

Create a new sibling package `roles/` (peer of `protocol`, `daimyo`, `protocol-proof`) and establish the shared, single-Role `RoleRunner` by porting and generalizing `protocol-proof/src/runner/architect-role-runner.ts`. The runner must keep the typed `RoleInvocation` → `RoleResult` contract (ADR-2), keep all the proven behaviors (skip rules, `model_tier_policy` enforcement, structured-model call, artifact normalization, protocol-schema validation, first-class `produced`/`skipped`/`blocked`/`needs_human`/`failed` results), but factor out the Architect-specific pieces behind a `RoleDefinition` shape so later tasks can register additional Roles without changing the runner. This task ships the Architect as the first registered Role and proves parity with protocol-proof's Architect behavior.

## Acceptance Criteria

## Acceptance Criteria

## Acceptance Criteria

- [ ] A new package `roles/` exists as a peer of `protocol`/`daimyo`/`protocol-proof`, with `package.json` (name `roles`), `tsconfig.json`/`tsconfig.build.json`, `eslint.config.mjs`, and `.claude-plugin/plugin.json` matching the conventions of the sibling packages, and `file:../protocol` + `file:../daimyo` dependencies.
- [ ] `roles/` declares its own `StructuredModelCaller` port (or re-exports daimyo's) so the runner depends on the injected port, never on a concrete model client; no network/filesystem access in the runner core.
- [ ] A `RoleDefinition` type exists capturing the per-Role variance the runner needs: `role_id`, `role_version`, `prompt` (`VersionedRolePrompt`), `supported_operations`, `expected_output_artifact_type` + `schema_version`, an output `StructuredModelSchema<T>` (schema + parser) sourced from the protocol schemas, an artifact-`normalize` hook, and the autonomy `domain` tag (`engineering`/`product`/`design`).
- [ ] A shared `RoleRunner.run(invocation, roleContext)` exists that, given a `RoleDefinition`, reproduces every behavior of `protocol-proof`'s `ArchitectRoleRunner`: skip rules (unknown role / unsupported version / unsupported operation / missing required expected output) → `skipped`; no allowed model tier → `needs_human`; structured-model call via the injected port; artifact normalization (producer/refs/content hash/`protocol_version`); protocol-schema validation of both the produced artifact and the final `RoleResult`; and first-class `produced`/`skipped`/`blocked`/`needs_human`/`failed` statuses.
- [ ] The Architect Role is ported as the first `RoleDefinition`: a versioned prompt (namespaced `dev-genie.architect-role@1.0.0`, ported from `protocol-proof/src/prompts/architect-role.ts`) producing `ArchitectureImpact`, with the Architect-specific normalization from protocol-proof moved into its `normalize` hook.
- [ ] Protocol-schema validation is wired in `roles/` by generalizing `protocol-proof/src/runner/protocol-schemas.ts` (Ajv loads `protocol/schemas/*.json`; JSON Schema stays the source of truth; TS types come from the generated `protocol` binding — no hand-rolled artifact types).
- [ ] Tests in `roles/` prove Architect parity: a fake `StructuredModelCaller` yields a schema-valid `ArchitectureImpact` → `produced` `RoleResult`; wrong role/version/operation → `skipped`; empty `allowed_tiers` → `needs_human`; schema-invalid model output → `blocked`; model-call throw → `blocked` with retry recommendation. These mirror `protocol-proof/tests/architect-role-runner.test.ts`.
- [ ] `roles/` `npm run typecheck`/`lint`/`test`/`build` all pass clean; no eslint/tsconfig rule disabled; no `any`/ts-ignore escape hatches.
- [ ] `roles/` is added to the root `.gitignore` un-ignore lines for `dist/` if it ships a build, consistent with the repo rule, and a `roles` entry is added to the marketplace `.claude-plugin` set only if the package is meant to be a distributable plugin (decide and document in a status update; if it is library-only, note that explicitly).

## Implementation Notes

### Technical Approach

- Mirror `protocol-proof`'s package layout and tsconfig/eslint exactly so the new package inherits the same strictness. Use `file:` links for `protocol` and `daimyo` (see `protocol-proof/package.json` dependencies).
- Port `protocol-proof/src/runner/architect-role-runner.ts` into `roles/src/runner/role-runner.ts`, but replace the hard-coded `ARCHITECT_*` constants and the `architectModelInput`/`normalizeArchitectureImpact` Architect specifics with calls through a `RoleDefinition`. Keep the generic envelope construction (`roleResultEnvelope`, `producedResult`, `skippedResult`, `needsHumanResult`, `blockedResult`, `artifactIdFor`, trace handling) as shared runner code — these are already Role-agnostic in the proof.
- Port `protocol-proof/src/runner/structured-model.ts` (the `StructuredModelCaller`/`StructuredModelInput`/`StructuredModelSchema` port) into `roles/`. The concrete client (daimyo's `AnthropicStructuredModelClient`/`StructuredModelClient`) is injected by callers, exactly as `protocol-proof` and `daimyo/src/standalone/composition.ts` already do.
- Generalize `protocol-proof/src/runner/protocol-schemas.ts` into `roles/src/schemas/protocol-schemas.ts`: keep the Ajv 2020 loader that reads the sibling `protocol/schemas` dir, but expose a generic `validatorFor(artifactType)` so later Roles (Planner, Quality Governor) can register their output validators without editing the runner.
- The Architect `RoleDefinition.normalize` hook is the current `normalizeArchitectureImpact` body (producer = `{primitive: "role", name, version, invocation_id}`, `source_refs`, `output_refs`, `protocol_version`, content-hash `artifact_id`).
- Do NOT delete or modify `protocol-proof/` — it is the frozen proof. This task *ports and generalizes* its code into `roles/`.

### Dependencies

- **Upstream:** none within this initiative — this is the first task. Depends only on the already-built `protocol` package (generated types + schemas) and `daimyo` (the `StructuredModelClient` engine + ports), both shipped.
- **Downstream:** [[DGOS-T-0030]] (registry + context assembler) extends `RoleDefinition`/`RoleRunner`; [[DGOS-T-0032]] (Planner) and [[DGOS-T-0033]] (Quality Governor) register new `RoleDefinition`s; [[DGOS-T-0034]] (subprocess CLI) wraps the runner; [[DGOS-T-0035]] (daimyo adapter) consumes it.

### Risk Considerations

- **Regressing the proven Architect path while generalizing.** Mitigation: port the proof's `architect-role-runner.test.ts` cases verbatim into `roles/` as the parity gate; the runner refactor is only "done" when those pass. Never weaken a parity test.
- **Accidental coupling to daimyo internals.** Mitigation: depend only on the injected `StructuredModelCaller` port and on `protocol` types; do not import daimyo's supervisor/decision internals into the runner core.
- **Schema-loader path fragility** (protocol-proof hunts for the sibling `protocol/schemas` dir at runtime). Mitigation: copy its multi-candidate resolution and add a test that the loader resolves in the `roles/` package context.

### Execution Profile

**Recommended Agent: opus + high.** This creates a new package and the core runner pattern every downstream Role task depends on; the `RoleDefinition`/`RoleRunner` seam is load-bearing architecture, and a wrong abstraction here forces compounding rework across the whole initiative. Multi-file, contract-defining, and the linchpin of the Roles layer.

## Status Updates

- 2026-05-23: Implemented `roles/` as a library-only sibling package, not a marketplace-distributable plugin at this stage. It has `.claude-plugin/plugin.json` metadata for package consistency, but no root `.claude-plugin/marketplace.json` entry because it exposes no Claude command or MCP server. Added root `.gitignore` un-ignore lines for `roles/dist/` because the package ships a build artifact.
- 2026-05-23: Ported the Architect prompt as `dev-genie.architect-role@1.0.0`, generalized the proof runner into `RoleRunner` + `RoleDefinition`, kept the structured-model dependency as an injected `StructuredModelCaller` port, and generalized Ajv protocol validation behind `validatorFor(artifactType)`.
- 2026-05-23: Verification from `roles/`: `npm run typecheck`, `npm run lint`, `npm run test` (7 parity/schema-loader tests), and `npm run build` all passed clean.
- 2026-05-23 (orchestrator verification): re-ran roles typecheck/lint/test/build — green (7 tests: Architect parity produced/skipped/needs_human/blocked + schema-loader resolution). Shared `RoleRunner`+`RoleDefinition` generalizes protocol-proof's Architect runner; runner core depends only on the injected `StructuredModelCaller` port + protocol types (no daimyo supervisor/decision imports); `validatorFor(artifactType)` generalizes the Ajv loader; protocol-proof left untouched. `roles/` library-only; root `.gitignore` un-ignores `roles/dist/`. No escape hatches. **exit_criteria_met: true.** Completed.