---
id: 002-role-plugin-invocation-convention
level: adr
title: "Role Plugin Invocation Convention"
number: 2
short_code: "DGOS-A-0002"
created_at: 2026-05-19T20:01:28.192767+00:00
updated_at: 2026-05-19T20:01:28.192767+00:00
decision_date: 2026-05-19
decision_maker: Dev-Genie maintainers
parent: 
archived: false

tags:
  - "#adr"
  - "#phase/draft"


exit_criteria_met: false
strategy_id: NULL
initiative_id: NULL
---

# ADR-2: Role Plugin Invocation Convention

## Context

DGOS-A-0001 split runtime vocabulary into Engines, Roles, and Loops. That split still leaves one critical runtime question open: how does the Orchestrator Loop invoke a Role at execution time?

The current initiative set references several possible models without choosing one:

- MCP tool call: expose each Role as a tool through an MCP server.
- Subagent spawn via a Task-style tool: ask the host agent platform to create another agent with role instructions.
- Slash command: rely on platform-specific command files that expand into role prompts.
- Skill load: load role guidance into the current agent context and ask it to behave as that Role.
- Child process via worktree: run an external role runner process against a repo path or isolated worktree.
- In-process function call: link role code directly into the Orchestrator process.

Without a single convention, the artifact protocol cannot be implemented reliably. The orchestrator needs one call surface with explicit inputs, typed outputs, timeout behavior, error handling, trace records, and cost accounting.

## Decision

For v1, Dev-Genie Role invocations will use a local subprocess Role runner with typed artifact envelopes.

The Orchestrator invokes a Role by running a command equivalent to:

```bash
dev-genie role invoke <role-id> --input <RoleInvocation.json> --output <RoleResult.json>
```

The exact binary name can change, but the convention is fixed:

- Input is a `RoleInvocation` JSON artifact envelope written by the orchestrator.
- Output is a `RoleResult` JSON artifact envelope written by the Role runner.
- Human-readable markdown can be included as an artifact body, but the handoff API is the JSON envelope.
- The Role runner may call an LLM, local deterministic Engines, MCP tools, or platform adapters internally, but those are implementation details hidden behind the subprocess boundary.
- The Role invocation is one-shot. Long-running execution state belongs to Loops, not Roles.
- The Role runner exits with a machine-readable status and a process exit code. The orchestrator never parses prose to determine success.

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

## Rationale

The subprocess convention gives the orchestrator a deterministic invocation boundary without forcing every Role to be implemented as a specific host-platform feature.

It scores well against the required criteria:

- Deterministic invocation: the orchestrator starts a process with explicit input and output files.
- Return-typed artifact handoff: all Role output must be written as `RoleResult` plus artifact refs.
- Context-window isolation: the Role runner receives a bounded context bundle instead of inheriting the orchestrator's chat context.
- Parallelism: the orchestrator can run multiple Role subprocesses concurrently with independent invocation ids and working directories.
- Cost: the invocation envelope carries budget/model policy, and the result reports usage.
- Debuggability: every invocation has durable input, output, stdout/stderr, exit code, trace refs, and artifact hashes.
- Cross-platform portability: MCP, Claude slash commands, Codex skills, Cursor rules, and other host features can wrap or implement the runner, but the core contract stays local and file-based.

## Alternatives Considered

| Option | Why Not Chosen |
|--------|----------------|
| MCP tool call | Good typed surface, but it requires every Role to be exposed through an MCP server and couples v1 to server lifecycle, transport, and client support. Use MCP as an adapter later, not the primary convention. |
| Subagent spawn via Task tool | Strong for parallel human-like work, but too platform-specific and hard to make return-typed. Use it for Loop-managed worker agents, not one-shot Role invocation. |
| Slash command | Useful UX on platforms that support it, but it is prompt expansion rather than a stable runtime API. It cannot be the orchestrator's primary contract. |
| Skill load | Useful for local guidance, but it pollutes the caller context and does not isolate role reasoning or guarantee typed returns. |
| Child process via worktree | Chosen in the narrower form of a local subprocess Role runner. A full isolated worktree is optional for Roles and required only when the Role needs repo writes, which should be rare. |
| In-process function call | Simple for tests, but it couples Roles to orchestrator implementation language and makes isolation, timeout enforcement, and adapter portability weaker. Use only as a fake adapter in tests. |

## Consequences

### Artifact Shape

All Role contracts must define `RoleInvocation` and `RoleResult` schemas. Markdown-only outputs are not valid Role outputs. Role-produced artifacts must include content hashes and ownership metadata so Document Engine can validate, index, supersede, or reject them.

### Error Handling

The orchestrator handles these failure modes uniformly:

- timeout: mark invocation `failed`, preserve partial traces, and follow retry policy.
- non-zero exit: mark invocation `failed` unless a valid `RoleResult` says `blocked` or `needs_human`.
- malformed result: mark invocation `failed` and route to Validation or implementation bug triage.
- low confidence: follow Decision Policy; usually retry with more context, escalate to human, or route to another Role.
- missing context populated: route to Context Engine or Repo Intelligence before retrying, unless policy says human review is required.
- skipped: require a skip reason and verifier policy before downstream artifacts can rely on the skip.

### Timeouts and Retries

Each Role invocation receives an explicit timeout and retry policy. Retries must create new invocation ids linked to the failed invocation. The orchestrator may retry with expanded context, different model tier, or a human-review requirement, but it must not silently loop.

### Observability

Every invocation records:

- command, role id, role version, adapter version
- input artifact refs and hashes
- context bundle refs
- policy refs
- stdout/stderr locations
- output artifact refs and hashes
- status, confidence, missing context, review requirement
- cost and duration

### Multi-Agent Waves

Multi-Agent Wave Execution remains a Loop concern. Wave workers are long-running Developer Loops or migration Loops, not Role invocations. The Wave Loop may call Roles through this same subprocess convention when it needs planning, architecture, design, or quality decisions. If a Role decision changes a shared contract during a wave, the Wave Loop must quiesce dependent workers before resuming them.

## Follow-Up

The following initiatives must be updated to reflect this ADR:

- DGOS-I-0030: replace vague typed-contract language with the subprocess Role runner convention.
- DGOS-I-0028: specify orchestration dispatch, failure handling, low-confidence behavior, and missing-context behavior through `RoleInvocation` and `RoleResult`.
- DGOS-I-0009: clarify that parallel waves use Loop-managed workers and call one-shot Roles through the same convention when needed.
- DGOS-I-0002: add `RoleInvocation` and `RoleResult` schemas to the artifact protocol.
- DGOS-I-0005: route `DecisionRequest` resolution through the subprocess Role runner.
- DGOS-I-0020 and DGOS-I-0021: attach policy decisions and budget/model tier policy to each Role invocation.
