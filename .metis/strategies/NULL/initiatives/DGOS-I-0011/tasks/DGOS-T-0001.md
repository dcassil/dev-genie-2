---
id: sdk-spike-sub-agent-permission
level: task
title: "SDK Spike: Sub-Agent Permission Surfacing"
short_code: "DGOS-T-0001"
created_at: 2026-05-22T17:53:31.449613+00:00
updated_at: 2026-05-22T19:39:34.870503+00:00
parent: DGOS-I-0011
blocked_by: []
archived: false

tags:
  - "#task"
  - "#phase/completed"


exit_criteria_met: false
strategy_id: NULL
initiative_id: DGOS-I-0011
---

# SDK Spike: Sub-Agent Permission Surfacing

## Parent Initiative

[[DGOS-I-0011]] — implements the substrate decided in [[DGOS-A-0005]] (Loop Execution Substrate). This is **TASK #1** and the **gating spike** the ADR mandates before the AgentTransport adapter is built.

## Objective

Determine, against a **pinned Claude Agent SDK version**, whether tool-permission requests made by a **sub-agent** (one spawned via the `Task` tool / sub-agent mechanism from a parent session) **reliably surface to the parent session's `canUseTool` callback and/or `PreToolUse` hooks**. ADR-3's recursion and the AgentTransport `needs_permission` event (DGOS-A-0005) both depend on this surfacing holding. The deliverable is a **written go/no-go** with reproducible evidence that decides one of two architectural paths:

- **SDK path holds** → the Claude Agent SDK is the primary AgentTransport adapter for recursive permission gating ([[DGOS-T-0004]] proceeds as planned).
- **SDK path does not hold** → the recursive `needs_permission` case degrades and MUST fall back to PTY-style output detection; this spike pins the SDK version where it breaks and scopes the PTY fallback that [[DGOS-T-0004]] will then need.

This is a **spike**, not production code. Its output is knowledge + a pinned version + a recorded decision, not a shipped feature. The throwaway harness is committed under a `spikes/` path for reproducibility but is explicitly not part of the `daimyo` runtime.

## Acceptance Criteria

- [ ] A specific Claude Agent SDK version is **pinned** (exact version string recorded) and the harness's `package.json` references it exactly.
- [ ] A minimal reproducible harness exists that: starts a parent SDK session with a `canUseTool` callback **and** a `PreToolUse` hook registered; has the parent spawn a sub-agent (via the `Task` tool / SDK sub-agent mechanism); has that sub-agent attempt a tool call that requires permission (e.g. a write/edit/bash tool).
- [ ] The harness **records, with evidence** (captured event stream / logs), whether the sub-agent's permission request reached (a) the parent `canUseTool` callback, (b) the parent `PreToolUse` hook, (c) neither, or (d) some partial/inconsistent behavior — including whether the `correlationId`/tool-name/arguments needed by the AgentTransport `needs_permission` payload are present and attributable to the sub-agent.
- [ ] The behavior is verified across **at least 2 runs** to assess "reliably" (not a one-off), and any non-determinism is documented.
- [ ] Nested depth is probed: a sub-agent that itself spawns a sub-sub-agent — does permission surfacing survive ≥2 levels of recursion (ADR-3 trees can be deeper than one level)?
- [ ] A **written go/no-go** is recorded in this task's Status Updates AND cross-linked into [[DGOS-A-0005]] (under its "Open SDK assumption to pin first" note) and [[DGOS-T-0004]], stating the chosen path and, if no-go, the concrete fallback scope.
- [ ] If no-go: the failure mode is characterized precisely enough that [[DGOS-T-0004]]'s PTY fallback for `needs_permission` can be scoped (what signal IS available, what is lost).

## Implementation Notes

### Technical Approach

1. Stand up a throwaway TypeScript harness under `spikes/sdk-permission-surfacing/` with the Agent SDK pinned to an exact version.
2. Register both permission mechanisms on the parent session: the `canUseTool` callback and a `PreToolUse` hook. Instrument both to log every invocation with full payload + a timestamp + a tag identifying whether the call originated from the parent or a sub-agent.
3. Drive a parent → sub-agent → (optional) sub-sub-agent chain where the deepest agent must call a permission-gated tool. Use a tool that is unambiguously gated (file write or bash) so "no prompt" can't be confused with "auto-allowed read".
4. Capture the SDK event/message stream to disk for each run so the evidence is reproducible and reviewable.
5. Compare observed behavior against the AgentTransport `needs_permission` contract requirements from DGOS-A-0005: payload must carry tool name, arguments, and a `correlationId` attributable to the originating (sub-)agent.
6. Write the go/no-go conclusion and propagate the cross-links.

