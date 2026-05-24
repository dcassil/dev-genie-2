---
id: build-the-adr-2-subprocess-role
level: task
title: "Build the ADR-2 subprocess Role runner CLI"
short_code: "DGOS-T-0034"
created_at: 2026-05-23T23:39:53.298041+00:00
updated_at: 2026-05-24T00:30:04.188207+00:00
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

# Build the ADR-2 subprocess Role runner CLI

## Parent Initiative

[[DGOS-I-0010]] — Role Contracts & Autonomy. ADR-2 fixes the v1 Role invocation convention as a **local subprocess runner**: JSON `RoleInvocation` in, JSON `RoleResult` out, machine-readable exit status, no prose parsing. protocol-proof's runner is in-process only, so this subprocess seam is genuinely new and is the architectural contract callers (and other host platforms) wrap.

## Objective

Add a subprocess CLI to `roles/` that realizes the ADR-2 convention: `roles role invoke <role-id> --input <RoleInvocation.json> --output <RoleResult.json>` (exact binary name documented in the task; the convention is fixed). It reads and schema-validates the `RoleInvocation`, resolves the Role via the `RoleRegistry`, runs the shared `RoleRunner`, writes a schema-valid `RoleResult.json`, and exits with a machine-readable status + process exit code. The in-process runner remains the architecture for tests; the CLI is the cross-process contract.

## Acceptance Criteria

## Acceptance Criteria

## Acceptance Criteria

- [ ] A CLI entry exists (`roles/src/cli/role-invoke.ts` + a `bin` entry in `roles/package.json`, mirroring `daimyo/bin/daimyo.js`) supporting `invoke <role-id> --input <path> --output <path>` with optional `--context <path>` for the bounded context bundle.
- [ ] The CLI reads the input file, validates it against `role-invocation.schema.json` (Ajv) before running; an input that fails schema validation produces no model call and exits with a distinct non-zero code and a machine-readable error written to the output file (a `failed`/`blocked` `RoleResult` or a structured error envelope — decide and document).
- [ ] On a resolvable Role, the CLI runs the shared `RoleRunner` (injecting a concrete `StructuredModelCaller`, e.g. daimyo's `AnthropicStructuredModelClient`, configured from env like `daimyo/src/standalone/composition.ts` does — and behaving deterministically/`needs_human` when credentials are absent, never crashing with an unhandled error), writes the resulting `RoleResult` JSON to `--output`, and exits 0 for `produced`/`skipped`, non-zero for `blocked`/`needs_human`/`failed`, with the exit-code → status mapping documented and tested.
- [ ] The CLI writes nothing but the JSON artifact to the output file; any human-readable logging goes to stderr (not stdout/the artifact), preserving "the caller never parses prose" (ADR-2). The output `RoleResult` is always schema-valid (or, on hard failure, a documented structured error).
- [ ] Tests cover (with a fake/injected model client so no network is needed): a valid invocation for the Architect → `RoleResult.json` written + exit 0; a schema-invalid input → non-zero exit + structured error, no model call; an unknown `role_id` → `skipped` `RoleResult` + appropriate exit code; the round-trip `RoleInvocation.json` → CLI → `RoleResult.json` is byte-stable for a fixed input + fake model.
- [ ] The CLI is exercisable in-process (export a `runCli(argv, deps)` that tests call with injected fs/model) so it is testable without spawning a real subprocess; an integration test may additionally spawn the built CLI against a fixture if cheap.
- [ ] `roles/` `npm run typecheck`/`lint`/`test`/`build` clean; no rule disabled; no escape hatches; `roles` version bumped; if `roles` ships as a marketplace plugin, the `bin`/manifest is updated and `dist/` rebuilt + committed per repo rules (decide & document whether `roles` is a distributable plugin or a library consumed by daimyo).

## Implementation Notes

### Technical Approach

- Keep the CLI a thin shell over the shared `RoleRunner` + `RoleRegistry`: parse args → read/validate input → resolve → run → write output → map status to exit code. No Role logic lives in the CLI.
- Model the env-driven model-client construction on `daimyo/src/standalone/composition.ts` `createDefaultModelClient` (read `ANTHROPIC_API_KEY`/endpoint/model; fall back to an `UnavailableModelClient` that surfaces a clean `needs_human`/`failed` rather than throwing). This mirrors how protocol-proof's live dogfood handled missing credentials honestly.
- Validate the input `RoleInvocation` with the same Ajv wiring added in [[DGOS-T-0029]] (`validatorFor("RoleInvocation")`), reusing the protocol schema; do not re-derive the shape.
- Document the exact binary/subcommand name chosen and the exit-code table in the task status updates and in a short `roles/README.md` section, since ADR-2 fixes the *convention* but allows the binary name to vary.

### Dependencies

- **Upstream:** [[DGOS-T-0029]] (runner + validation), [[DGOS-T-0030]] (registry). The Architect alone is enough to build/test the CLI; Planner/Quality Governor ([[DGOS-T-0032]]/[[DGOS-T-0033]]) are not strictly required but, if present, should be invocable through the same CLI.
- **Downstream:** [[DGOS-T-0035]] (daimyo may invoke Roles via this CLI or in-process — the adapter chooses), [[DGOS-T-0036]] (e2e harness can exercise the subprocess path).

### Risk Considerations

- **Leaking prose onto stdout and breaking the typed handoff** (ADR-2's core requirement). Mitigation: route all logging to stderr; assert in a test that stdout/the output file is parseable JSON only.
- **Crashing on missing credentials instead of returning a typed result.** Mitigation: mirror daimyo's `UnavailableModelClient` pattern; test the no-credentials path returns a clean typed `RoleResult`/error + documented exit code.
- **Non-deterministic output making the round-trip untestable.** Mitigation: inject the clock and model client; assert byte-stability for a fixed fake.

### Execution Profile

**Recommended Agent: opus + medium.** Integration work spanning arg parsing, fs IO, schema validation, env-driven client construction, and exit-code semantics — substantive and contract-defining (it is the ADR-2 surface) but built on the already-established runner/registry, so reasoning is bounded.

## Status Updates

### 2026-05-24 — ADR-2 subprocess Role CLI complete (via Codex gpt-5.5)

`roles invoke <role-id> --input … --output … [--context …]` (+ `roles role invoke` alias): validates input against the `RoleInvocation` schema before any registry/model use; invalid input → `RoleInvokeError` JSON envelope + exit 2 + no model call; valid invocations run through the existing `RoleRegistry` + `RoleRunner` (Architect/Planner/Quality Governor registered); env-backed Anthropic client wired via daimyo, absent credentials → typed `needs_human` (no crash); exit mapping documented in README. Decided the CLI is the **cross-platform ADR-2 subprocess contract**; daimyo (T-0035) uses the in-process runner. Reused the runner, did not reimplement it.

**Orchestrator verification:** roles typecheck/lint/test/build green (29 tests: valid Architect, invalid-schema/no-model-call, unknown-role skip, byte-stable output, no-credentials needs_human). protocol-proof + daimyo untouched. roles 0.4.0 → 0.5.0. No escape hatches. **exit_criteria_met: true.** Completed.