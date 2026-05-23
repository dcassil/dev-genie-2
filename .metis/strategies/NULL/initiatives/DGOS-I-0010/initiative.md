---
id: role-contracts-autonomy
level: initiative
title: "Role Contracts & Autonomy"
short_code: "DGOS-I-0010"
created_at: 2026-05-21T17:45:11.520611+00:00
updated_at: 2026-05-23T23:39:45.825248+00:00
parent: DGOS-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/decompose"


exit_criteria_met: false
estimated_complexity: L
strategy_id: NULL
initiative_id: role-contracts-autonomy
---

# Role Contracts & Autonomy Initiative

## Context

The recreated architecture keeps one shared contract for Roles while letting each role own different artifacts and decision scopes. That makes one consolidated initiative the right boundary: the shared runtime contract is the core work, and role-specific variance can decompose into sections and tasks.

This initiative merges the role-specific originals into one contract-centered owner.

## Goals & Non-Goals

**Goals:**
- Define the shared Role contract across Planner, Designer, Architect, Principal FE, Principal BE, PM, Quality Governor, and Refactor/Migration.
- Specify artifact ownership, decision scopes, autonomy boundaries, and skip behavior for each Role.
- Align role behavior with `RoleInvocation` and `RoleResult` envelopes.
- Make role outputs inspectable without relying on transient chat history.

**Non-Goals:**
- Collapse all role prompts into one generic role.
- Let Roles own long-running loop state.
- Decide deterministic routing or policy rules that belong to Engines.

## Architecture

### Overview

The shared layer is one contract: bounded context in, typed artifacts and status out. Within that contract, each role has a distinct artifact set and decision scope.

### Sequence Diagrams

Loop routes question or planning step -> invokes the correct Role with bounded context -> Role emits produced, skipped, blocked, needs-human, or failed result -> caller records the outcome and continues or escalates.

## Detailed Design

Each role section should define:

- produced artifact types
- owned decision scopes
- permitted autonomy level
- skip conditions
- required review conditions

The initial role set is:

- Planner
- Designer
- Architect
- Principal FE
- Principal BE
- Project Manager
- Quality Governor
- Refactor/Migration

The shared contract should stay in one place so changes to invocation, output shape, or autonomy semantics do not fragment across role-specific initiatives.

## Alternatives Considered

- Keep one initiative per Role: rejected because the shared contract would be duplicated and drift.
- One generic role with mode flags: rejected because decision scope and artifact ownership would become too vague.
- Treat Roles as prompt files rather than architectural primitives: rejected because they need typed contracts and explicit autonomy boundaries.

## Implementation Plan

- [ ] Define the shared Role contract and common status semantics.
- [ ] Write one section per Role covering artifacts, scope, autonomy, and skip behavior.
- [ ] Align role outputs with `RoleInvocation` and `RoleResult`.
- [ ] Define review and escalation expectations per Role.
- [ ] Decompose into per-role tasks once the shared contract is stable.

## Approved design direction (autonomous, 2026-05-23)

This section records the design calls made to take DGOS-I-0010 out of discovery. It generalizes the just-built `protocol-proof` direct Role runner into a real, reusable Roles layer, and wires that layer into `daimyo`'s `RolesPlanning` capability port and ADR-4 autonomy policy.

### What already exists (the seam we generalize)

`protocol-proof/` is a sibling package depending on `daimyo` + `protocol`. It already proves the minimal Role flow end-to-end in deterministic coverage:

