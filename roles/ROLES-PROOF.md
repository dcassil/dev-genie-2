# Roles Layer Proof Verdict

## Captured Run

- Deterministic harness: `tests/roles-harness.test.ts`
- Harness source: `src/harness/roles-harness.ts`
- Live dogfood attempt: `evidence/dogfood/run-summary.json`
- Live command: `ROLES_LIVE_SDK_TESTS=1 npm run dogfood:live`
- Current live result: skipped. `ROLES_LIVE_SDK_TESTS` was not set and `ANTHROPIC_API_KEY` was not present in this shell, so no live model call was attempted.

No live `ArchitectureImpact`, `PlanProposal`, or `ReviewJudgment` is recorded by this run. That is an evidence finding, not a live-success claim.

## Deterministic Coverage

1. Registered v1 Roles run end-to-end through one shared runner: pass. `runRolesHarness` builds a schema-valid `RoleInvocation` for Architect, Planner, and Quality Governor, resolves each through `RoleRegistry`, and invokes the shared `RoleRunner` with a fake `StructuredModelCaller`.

2. Produced artifacts validate against protocol schemas: pass. The deterministic harness asserts schema-valid `RoleResult` envelopes and validates the produced `ArchitectureImpact`, `PlanProposal`, and `ReviewJudgment` artifacts through the protocol schema validators.

3. Registry extensibility is open for extension: pass. `tests/roles-harness.test.ts` registers a fourth in-test `dev-genie.designer-role@1.0.0` `RoleDefinition` and proves `produced`, `skipped`, and `needs_human` outcomes through the real `RoleRegistry` and unchanged `RoleRunner` path. The Designer uses a stub `DesignBrief` output schema only for the proof; no production Designer Role is shipped.

4. Autonomy signals are consumable: pass. The Quality Governor deterministic flow produces `human_review_required: true`; the test maps that RoleResult to a daimyo `DecisionRequest`/`DecisionVerdict` and feeds it into `evaluateAutonomyThreshold`, which escalates. The same test also shows a non-review Planner result can proceed under a delegated engineering profile.

## Live Dogfood

The opt-in live path is implemented as `npm run dogfood:live` and gated by `ROLES_LIVE_SDK_TESTS=1`. It runs the Architect harness case through daimyo's `AnthropicStructuredModelClient` and writes `role-invocation.json`, `role-result.json`, `produced-artifact.json`, and `run-summary.json` under `roles/evidence/dogfood/` when credentials are available.

For this captured run, live execution was not attempted because the opt-in flag was not set and the required `ANTHROPIC_API_KEY` credential was absent. The preflight result is recorded in `evidence/dogfood/run-summary.json`.

## Verdict

The generalized Roles layer is proven in deterministic coverage: all three v1 Roles run through the shared registry-resolved `RoleRunner`, produce schema-valid RoleResult/artifact pairs, surface autonomy signals, and admit a fourth Role registration without runner, registry, or assembler edits.

This proof does not claim live model success. Live coverage remains opt-in and unproven in this environment until `ROLES_LIVE_SDK_TESTS=1` and valid Anthropic credentials are supplied and captured artifacts are written.
