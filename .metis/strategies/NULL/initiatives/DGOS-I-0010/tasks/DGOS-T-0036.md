---
id: end-to-end-roles-harness-and
level: task
title: "End-to-end Roles harness and registry extensibility proof"
short_code: "DGOS-T-0036"
created_at: 2026-05-23T23:39:53.298041+00:00
updated_at: 2026-05-23T23:39:53.298041+00:00
parent: DGOS-I-0010
blocked_by: []
archived: false

tags:
  - "#task"
  - "#phase/todo"


exit_criteria_met: false
strategy_id: NULL
initiative_id: DGOS-I-0010
---

# End-to-end Roles harness and registry extensibility proof

## Parent Initiative

[[DGOS-I-0010]] — Role Contracts & Autonomy. This is the capstone task. It proves the *general* Roles layer end-to-end across all three v1 Roles through one shared runner + registry, demonstrates the registry is open-for-extension (a fourth Role registers with no runner change), and produces honest captured evidence — mirroring `protocol-proof`'s `PROOF.md`/harness discipline but for the generalized layer.

## Objective

Build an end-to-end harness in `roles/` that drives all three v1 Roles (Architect, Planner, Quality Governor) through the shared `RoleRunner`/`RoleRegistry` from typed `RoleInvocation` → `RoleResult` → schema-valid produced artifact, and prove registry extensibility by registering one additional (deferred-roster) Role definition and invoking it through the unchanged runner. Capture a `ROLES-PROOF.md`-style verdict documenting deterministic coverage and any live-vs-fake distinction, the way protocol-proof did honestly.

## Acceptance Criteria

- [ ] An e2e harness (`roles/src/harness/roles-harness.ts`, generalizing `protocol-proof/src/harness/proof-harness.ts`) builds a valid `RoleInvocation` for each v1 Role and runs it through the registry-resolved shared `RoleRunner`, asserting each produces a schema-valid `RoleResult` plus its produced artifact (`ArchitectureImpact` / `PlanProposal` / `ReviewJudgment`), all validated against the protocol schemas.
- [ ] A test registers a fourth, minimal "extension" `RoleDefinition` (representing a deferred roster Role such as Designer) and invokes it through the **unchanged** shared runner, asserting `produced`/`skipped`/`needs_human` behavior — proving the registry is open for extension without runner edits. (This may use a stub output schema; it must go through the real registry + runner path.)
- [ ] The harness covers the autonomy-signal surface: at least one Role result with `human_review_required: true` is produced and shown to be routable (a test that feeds it into daimyo's `evaluateAutonomyThreshold`, or an equivalent assertion if kept within `roles/`, to demonstrate the signals are consumable — without reimplementing the policy).
- [ ] A `roles/ROLES-PROOF.md` (or `README.md` evidence section) records: which flows are proven in deterministic coverage (fake `StructuredModelCaller`), whether any live model run was attempted, and an honest verdict — explicitly NOT claiming live success if only deterministic coverage exists (matching `protocol-proof/PROOF.md`'s honesty standard).
- [ ] If credentials are available, an opt-in live dogfood path (gated by an env flag like protocol-proof's `PROTOCOL_PROOF_LIVE_SDK_TESTS`) runs at least one Role live and captures the artifact under `roles/evidence/`; if unavailable, the harness records the credential-preflight outcome rather than failing dishonestly.
- [ ] `roles/` (and `daimyo` if the autonomy assertion crosses into it) `npm run typecheck`/`lint`/`test`/`build` clean; no rule disabled; no escape hatches; `roles` version bumped.

## Implementation Notes

### Technical Approach

- Generalize `protocol-proof/src/harness/proof-harness.ts`: instead of hard-coding the Architect invocation, parameterize by `role_id` + a per-Role fixture so the harness drives any registered Role. Reuse the `createProofRoleInvocation` envelope-construction pattern (it already builds a full, schema-valid `RoleInvocation`).
- For the extensibility proof, register the extra Role only within the test (do not ship a half-built Designer); the point is to exercise the registry/runner seam, not to deliver a fourth production Role.
- Reuse the honest evidence pattern from `protocol-proof/PROOF.md` and `evidence/dogfood/run-summary.json`: capture credential preflight, distinguish deterministic vs live, and never assert a live success that did not happen.
- Keep the autonomy assertion thin: construct a `DecisionRequest` from a Role result and call daimyo's `evaluateAutonomyThreshold` with a couple of profiles to show escalate/proceed — this is a consumption demonstration, not new policy.

### Dependencies

- **Upstream:** [[DGOS-T-0029]], [[DGOS-T-0030]], [[DGOS-T-0031]], [[DGOS-T-0032]], [[DGOS-T-0033]] (all three Roles must exist). [[DGOS-T-0035]] for the autonomy-consumption assertion (or stub the daimyo call if kept independent). [[DGOS-T-0034]] optionally for a subprocess e2e variant.
- **Downstream:** none — this is the capstone; its passing harness is the initiative's exit evidence.

### Risk Considerations

- **A dishonest "it works" claim without live coverage.** Mitigation: explicitly adopt protocol-proof's verdict discipline; the proof doc must separate deterministic from live and state the honest verdict.
- **The extensibility proof being too synthetic to be meaningful.** Mitigation: route the extra Role through the *real* registry + runner + schema-validation path; only the prompt/output-schema may be stubbed.
- **Coupling the harness to all three Roles such that one Role's change breaks unrelated coverage.** Mitigation: parameterize per-Role fixtures so each Role's flow is an independent case.

### Execution Profile

**Recommended Agent: opus + medium.** Substantive integration + evidence work spanning all three Roles and the autonomy seam, but built entirely on the established runner/registry/schema contracts; the reasoning is integration-shaped rather than novel-architecture, and the honesty discipline is a known pattern from protocol-proof.

## Status Updates

*To be added during implementation.*
