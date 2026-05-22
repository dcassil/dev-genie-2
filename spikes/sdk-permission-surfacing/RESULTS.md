# SDK Permission Surfacing Spike Results

Task: DGOS-T-0001 - SDK Spike: Sub-Agent Permission Surfacing  
Date: 2026-05-22  
Pinned SDK: `@anthropic-ai/claude-agent-sdk@0.3.148`

## Harness

The throwaway TypeScript harness lives in `spikes/sdk-permission-surfacing/`.

- `package.json` pins `@anthropic-ai/claude-agent-sdk` exactly to `0.3.148`.
- The current SDK API exposes the sub-agent mechanism as the `Agent` tool while init streams still list `Task`; the harness uses the SDK `Agent` mechanism.
- Parent sessions register both:
  - `canUseTool`, logging tool name, arguments, `toolUseID`, `agentID`, and permission metadata.
  - `PreToolUse`, logging full hook input including `tool_name`, `tool_input`, `tool_use_id`, `agent_id`, and `agent_type`.
- `includeHookEvents`, `includePartialMessages`, and `forwardSubagentText` are enabled.
- Bash/write probes are denied by the harness after logging so no probe write should succeed.
- The harness does not hardcode a key. In this run, `ANTHROPIC_AUTH_TOKEN` was present but empty, `ANTHROPIC_BASE_URL` was empty, and the SDK still ran through the existing Claude Code auth path. SDK init events report `apiKeySource: "none"` and model `claude-opus-4-7[1m]`.

## Evidence Files

Each scenario ran twice. Every run has:

- `messages.jsonl` - full SDK event/message stream plus harness metadata.
- `callbacks.jsonl` - full `canUseTool` and `PreToolUse` callback payloads.
- `summary.json` - per-run counts.

Run evidence:

- Direct parent control:
  - `evidence/direct-run-1/messages.jsonl`
  - `evidence/direct-run-1/callbacks.jsonl`
  - `evidence/direct-run-2/messages.jsonl`
  - `evidence/direct-run-2/callbacks.jsonl`
- One-level sub-agent:
  - `evidence/subagent-1-run-1/messages.jsonl`
  - `evidence/subagent-1-run-1/callbacks.jsonl`
  - `evidence/subagent-1-run-2/messages.jsonl`
  - `evidence/subagent-1-run-2/callbacks.jsonl`
- Two-level nested sub-agent:
  - `evidence/subagent-2-run-1/messages.jsonl`
  - `evidence/subagent-2-run-1/callbacks.jsonl`
  - `evidence/subagent-2-run-2/messages.jsonl`
  - `evidence/subagent-2-run-2/callbacks.jsonl`
- Aggregate:
  - `evidence/summary.json`

## Observed Surfacing Matrix

| Parent mechanism | Direct parent Bash | 1-level sub-agent Bash | 2-level sub-sub-agent Bash |
|---|---|---|---|
| Parent `canUseTool` | Yes, both runs. `canUseTool:parent:Bash`. | Yes, both runs, tagged as sub-agent. `canUseTool:sub-agent:Bash` with `agentID`. | No, both runs. No `canUseTool` callback fired for the nested Bash denial. |
| Parent `PreToolUse` | Yes, both runs. `PreToolUse:parent:Bash`. | Yes, both runs. Parent `Agent` call plus child `PreToolUse:sub-agent:Bash` with `agent_id` and `agent_type`. | Only the parent `Agent` call surfaced. No `PreToolUse` callback fired for the nested Bash denial. |
| Neither | No for direct parent Bash. | No for 1-level Bash. | Yes for the actual nested Bash permission event: neither parent callback saw the nested Bash tool call. |
| Partial / inconsistent | None observed. | None observed. | Partial only through message text/tool result. The SDK stream contains parent task lifecycle events and the delegator's textual report that nested Bash was denied, but not a structured permission callback. Run 1 also had a transient malformed inner Agent invocation API error before self-correction; run 2 did not. Both final nested Bash probes were denied without parent callbacks. |