- `src/prompts/architect-role.ts` — a `VersionedRolePrompt` (`id`, `version`, `ref`, `text`) for one Role.
- `src/runner/structured-model.ts` — a `StructuredModelCaller` port (`call<T>({ input, output }) => Promise<T>`), mirroring daimyo's `engine/structured-model-call.ts`.
- `src/runner/architect-role-runner.ts` — a single-Role runner: takes a typed `RoleInvocation` + bounded context, applies skip rules (wrong role/version/operation/expected-output), enforces `model_tier_policy` (`needs_human` when no model tier allowed), calls the model for an `ArchitectureImpact`, normalizes producer/refs/hashes, validates against the protocol schema, and returns a schema-checked `RoleResult` (`produced`/`skipped`/`blocked`/`needs_human`).
- `src/runner/protocol-schemas.ts` — Ajv-based validators that load `protocol/schemas/*.json` (JSON Schema is the source of truth; TS is generated) and validate `ArchitectureImpact` / `RoleResult` / `ValidationReport`.
- `src/harness/proof-harness.ts` — builds a full `RoleInvocation` envelope and runs Story → invocation → runner → `RoleResult` + `ArchitectureImpact` → validation gate.

The Roles layer is the generalization of `ArchitectRoleRunner` from "one hard-coded Architect" to "a registry of versioned Roles invoked through one runner contract", plus the ADR-2 subprocess seam that protocol-proof never built (its runner is in-process).

### Decision 1 — v1 Role set (smallest set that proves the general layer)

**Ship in v1: Architect, Planner, Quality Governor.**

- **Architect** — already exists in protocol-proof; produces `ArchitectureImpact` (the only Role-produced artifact type already in the protocol catalog). It is the reference Role and proves "generalize without regressing the proven path".
- **Planner** — produces task/plan artifacts. It is the Role most directly consumed by daimyo's `RolesPlanning.plan()` port and the Loop substrate, so it proves the layer feeds the real execution substrate, not just a proof harness. Planner requires a new protocol artifact type (a `PlanProposal`/planning artifact), which is part of its task.
- **Quality Governor** — produces a review/`ValidationReport`-shaped judgment. It proves the layer covers a *review* decision scope (`scope_type: "review"`) and the `needs_human` / `human_review_required` autonomy escalation path, distinct from "produce a new artifact".

This trio spans the three meaningfully different Role shapes (produce-design, produce-plan, review/judge) and the three decision-scope flavors (`artifact`, `task`/`initiative`, `review`). Proving these three through one shared runner + registry validates the general contract.

**Deferred to follow-on initiatives: Designer, Principal FE, Principal BE, Project Manager, Refactor/Migration.** Each of these is a new prompt + (mostly) a new produced-artifact schema, and each fits the registry pattern the v1 trio establishes. Deferring them keeps v1 to the smallest set that proves the general layer while leaving the eight-Role roster from the initiative body intact as the eventual target. The decomposition explicitly includes a "register an additional Role" task to prove the registry is open for extension without changing the runner.

### Decision 2 — where the Roles layer lives

**A new sibling package `roles/` (peer of `protocol`, `daimyo`, `protocol-proof`), depending on `protocol` and `daimyo`.** The package owns: the `VersionedRolePrompt` type, per-Role versioned prompts, the shared `RoleRunner`, the `RoleRegistry`, the context-profile assembler, and the protocol-schema validation wiring (generalized from `protocol-proof/src/runner/protocol-schemas.ts`). It re-uses daimyo's `StructuredModelClient` engine via injection (the `StructuredModelCaller` port), never reaching into daimyo internals.

Rationale (respecting ADR-1):

- **Roles must not own long-running state (ADR-1).** A dedicated package keeps Roles as one-shot, stateless, model-backed specialists with typed I/O. Putting them *inside* daimyo risks entangling Role reasoning with Loop/supervisor state; keeping them out enforces the boundary structurally.
- **daimyo's `src/core` is import-pure** (the `cross-port-boundary` test forbids sibling-adapter imports in core). daimyo consumes the Roles layer only through its existing `RolesPlanning` capability *port* via a thin adapter at the standalone-composition layer (`daimyo/src/standalone/composition.ts`), not in core. That preserves the port/adapter architecture: daimyo defines the port, `roles/` (or a small daimyo adapter) implements it.
- The dependency direction matches the existing graph: `protocol-proof` already depends on both `daimyo` and `protocol` via `file:` links, so `roles/` doing the same is consistent and low-risk.
- protocol-proof stays as-is (the frozen proof); `roles/` is where the generalized, production layer evolves. The Architect prompt/runner logic is *ported and generalized* into `roles/`, not deleted from protocol-proof.

