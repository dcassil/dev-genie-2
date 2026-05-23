# Protocol

`protocol` is a plain npm library package, not a Claude/Codex plugin. It is consumed by `daimyo` and future Dev-Genie runtime packages as a shared contract layer, so the dependency arrow points into this package and this package has no dependency on sibling plugins.

JSON Schema is the source of truth. TypeScript bindings under `src/generated/` are generated from schemas and must not be edited by hand.

## Schema Draft

Schemas use JSON Schema draft 2020-12 and live in `schemas/` as `*.schema.json` files. Validate schema files with:

```sh
npm run validate:schemas
```

## Shared Artifact Envelope

Every runtime artifact uses `schemas/artifact-envelope.schema.json` as its shared top-level contract. The envelope is the stable cross-primitive surface for Engines, Roles, Loops, adapters, and human-originated records.

All cross-primitive envelope fields are required:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `artifact_id` | string | yes | Content-addressed id: `artifact:sha256:<64 lowercase hex>`. Digest is over canonical JSON with `artifact_id` omitted. |
| `artifact_type` | string | yes | Stable catalog type such as `ExecutionRecord`, `ValidationReport`, `DecisionRequest`, `DecisionRecord`, `RoleInvocation`, or `RoleResult`. Concrete schemas refine this with `const`. |
| `schema_version` | semver string | yes | Version of the `artifact_type` payload schema only. |
| `protocol_version` | semver string | yes | Version of the shared envelope and cross-artifact compatibility contract. |
| `producer` | object | yes | Machine-readable producer identity: `primitive`, `name`, optional `version`, optional `invocation_id`. |
| `created_at` | RFC 3339 date-time string | yes | Timestamp when the artifact was finalized. |
| `source_refs` | array of artifact references | yes | Inputs read or depended on. Empty array is valid when there are no inputs. |
| `output_refs` | array of artifact references | yes | Artifacts or external outputs produced, superseded, or materially affected. Empty array is valid when there are no outputs yet. |
| `ownership` | `OwnershipSurface` object | yes | `$ref` to the reusable `schemas/ownership-surface.schema.json` subschema. |
| `confidence` | object | yes | Machine-readable `score` from `0.0` to `1.0`, bucketed `level`, and optional reason codes. |
| `review_required` | object | yes | Machine-readable review gate: boolean `required`, reason codes, and optional policy refs. |
| `diagnostics` | object | yes | Machine-readable `status`, warning/error codes, and missing-context codes. Consumers must not parse prose from diagnostics. |

The envelope also requires `payload`, an object reserved for the concrete artifact body. `payload` is not a cross-primitive metadata field, but it is required so every concrete artifact follows one uniform shape.

## Ownership And Touch Surfaces

`schemas/ownership-surface.schema.json` and `schemas/touch-report.schema.json` are reusable sub-schemas, not standalone top-level envelope artifacts. Concrete artifacts should `$ref` them from payload fields when they need declared ownership or runtime touched-surface evidence.

Ownership surfaces declare what an artifact owns:

- `owns_files`: repo-relative file paths or glob patterns, such as `src/features/admin/settings/data/**`
- `owns_interfaces`: HTTP route signatures such as `PUT /api/admin/settings`, or symbolic `interface:<name>` identifiers
- `owns_data`: prefixed data identifiers such as `table:admin_settings` or `config:admin.settings.*`
- `owns_workflow_steps`: workflow identifiers such as `admin-settings:save` or canonical cross-artifact `workflow:<step>` identifiers
- `depends_on`: explicitly prefixed dependency surface identifiers such as `interface:auth-admin-session`, `workflow:admin-shell-navigation`, `table:admin_settings`, `config:admin.settings.*`, or `file:src/shared/auth/session.ts`

Touch reports record what a leaf actually touched:

- `task_id`: stable id for the leaf task that produced the report
- `report_type`: the discriminator, currently `touch_report`
- `touched_files`, `touched_interfaces`, `touched_data`, `touched_workflow_steps`: concrete surfaces using the same identifier conventions as ownership surfaces

The prefix convention is part of the conflict-matching contract. Producers should preserve exact strings for comparison and should use prefixes whenever a plain name would be ambiguous across surface categories. Consumers should compare within the relevant category first, then use explicitly prefixed dependency identifiers for cross-category impact checks.

## Composition Pattern

Concrete artifact schemas compose the shared envelope with an artifact-specific payload by using `allOf`:

```json
{
  "allOf": [
    { "$ref": "artifact-envelope.schema.json" },
    {
      "type": "object",
      "properties": {
        "artifact_type": { "const": "ExecutionRecord" },
        "payload": { "$ref": "execution-record-payload.schema.json" }
      }
    }
  ]
}
```

