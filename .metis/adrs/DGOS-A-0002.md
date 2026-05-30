---
id: 001-role-invocation-convention
level: adr
title: "Role Invocation Convention"
number: 1
short_code: "DGOS-A-0002"
created_at: 2026-05-21T17:33:49.522551+00:00
updated_at: 2026-05-21T18:03:47.741951+00:00
decision_date: 
decision_maker: Dev-Genie maintainers
parent: 
archived: false

tags:
  - "#adr"
  - "#phase/decided"


exit_criteria_met: false
strategy_id: NULL
initiative_id: NULL
---

# ADR-2: Role Invocation Convention

## Context

DGOS-A-0001 split runtime vocabulary into Engines, Roles, and Loops. That split still leaves one critical runtime question open: how does a Loop invoke a Role at execution time?

The current initiative set references several possible models without choosing one:

- MCP tool call: expose each Role as a tool through an MCP server.
- Subagent spawn via a Task-style tool: ask the host agent platform to create another agent with role instructions.
- Slash command: rely on platform-specific command files that expand into role prompts.
- Skill load: load role guidance into the current agent context and ask it to behave as that Role.
- Child process via worktree: run an external role runner process against a repo path or isolated worktree.
- In-process function call: link role code directly into the orchestrator process.

Without a single convention, the artifact protocol cannot be implemented reliably. The caller needs one call surface with explicit inputs, typed outputs, timeout behavior, error handling, trace records, and cost accounting.

## Decision

For v1, Dev-Genie Role invocations will use a local subprocess Role runner with typed artifact envelopes.

The orchestrator invokes a Role by running a command equivalent to:

```bash
dev-genie role invoke <role-id> --input <RoleInvocation.json> --output <RoleResult.json>
```

The exact binary name can change, but the convention is fixed:

- Input is a `RoleInvocation` JSON artifact envelope written by the caller.
- Output is a `RoleResult` JSON artifact envelope written by the Role runner.
- Human-readable markdown can be included as an artifact body, but the handoff API is the JSON envelope.
- The Role runner may call an LLM, local deterministic Engines, MCP tools, or platform adapters internally, but those are implementation details hidden behind the subprocess boundary.
- The Role invocation is one-shot. Long-running execution state belongs to Loops, not Roles.
- The Role runner exits with a machine-readable status and a process exit code. The caller never parses prose to determine success.

`RoleInvocation` must include:

- invocation id
- role id and role version
- requested operation
- decision scope
- input artifact refs and content hashes
- context bundle refs
- policy decision refs
- budget and model tier policy
- timeout
- allowed Engines and tools
- expected output artifact schemas
- trace destination

`RoleResult` must include:

- invocation id
- role id and role version
- status: `produced`, `skipped`, `blocked`, `needs_human`, or `failed`
- output artifact refs and content hashes
- proposed artifact patches, if the Role does not own the target artifact
- confidence
- missing context
- human review requirement
- cost estimate or actual usage when available
- errors and diagnostics
- retry recommendation
- trace refs

### Protocol Proof MVP subset

The Protocol Proof MVP uses the smallest stable subset of this convention needed to prove one Role consuming one artifact, producing one artifact, and passing one validation gate. The proof should not implement the full v1 envelope before the protocol thesis is tested.

For the proof, `RoleInvocation` requires only:

- `invocation_id`
- `role_id`
- `role_version`
- `operation`
- `decision_scope`
- `input_artifacts`
- `expected_output_artifacts`
- `trace`
- `timeout_ms`

For the proof, `RoleResult` requires only:

- `invocation_id`
- `role_id`
- `role_version`
- `status`
- `output_artifacts`
- `confidence`
- `missing_context`
- `human_review_required`
- `diagnostics`
- `trace`

Budget policy, allowed tools, context bundle refs, policy refs, retry policy, and cost accounting remain part of the v1 convention but are optional in the MVP subset.

## Alternatives Analysis

| Option | Pros | Cons | Risk Level | Implementation Cost |
|--------|------|------|------------|-------------------|
| MCP tool call | Good typed surface | Requires every Role to be exposed through an MCP server and couples v1 to server lifecycle, transport, and client support | Medium | Medium |
| Subagent spawn via Task tool | Strong for parallel human-like work | Too platform-specific and hard to make return-typed; better for Loop-managed worker agents than one-shot Role invocation | Medium | Medium |
| Slash command or skill load | Useful UX on platforms that support it | Prompt expansion pollutes caller context and does not guarantee typed returns or isolation | High | Low |
| In-process function call | Simple for tests | Couples Roles to orchestrator implementation language and weakens isolation and timeout enforcement | Medium | Low |
| Local subprocess Role runner | Deterministic invocation boundary, typed return contract, bounded context, portability across host platforms | Requires envelope schemas and runner tooling | Low | Medium |

## Rationale

The subprocess convention gives the caller a deterministic invocation boundary without forcing every Role to be implemented as a specific host-platform feature.

It satisfies the core requirements:

- Deterministic invocation: the caller starts a process with explicit input and output files.
- Return-typed artifact handoff: all Role output must be written as `RoleResult` plus artifact refs.
- Context-window isolation: the Role runner receives a bounded context bundle instead of inheriting the caller's chat context.
- Parallelism: the caller can run multiple Role subprocesses concurrently with independent invocation ids and working directories.
- Cost: the invocation envelope carries budget and model policy, and the result reports usage.
- Debuggability: every invocation has durable input, output, stdout or stderr, exit code, trace refs, and artifact hashes.
- Cross-platform portability: MCP, Claude slash commands, Codex skills, Cursor rules, and other host features can wrap or implement the runner, but the core contract stays local and file-based.

## Consequences

### Positive
- All Role contracts now share a stable invocation and return shape.
- The artifact protocol can depend on `RoleInvocation` and `RoleResult` schemas instead of prompt conventions.
- Context isolation becomes enforceable because Roles receive bounded input bundles.
- The same convention works whether the host environment is Codex, Claude Code, Cursor, or an MCP-capable orchestrator.
- Missing-context, low-confidence, blocked, and needs-human outcomes become first-class machine-readable states.

### Negative
- A runner binary or equivalent local adapter must exist and be versioned.
- Envelope schemas, timeout behavior, and trace handling add implementation work before full orchestration exists.
- Existing initiative language that assumes loose prompt handoffs must be rewritten.

### Neutral
- Multi-agent wave execution remains a Loop concern. Wave workers are not Role invocations, though they may call Roles through the same subprocess convention when they need specialist decisions.
- In-process adapters can still exist for tests, but they are not the architectural contract.