### Dependencies

- **Upstream:** none — this is the first task and intentionally has no `daimyo` code dependency (it predates the scaffold so the architecture can react to its result).
- **Downstream:** [[DGOS-T-0004]] (AgentTransport SDK adapter) is gated on this result; [[DGOS-T-0009]] (Tier-2 investigating agent, which also spawns a worker via AgentTransport) inherits the same assumption.
- Requires a working Anthropic API key / model access in the spike environment.

### Risk Considerations

- **Primary risk:** the historically inconsistent behavior the ADR flags is itself non-deterministic, so "reliably" is a judgment call. Mitigation: multiple runs + explicit documentation of any flakiness rather than a single green run.
- **Version drift:** a later SDK version may change behavior. Mitigation: pin exactly and record the version; DGOS-T-0004 must consume the *same* pin.
- **False negative from misconfiguration:** the harness might fail to surface permissions due to a setup bug, not an SDK limitation. Mitigation: first confirm permission surfacing works for a **direct** (non-sub-agent) parent tool call as a control, then introduce the sub-agent layer.

### Execution Profile

**Recommended Agent: opus + high.** Although bounded in scope, the conclusion is load-bearing: it picks between the SDK and PTY transport paths for all of recursive permission gating. A wrong "go" call cascades into DGOS-T-0004 and the whole recursion model, so the higher tier is warranted despite the small surface area.

## Status Updates

### 2026-05-22 — Spike complete: NO-GO (depth-dependent), evidence verified

Executed via Codex (`gpt-5.5`) against the Claude Code gateway credentials. Harness lives at `spikes/sdk-permission-surfacing/`; raw evidence under `spikes/sdk-permission-surfacing/evidence/` (`summary.json` + per-run `messages.jsonl`/`callbacks.jsonl`). Evidence reviewed and confirmed authentic (real session IDs, `toolu_*` ids, transcript paths, consistent counts).

**Pinned SDK:** `@anthropic-ai/claude-agent-sdk@0.3.148`.

**Results (2/2 runs per scenario):**
- **Direct parent tool call:** `PreToolUse:parent:Bash` + `canUseTool:parent:Bash` both fire. Control passes — setup is sound.
- **1-level sub-agent:** `PreToolUse:parent:Agent`, `PreToolUse:sub-agent:Bash`, and `canUseTool:sub-agent:Bash` all fire, **with origin attribution**. Sub-agent permission surfacing **holds at depth 1**.
- **2-level nested sub-agent:** only `PreToolUse:parent:Agent` fires. **No structured nested `needs_permission` event**; the inner denial is visible only as forwarded prose text. The DGOS-A-0005 `needs_permission` payload requirements (tool name, arguments, `correlationId` attributable to the originating sub-agent) are **not satisfiable** at depth ≥2.

**GO/NO-GO: NO-GO** for relying on the SDK alone for *recursive* (nested ≥2) permission gating. The SDK path is sufficient for direct + depth-1; depth ≥2 has no structured signal.

**PTY-fallback scope (what DGOS-T-0004 inherits if nested SDK agents are used):**
- *Available:* parent `task_started`/`task_notification`, outer agent `tool_result` text, forwarded sub-agent transcript text, and the denial string `Claude requested permissions to use Bash, but you haven't granted it yet.`
- *Lost:* live structured nested permission event, nested `tool_use_id` correlation, originating sub-sub-agent id, structured nested tool arguments, and any SDK approve/deny target for the inner request.

**Architectural note for the decision-maker:** DGOS-A-0005's Supervisor drives **disposable agents from out-of-process** and owns the recursive node tree in deterministic code. If each leaf/inner node is spawned by the Supervisor as its **own top-level SDK session** (rather than as an SDK `Task` sub-agent nested inside another agent), then every node gets **direct/depth-0 permission events** and the depth-≥2 gap is largely sidestepped — the Tier-2 investigator (DGOS-T-0009) likewise spawns a fresh top-level session. The NO-GO bites only if the design relies on *nested* SDK sub-agents for recursion. This needs an explicit decision (see DGOS-T-0004 notes) before T-0004 is built.

exit_criteria_met: true — spike delivered pinned version, reproducible multi-run evidence, depth probing, and a recorded go/no-go with fallback scope.