### Decision 3 — how the general layer generalizes the proof

- **Versioned prompts per Role:** keep `VersionedRolePrompt` (`id`/`version`/`ref`/`text`); each v1 Role gets one, namespaced (e.g. `dev-genie.architect-role@1.0.0`).
- **RoleRegistry:** maps `role_id` (+ optional `role_version`) → a Role definition (prompt, supported operations, expected-output artifact types, output schema + parser, decision-scope kinds). The registry is the open-for-extension seam: adding a Role is a registration, not a runner change.
- **Shared RoleRunner:** one runner generalizing `ArchitectRoleRunner.run()` — resolve the Role from the registry; apply the shared skip rules (unknown role, unsupported version, unsupported operation, missing required expected output) as `skipped`; enforce `model_tier_policy` (`needs_human` when no model tier is allowed); call the injected `StructuredModelCaller` with the Role's output schema; normalize the produced artifact (producer/refs/hashes/protocol_version); validate against the protocol schema; emit a schema-checked `RoleResult` with first-class `produced`/`skipped`/`blocked`/`needs_human`/`failed` states. The Architect-specific normalization in protocol-proof becomes per-Role hooks supplied by the registry entry.
- **Context-profile assembly:** a context assembler builds the bounded `{context, rules, request}` `StructuredModelInput` per Role from the `RoleInvocation` (decision scope, input artifacts, context-bundle refs, expected outputs), generalizing protocol-proof's `architectModelInput`. Each Role declares which context profile it needs.
- **Typed RoleInvocation → RoleResult:** unchanged contract — the protocol envelopes are the source of truth, validated via Ajv as in protocol-proof.
- **Reuse daimyo's structured-model-call engine:** the runner depends only on the `StructuredModelCaller` port; the concrete client (`daimyo`'s `AnthropicStructuredModelClient` / `StructuredModelClient`) is injected, identical to how protocol-proof and daimyo's standalone composition already inject it.

### Decision 4 — ADR-2 subprocess invocation seam

ADR-2 fixes the v1 convention as a **local subprocess runner**: `dev-genie role invoke <role-id> --input <RoleInvocation.json> --output <RoleResult.json>`, JSON in / JSON out, machine-readable exit status, no prose parsing. protocol-proof's runner is in-process only, so the subprocess CLI is genuinely new work. The Roles layer ships:

- the **in-process `RoleRunner`** (used directly in tests and by in-process adapters), and
- a thin **subprocess CLI** wrapper around the same runner that reads a `RoleInvocation.json`, runs the registry-resolved Role, writes a `RoleResult.json`, and exits with a machine-readable status/exit code — exactly the ADR-2 contract.

In-process adapters remain allowed for tests (ADR-2 "Neutral"), but the subprocess CLI is the architectural contract and must exist + be versioned.

### Decision 5 — autonomy integration and the ADR-4-still-draft dependency

Roles emit autonomy-relevant signals (`confidence`, `missing_context`, `human_review_required`, `review_required`, and `needs_human` status). The autonomy *policy* — deciding whether to proceed, route, or stop for human review — lives in daimyo's `TieredDecisionProvider` + `evaluateAutonomyThreshold`, which already consume the ADR-4 `AutonomyProfile` (`engineering`/`product`/`design` × `always_in_loop`/`big_questions_only`/`delegate`). The Roles layer **does not re-implement autonomy policy**; it produces the signals the existing Decision Policy Engine consumes, and tags each Role/operation with an autonomy **domain** so the policy can classify it.

