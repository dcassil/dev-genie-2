---
id: agenttransport-port-contract
level: task
title: "AgentTransport Port Contract & Claude SDK Adapter"
short_code: "DGOS-T-0004"
created_at: 2026-05-22T17:53:49.571024+00:00
updated_at: 2026-05-22T17:53:49.571024+00:00
parent: DGOS-I-0011
blocked_by: []
archived: false

tags:
  - "#task"
  - "#phase/todo"


exit_criteria_met: false
strategy_id: NULL
initiative_id: DGOS-I-0011
---

# AgentTransport Port Contract & Claude SDK Adapter

## Parent Initiative

[[DGOS-I-0011]] — implements the first of the three ports from [[DGOS-A-0005]] and its primary (Claude Agent SDK) adapter. This is the port whose under-specification the ADR flags as the top leak risk.

## Objective

Fully specify the **AgentTransport port contract** — the event/command vocabulary by which the Supervisor spawns and drives a disposable agent — and implement its **primary adapter against the pinned Claude Agent SDK**. The contract must be precise enough to fake deterministically: every event's payload, the correlation model, ordering/async guarantees, and hang semantics. The crucial design rule is that **`log` (agent making progress) and `stalled` (no progress for an interval) are separate events** — collapsing them reintroduces the working-vs-paused ambiguity this whole substrate exists to remove.

## Acceptance Criteria

- [ ] The port defines the event set — `turn_ended`, `needs_permission`, `needs_input`, `log`, `exited`, `stalled` — and the command set — `respond`, `approve`, `deny`, `choose_option`, `interrupt`, `resume` — as typed contracts.
- [ ] For **each event**, the contract specifies: its **payload** (e.g. `needs_permission` carries tool name, arguments, and a `correlationId`), with full field types.
- [ ] The **correlation model** is specified and enforced: every `respond`/`approve`/`deny`/`choose_option` references the `correlationId` of the pending event it answers; the adapter rejects/flags answers with no matching pending correlation.
- [ ] **Ordering / async guarantees** are documented and tested (e.g. can two `needs_permission` events be outstanding at once? are events delivered in order per session?).
- [ ] **Hang semantics** are specified: the configurable no-progress interval that raises `stalled`, the precise "missing-progress" condition that distinguishes `stalled` from an ongoing `log` stream, and how `interrupt` is expected to be honored (and what happens if it isn't within a timeout).
- [ ] The **SDK adapter** maps SDK reality onto the contract: `result` message → `turn_ended`; `canUseTool` / `PreToolUse` → `needs_permission`; streaming narration/tool output → `log`; `interrupt()`/`AbortController` → `interrupt`; `resume`-by-session-id → `resume`; process exit → `exited`; and a timer over the `log` stream → `stalled`.
- [ ] The adapter uses the **exact SDK version pinned in [[DGOS-T-0001]]**.
- [ ] **Recursive permission behavior follows the [[DGOS-T-0001]] go/no-go:** if the spike said *go*, sub-agent `needs_permission` events surface through the SDK adapter and a test demonstrates it; if *no-go*, the recursive `needs_permission` path is implemented via the documented PTY-style fallback detection scoped by the spike, and the limitation is recorded in the adapter docs.
- [ ] The Supervisor **core does not depend on the SDK adapter concretely** — only on the port; a fake transport (scriptable event stream + command sink) exists in test-support for testing the loop without a real agent.
- [ ] Adapter is integration-tested against a real (short) SDK session for at least: a clean turn end, a permission request + approve, a permission request + deny, an input request + respond, and an interrupt of a running turn.

### Test Cases

- **TC-001 — log vs stalled separation:** a session that streams narration then goes quiet raises `log` events during narration and exactly one `stalled` after the configured interval; resuming activity does not retroactively reclassify prior `log`s. Pass when the two signals never collapse.
- **TC-002 — correlation integrity:** answering a `needs_permission` with a mismatched `correlationId` is rejected; answering with the correct one resolves exactly that pending event.
- **TC-003 — interrupt honored / timeout:** `interrupt` on a long-running turn produces `exited`/turn termination within the timeout; if the agent ignores it, the documented escalation fires.

## Implementation Notes

### Technical Approach

- Treat the port as the contract of record and the SDK adapter as one implementation. Write the contract doc + types first ([[DGOS-T-0002]] gave the type stubs; this task fills semantics), then build the adapter to satisfy it.
- Implement `stalled` as a transport-level timer over the `log` stream, configurable per run, explicitly distinct from `log` — this is the single most important correctness point of the task.
- Map SDK `result` messages as the unambiguous turn-end signal rather than inferring "done" from prose.
- Keep the recursion/permission branch behind the spike result so this task is not blocked on an unknown: consume [[DGOS-T-0001]]'s recorded decision directly.

> **[[DGOS-T-0001]] outcome (2026-05-22): NO-GO at depth ≥2.** With `@anthropic-ai/claude-agent-sdk@0.3.148`, permission events surface structurally for **direct calls and 1-level sub-agents** (with origin attribution) but **NOT for ≥2 nested SDK sub-agents** (only prose text). **Resolution pending decision-maker confirmation:** because DGOS-A-0005's Supervisor is out-of-process and spawns each node as a worker, the intended model is for the Supervisor to spawn **each leaf/inner node as its own top-level SDK session** — giving every node depth-0/direct permission events and avoiding nested-sub-agent depth entirely. If that interpretation is confirmed, this task implements the SDK adapter against **top-level sessions only** and needs **no PTY fallback for v1**; nested-SDK-sub-agent permission gating is explicitly out of scope. If the design instead requires nested SDK sub-agents, this task must add the PTY/text-detection fallback scoped in DGOS-T-0001 (denial-string + transcript parsing, with the correlation/arguments limitations noted there).

### Dependencies

- **Upstream:** [[DGOS-T-0001]] (pinned version + go/no-go), [[DGOS-T-0002]] (port type stubs, core, fakes).
- **Downstream:** [[DGOS-T-0008]] (loop drives agents through this), [[DGOS-T-0009]] (Tier-2 investigator spawns a read-only worker through this), [[DGOS-T-0010]] (issues `interrupt` to in-flight workers).

### Risk Considerations

- **Port too SDK-shaped to fit a future PTY adapter** (an ADR review trigger). Mitigation: model PTY's fuzzy "maybe idle" via the already-separate `stalled` event and a transport-derived signal, and avoid leaking SDK message types into the port surface.
- **Permission surfacing for sub-agents may be unreliable** (the spike's whole point). Mitigation: this task strictly follows the spike's recorded decision and implements the fallback if needed.
- **Hang detection false positives** (a slow-but-working agent flagged `stalled`). Mitigation: make the interval configurable and document tuning; default conservative.

### Execution Profile

**Recommended Agent: opus + high.** The ADR names AgentTransport under-specification as the principal leak risk, and this contract is consumed by the loop, the reconciler, and the Tier-2 investigator. Getting payloads, correlation, and hang semantics right is exactly the compounding-rework-prevention case for the top tier.

## Status Updates

*To be added during implementation.*