Downstream tasks T-0015 through T-0018 should add typed payload schemas and refine `artifact_type` plus `payload`; they should not duplicate or rename envelope fields.

## Versioning Rules

`schema_version` versions one `artifact_type` payload schema. A producer emitting `artifact_type: "DecisionRecord"` with `schema_version: "1.2.0"` is making a claim about the `DecisionRecord` payload only. Consumers may assume the payload keeps backward-compatible semantics across the same major version. Minor versions may add optional payload fields or enum values only when older consumers can ignore them. Patch versions may clarify validation or fix non-semantic defects. Major versions may remove, rename, or change payload semantics, and consumers must treat unsupported major versions as incompatible unless an adapter is present.

`protocol_version` versions the shared envelope and cross-artifact compatibility expectations. Consumers may assume the meaning of envelope fields, artifact refs, content hashes, confidence, review gates, diagnostics, and producer metadata remains backward-compatible across the same major protocol version. Minor protocol versions may add optional envelope metadata without changing required field meanings. Patch protocol versions may clarify schema constraints or documentation without changing accepted data. A protocol major-version mismatch means the consumer cannot assume envelope compatibility and must reject, route to an adapter, or require review.

Compatibility enforcement and back-compat fixture matrices belong to DGOS-T-0020. This package defines the fields and rules those tests will enforce.

## Hashing And Provenance

`artifact_id` is content-addressed: `artifact:sha256:<digest>`, where `<digest>` is the SHA-256 of canonical JSON for the full artifact with `artifact_id` omitted. Canonical JSON v1 means UTF-8 JSON with deterministic object-key ordering and no insignificant whitespace. The schema validates the id shape; producers are responsible for computing the digest, and DGOS-T-0020 will add enforcement tests.

`source_refs` and `output_refs` contain machine-readable references with:

- `ref_type`: one of `artifact`, `file`, `task`, `policy`, `command`, `config`, `url`, or `external`
- `id`: stable id for the target; artifact refs use `artifact_id`, file refs use repo-relative paths, URL refs use canonical URLs
- optional `content_hash`: SHA-256 plus canonicalization (`canonical-json-v1` or `raw-bytes`)
- optional artifact schema/protocol versions, URI, and relation codes

These refs are intended to be strong enough for validation, diffing, supersession, and replay. A consumer can compare ids for identity, compare optional hashes for content drift, and use `relation: "supersedes"` or related codes in `output_refs` to reason about replacement chains.

## Daimyo Alignment Notes

The envelope aligns with daimyo's existing direction around typed decision records, validation reports, execution evidence, confidence, and durable refs, but the schema is authoritative where names differ. DGOS-T-0019 should reconcile these known divergences:

- daimyo currently uses `createdAt`; protocol uses `created_at`.
- daimyo has `id`, `report_ref`, and string artifact refs; protocol uses `artifact_id`, `source_refs`, and structured `output_refs`.
- daimyo uses a `Score0To10` confidence/risk scale in decision verdicts; protocol envelope confidence is normalized `0.0` to `1.0` with reason codes.
- daimyo's supervisor-local ownership surface includes `taskId` and camelCase fields (`ownsFiles`, `ownsInterfaces`, `ownsData`, `ownsWorkflowSteps`, `dependsOn`); protocol ownership uses snake_case fields under the reusable `ownership-surface` schema and relies on the enclosing artifact or work source for task identity.
- daimyo evidence currently stores touched surfaces directly on execution evidence with camelCase optional fields (`touchedFiles`, `touchedInterfaces`, `touchedData`) and no `report_type`; protocol uses the reusable `touch-report` subschema with required `task_id`, `report_type`, and snake_case touched fields.
- daimyo currently models intended surfaces (`intendedFiles`, `intendedInterfaces`, `intendedData`) for conservative conflict checks; protocol's touch report is concrete touched evidence only in T-0015, so future execution-record work should decide whether intended surfaces remain separate evidence.
- daimyo does not currently expose touched workflow-step evidence in `ExecutionEvidence`; protocol touch reports include required `touched_workflow_steps`.
- daimyo `DecisionRequest.id`, `nodeId`, `taskId`, and permission `toolName` become protocol payload fields `decision_id`, `node_id`, `task_id`, and `tool_name`. The protocol keeps `arguments`, `prompt`, `context`, `surface`, and routing `options` semantically aligned with daimyo.
- daimyo `DecisionRequest` remains a two-variant union. Protocol formalizes the same split with `payload.surface: "permission"` carrying `tool_name` + `arguments`, and `payload.surface: "routing"` carrying the needs-decision prompt/context/options bubble. DGOS-T-0019 should not collapse these variants.
- daimyo `DecisionVerdict` is represented as a standalone minimal schema with `type`, `suggested_choice`, `suggested_response`, `confidence`, `risk`, and `block_trigger`. The protocol preserves daimyo's `Score0To10` as an integer enum from `0` through `10`.
- daimyo `DecisionRecord.id` becomes protocol payload `decision_id`; daimyo `DecisionRecord.createdAt` is represented by the shared envelope `created_at` timestamp. `request`, `verdict`, `tier`, and `rationale` are preserved under `payload`, with `tier` constrained to `0 | 1 | 2 | 3`.