**ADR-4 dependency handling (explicit):** ADR-4 is still in `draft`. We consume **only the already-defined, stable parts of its shape** — the three domains, the three levels, and the domain-tagging concept — which are already implemented and tested in `daimyo/src/decision/autonomy.ts`. We do **not** depend on any undecided ADR-4 detail (exact storage format, bootstrap prompt wording, borderline local-vs-major thresholds). Each Role/operation declares its autonomy `domain` (engineering for Architect/Planner-engineering, etc.) and the Roles layer surfaces `human_review_required`; the *threshold* interpretation stays entirely in daimyo's existing policy.

> **Assumption / fork to flag for a human:** this design treats the ADR-4 three-domain / three-level profile as stable. ADR-4 should be moved `draft → discussion → decided` (or explicitly amended) before the autonomy-integration task (T-0007) is marked done, so the Roles↔autonomy contract is not silently built on an undecided ADR. The decomposition records this as an explicit dependency, not a hidden one.

### Constraints honored

- **ADR-1 (Engine/Role/Loop split):** Roles stay one-shot, stateless, model-backed, with typed artifact I/O; no long-running state; live outside the Loop substrate (daimyo) in their own package; consumed via daimyo's capability port.
- **ADR-2 (Role Invocation Convention):** typed `RoleInvocation` → `RoleResult`, JSON-file subprocess runner is the contract; in-process runner for tests.
- **Protocol as source of truth:** all artifacts validated against `protocol/schemas/*.json`; new Role-produced artifact types (Planner plan artifact, Quality Governor review judgment) are added as protocol schemas first, then generated TS, then consumed — never hand-rolled.

## Decomposition (decided 2026-05-23)

| Task | Title | Depends on | Recommended Agent |
|------|-------|-----------|-------------------|
| [[DGOS-T-0029]] | Scaffold the roles package and port the Architect Role onto a shared RoleRunner | — | opus + high |
| [[DGOS-T-0030]] | Add the RoleRegistry and the generalized context-profile assembler | T-0029 | opus + high |
| [[DGOS-T-0031]] | Author protocol schemas for the Planner and Quality Governor Role artifacts | — (parallel) | opus + high |
| [[DGOS-T-0032]] | Implement and register the Planner Role | T-0029, T-0030, T-0031 | opus + medium |
| [[DGOS-T-0033]] | Implement and register the Quality Governor Role | T-0029, T-0030, T-0031 | opus + medium |
| [[DGOS-T-0034]] | Build the ADR-2 subprocess Role runner CLI | T-0029, T-0030 | opus + medium |
| [[DGOS-T-0035]] | Wire the Roles layer into daimyo's RolesPlanning port with autonomy domain tagging | T-0029, T-0030, T-0031, T-0032, T-0033 (+ ADR-4) | opus + high |
| [[DGOS-T-0036]] | End-to-end Roles harness and registry extensibility proof | T-0029, T-0030, T-0031, T-0032, T-0033, T-0035 | opus + medium |

### Critical path

`T-0029 → T-0030 → T-0032 → T-0035 → T-0036` is the critical path. `T-0031` (protocol schemas) can run in parallel with `T-0029`/`T-0030` but gates `T-0032`/`T-0033`, so in practice it should start immediately alongside `T-0029` to avoid becoming the bottleneck before `T-0032`. `T-0033` parallels `T-0032`. `T-0034` (subprocess CLI) is off the critical path — it depends only on `T-0029`/`T-0030` and can land any time after them; it is not required by `T-0035`/`T-0036` unless the daimyo adapter or e2e harness chooses the subprocess invocation path.

### Load-bearing tasks

`T-0029` (package + shared runner), `T-0030` (registry + context-profile abstraction), and `T-0031` (protocol artifact schemas) are the load-bearing tasks — a wrong abstraction in the `RoleDefinition`/`RoleRunner`/`context_profile` seam or a poorly-shaped `PlanProposal`/`ReviewJudgment` schema cascades into every later Role and into the daimyo integration. `T-0035` is load-bearing for the autonomy thesis (Roles + ADR-4 policy) and carries the explicit ADR-4-still-draft dependency.