## Payload Requirements from DGOS-A-0005

For direct parent calls and 1-level sub-agent calls, the `needs_permission` payload requirements are satisfiable:

- Tool name: `Bash` from `canUseTool.toolName` or `PreToolUse.input.tool_name`.
- Arguments: command and description from `input` / `tool_input`.
- Correlation ID: `toolUseID` / `tool_use_id`.
- Originating sub-agent attribution: `agentID` in `canUseTool`; `agent_id` and `agent_type` in `PreToolUse`.

For 2-level nested sub-agent calls, the requirements are not satisfiable from parent SDK callbacks:

- No parent `canUseTool` or `PreToolUse` callback fired for the nested Bash call.
- The available structured IDs are for the parent-to-delegator `Agent` task (`tool_use_id`, `task_id`, `agentId` of the delegator), not the inner Bash tool call.
- The only nested Bash details came back as prose/tool-result text, including attempted command and denial text: `Claude requested permissions to use Bash, but you haven't granted it yet.`
- The parent stream did not provide a structured inner Bash `tool_use_id`, inner `agent_id`, normalized tool arguments, or an approval/deny correlation target.

## Non-Determinism

Direct and 1-level runs were stable across both runs.

Two-level runs were stable in the architectural result: the nested Bash denial did not reach parent `canUseTool` or parent `PreToolUse` in either run. Run 1 included one malformed inner Agent tool invocation (`messages.1.content.0.tool_use.name: Input should be a valid string`) before the delegator self-corrected and completed the nested Bash probe; run 2 did not show that malformed-call detour.

## PTY Fallback Scope if NO-GO

Signal available to a fallback:

- Parent stream `task_started` / `task_notification` for the outer `Agent` task.
- Parent stream `tool_result` text for the outer `Agent` call.
- Delegator/subagent transcript text forwarded through `forwardSubagentText`.
- Denial string: `Claude requested permissions to use Bash, but you haven't granted it yet.`
- Often, but not contractually, the attempted command appears in the subagent prose.

Signal lost versus the SDK callback contract:

- No live blocking permission event for the nested Bash call.
- No structured nested `tool_name`/arguments payload.
- No inner Bash `tool_use_id` suitable as a `needs_permission.correlationId`.
- No reliable originating sub-sub-agent ID/type for the exact Bash call.
- No SDK command target for `approve`/`deny` of the inner Bash request.
- No deterministic distinction between a real permission event and a subagent prose summary unless a PTY/text parser recognizes specific CLI output.

DGOS-T-0004 should therefore scope PTY-style detection for recursive depth >= 2 around the CLI permission/denial text and task transcript stream. The SDK callbacks can still be used for direct and 1-level permission events, but not as the sole recursive transport contract.

## Recommendation

NO-GO for relying on the Claude Agent SDK alone as the recursive `needs_permission` transport.

The SDK path holds for direct parent calls and one sub-agent level on `@anthropic-ai/claude-agent-sdk@0.3.148`, but it does not hold for >=2 nested levels. Because ADR-3 recursion can be deeper than one level and DGOS-A-0005 requires structured `needs_permission` events with correlation IDs attributable to the originating sub-agent, DGOS-T-0004 must include a PTY/text-detection fallback for nested permission handling.

## Verification Commands

```text
$ npm run typecheck
> sdk-permission-surfacing-spike@0.0.0 typecheck
> tsc --noEmit
```

```text
$ npm run run
completed 6/6 runs:
- direct: 2/2 parent PreToolUse + parent canUseTool
- subagent-1: 2/2 sub-agent PreToolUse + sub-agent canUseTool
- subagent-2: 2/2 no nested Bash parent callback; only parent Agent hook + textual nested denial
```

## Scope Deviation

The task acceptance criteria ask for status updates in DGOS-T-0001 and cross-links into DGOS-A-0005 / DGOS-T-0004. The user instruction for this run explicitly said not to edit Metis task docs, so this spike records the decision only in `spikes/sdk-permission-surfacing/RESULTS.md`.
