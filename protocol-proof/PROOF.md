# Protocol Proof Verdict

## Captured Run

- Input Story: `fixtures/story/proof-story.json`
- Live dogfood attempt: `evidence/dogfood/run-summary.json`
- Live command: `PROTOCOL_PROOF_LIVE_SDK_TESTS=1 npm run dogfood:live`
- Result: failed before model invocation because `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_BASE_URL` were present but empty in this shell environment.

No live `ArchitectureImpact` or live `ValidationReport` is recorded. That is a proof finding, not a success claim.

## Evidence Points

1. Role consumed bounded context: pass in deterministic harness coverage. `runProofHarness` loads the hand-authored Story, builds a typed `RoleInvocation`, and passes only `story` plus `bounded_context` into `ArchitectRoleRunner`. The live run did not reach this point because credentials were unavailable.

2. Typed invocation/result plus `ArchitectureImpact` contract sufficient: pass in deterministic coverage. `tests/proof-harness.test.ts` exercises `Story -> RoleInvocation -> ArchitectRoleRunner -> RoleResult + ArchitectureImpact` with a fake structured model client and schema-valid artifact.

3. Validation judged without prose-only interpretation: pass in deterministic coverage. `validateProofArchitectureImpact` routes through daimyo `BuiltInValidation` command mode and returns a protocol `ValidationReport` whose `payload.status` and `completion_decision` carry the machine judgment. The gate also covers good artifact pass, schema-valid bad intent fail, and schema-invalid fail.

4. Output useful enough to dogfood: not proven live in this environment. The dogfood script is opt-in and captured the credential preflight failure in `evidence/dogfood/run-summary.json`; without gateway credentials, no live artifact exists to judge usefulness.

## Verdict

The protocol thesis is partially supported but not fully proven here. The deterministic harness proves the typed flow and validation-gated pass/fail behavior. The live dogfood criterion remains blocked by missing gateway credentials, so this run does not honestly close the proof as a live end-to-end success.