## Decision Artifacts

`schemas/decision-request.schema.json` and `schemas/decision-record.schema.json` are concrete envelope-composed artifact schemas. Their top-level object follows the shared artifact envelope; their `payload` is the daimyo-reconciled decision shape.

`schemas/decision-verdict.schema.json` is intentionally not a full envelope artifact. It is the minimal decision payload used inside `DecisionRecord` and by future role-result mapping code.

`DecisionVerdict` relates to the ADR-1 Role result contract that DGOS-T-0018 will formalize as follows:

- A `RoleResult` may express produced/skipped/blocked/human-review outcomes, confidence, missing context, source/output artifacts, and review requirements.
- A `DecisionVerdict` is the narrowed decision-channel projection of that role output: verdict type, suggested choice/response, confidence and risk on daimyo's `0..10` scale, and the block trigger.
- The mapping between `RoleResult` and `DecisionVerdict` belongs in runtime code such as daimyo's `DecisionProvider`. Schemas only make the relationship expressible by keeping `DecisionVerdict` small, typed, and embeddable in `DecisionRecord`.

## Role Artifacts

`schemas/role-invocation.schema.json` and `schemas/role-result.schema.json` are concrete envelope-composed artifacts for the local subprocess Role runner convention decided in DGOS-A-0002. Both use the shared envelope through `allOf`; Role-specific data lives under `payload` and follows the protocol snake_case wire convention.

`RoleInvocation` is the typed input envelope for a one-shot Role call. Its payload carries the ADR-2 invocation id, role id/version, requested operation, decision scope, input/source artifacts with optional content hashes, ContextBundle refs, policy decision refs, budget, model-tier policy, timeout, allowed Engines/tools, expected output artifact schemas, and trace destination.

`RoleResult` is the typed output envelope for a Role call. Its payload encodes the DGOS-A-0001 canonical Role output: `status` is one of `produced`, `skipped`, `blocked`, or `needs_human`, with normalized `confidence`, structured `missing_context`, `human_review_required`, `source_artifacts`, `output_artifacts`, and optional structured `skip_reason`. Optional `decision_verdict` embeds the DGOS-T-0017 `DecisionVerdict` projection when a DecisionProvider adapter emits a role result, keeping the daimyo mapping expressible without changing the standalone verdict schema.

The schema deliberately extends the ADR text in two places:

- DGOS-A-0002 lists runner `failed` among RoleResult statuses, while DGOS-A-0001 and daimyo's DecisionVerdict mapping use the four Role outcome states. Protocol v1 keeps `payload.status` to the four canonical Role outcomes; runner/process failure is represented by the inherited envelope `diagnostics.status: "failed"`, envelope errors, trace refs, and the subprocess exit code.
- DGOS-A-0002 names several operational concerns but not their nested wire shapes. Protocol v1 records those as structured payload objects: `budget`, `model_tier_policy`, `allowed_engines`, `allowed_tools`, `expected_output_artifacts`, `trace`, `usage`, `retry_recommendation`, and `proposed_artifact_patches`.

## Adding An Artifact Type

1. Add `schemas/<artifact-name>.schema.json` with `$schema` set to `https://json-schema.org/draft/2020-12/schema`.
2. Compose it from `artifact-envelope.schema.json` and a typed payload schema using the `allOf` pattern above.
3. Add fixtures under `fixtures/<artifact-name>/valid/` and `fixtures/<artifact-name>/invalid/`.
4. Run `npm run codegen`.
5. Run `npm run test`, `npm run typecheck`, `npm run lint`, and `npm run build`.

## Codegen

Regenerate the TypeScript binding with:

```sh
npm run codegen
```

Check for stale generated output with:

```sh
npm run check:codegen
```

`npm run test` also runs the schema validator and codegen drift check before the fixture tests.

## Fixture Harness

Each schema file maps to a fixture directory with the same base name:

```text
schemas/example.schema.json
fixtures/example/valid/*.json
fixtures/example/invalid/*.json
```

The Vitest harness compiles every schema with Ajv and asserts every valid fixture passes and every invalid fixture fails. Adding a new artifact type should only require dropping in the schema plus its valid and invalid fixtures.
