# Spec: Multi-Agent Orchestration Extension for Katana

Status: Proposed
Companion: `lessons-learned.md` (this directory)
Related ADRs: KAT-A-0001 (storage), KAT-A-0002 (loop runtime), KAT-A-0003 (universal vs platform commands)

## 1. Problem

Katana today produces well-structured Epic → User Story → Task documents and runs a per-task work-eval-gate loop (`src/workflow/loop.ts`). The human still has to manually:

1. Spin up one Claude Code (or Cursor / Codex / OpenAI) session per Epic.
2. Tell each session which instruction-set doc to read.
3. Track which sessions are waiting, which are running, which have completed.
4. Sequence the waves — start Batch 2 only after Batch 1's gate is verified.
5. Answer questions when a child agent gets stuck.
6. Bring results back together.

For a 16-instance project (NELP Phase 1, May 2026) this took meaningful overhead and is error-prone — humans forget which batch is next, leave terminals dangling, lose the dependency graph.

## 2. Goal

Replace manual instance management with a single **orchestration agent** that consumes a Katana plan and spawns child agents on demand. The orchestration agent:

- Knows nothing about the specifics of any one epic / story / task.
- Knows only the dependency graph, the wave plan, and the lifecycle protocol.
- Spawns child agents via new MCP tools.
- Waits on completion signals, handles escalation questions, sequences the next batch.
- Reports collapsed results upward to the human.

Child agents may in turn spawn grandchild agents (existing Agent-tool behavior); reports propagate up to the orchestrator, who only ever sees high-level summaries.

## 3. Non-Goals

- Replace the human in any HITL gate (initiative phase transitions, architectural decisions, code review escalations).
- Automatic merge to protected branches.
- Substitute for the per-task Ralph loop (`src/workflow/loop.ts`) — the loop runs *inside* each child agent.
- Replace Codex review with auto-merge — the negotiation protocol stays human-arbited at Round 2.

## 4. Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Human                                                  │
│    ↕ approves wave starts, resolves escalations         │
│  Orchestration Agent  (Claude Opus, one long session)   │
│    ↓ spawn_agent      ↑ agent_completed / agent_blocked │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  …            │
│  │ Child 1  │  │ Child 2  │  │ Child 3  │               │
│  │ (Epic A) │  │ (Epic B) │  │ (Epic C) │               │
│  └──┬───────┘  └──┬───────┘  └──┬───────┘               │
│     ↓ Agent tool                                        │
│  ┌──────────┐                                           │
│  │ Grandchild│  (per-task subagent within child)        │
│  └──────────┘                                           │
└─────────────────────────────────────────────────────────┘
```

**Process model:** each child agent is its own OS process running a Claude Code (or Cursor / Codex CLI / OpenAI) session in an isolated git worktree, configured with its own model + effort via `.claude/settings.json`. The orchestration agent does not embed children — it manages their lifecycle.

**Communication model:** filesystem-based, polled via MCP. The orchestration agent writes spawn requests through MCP; children write status updates through MCP; the platform mediates. This avoids tying us to any one IDE's process model.

## 5. New MCP Tools

All tools live under `src/mcp/tools/` and follow the existing schema-validation pattern.

### `spawn_agent`

Start a fresh agent in an isolated worktree pointed at a Katana doc.

**Input:**

```ts
{
  doc_short_code: string;            // e.g. "KAT-E-0007"
  worktree_name: string;             // e.g. "kat-epic-7"
  branch_name: string;               // e.g. "epic/kat-e-0007"
  model: "opus" | "sonnet" | "haiku" | "gpt-5-codex" | string;
  effort: "low" | "medium" | "high" | "xhigh";
  platform: "claude-code" | "cursor" | "codex-cli" | "openai-agent";
  parent_short_code?: string;        // doc of the spawning agent (orchestrator's epic, or null)
  completion_signal: {
    type: "phase_transition" | "file_artifact" | "explicit_report";
    target: string;                  // e.g. "completed" or "PR_OPENED_<branch>"
  };
  escalation_policy: {
    on_question: "wait_for_orchestrator" | "use_default" | "fail_fast";
    on_block: "escalate_to_human" | "retry" | "fail";
    max_idle_seconds?: number;       // default 1800
  };
  instructions_source: {
    type: "agent_doc" | "inline";
    path?: string;                   // e.g. "agents/agent-07-epic-7.md"
    content?: string;                // for inline instructions
  };
}
```

**Output:**

```ts
{
  agent_id: string;                  // UUID
  pid?: number;                      // OS PID for subprocess-based platforms
  worktree_path: string;
  status: "starting" | "running" | "failed_to_start";
  spawned_at: string;                // ISO timestamp
}
```

**Behavior:**

1. Validate inputs (doc exists, model+effort known, platform supported).
2. Create the worktree via `git worktree add` if not present.
3. Write `<worktree>/.claude/settings.json` with model + effort.
4. Persist agent record to `.katana/agents/<agent_id>.json` (state, parent, doc, etc.).
5. Launch the platform-specific subprocess. The instruction-set doc is loaded as the first user message.

### `query_agent`

Inspect status of one agent.

**Input:** `{ agent_id: string }`

**Output:**

```ts
{
  agent_id: string;
  status: "starting" | "running" | "waiting_for_orchestrator" | "blocked" | "completed" | "failed";
  current_phase?: string;            // last phase the doc transitioned to
  last_heartbeat: string;
  pending_question?: {
    text: string;
    asked_at: string;
  };
  completion_payload?: object;       // present when status === "completed"
  failure_reason?: string;
}
```

### `list_active_agents`

Get all running children.

**Input:** `{ status_filter?: AgentStatus[] }`

**Output:** `{ agents: AgentRecord[] }`

### `send_to_agent`

Respond to a child agent's pending question.

**Input:**

```ts
{
  agent_id: string;
  response: string;                  // free-form text answer
  unblock?: boolean;                 // if true, transitions status back to "running"
}
```

**Output:** `{ delivered_at: string }`

### `wait_for_agents`

Block until a set of agents reaches a target status. Used by orchestration agent to gate wave transitions.

**Input:**

```ts
{
  agent_ids: string[];
  target_status: "completed" | "any_terminal";
  timeout_seconds?: number;          // default 14400 (4hr)
  poll_interval_seconds?: number;    // default 30
}
```

**Output:**

```ts
{
  results: Record<string, AgentRecord>;
  timed_out_ids: string[];
}
```

### `terminate_agent`

Hard-stop an agent (escalation cases, runaway loops).

**Input:** `{ agent_id: string; reason: string }`

**Output:** `{ terminated_at: string }`

### `compute_wave_plan`

Compute a wave-execution plan from a top-level doc.

**Input:**

```ts
{
  root_short_code: string;           // e.g. a product-doc or top-level epic
  max_concurrent_per_wave?: number;  // default 3
}
```

**Output:**

```ts
{
  waves: Array<{
    wave_number: number;
    agents: Array<{
      doc_short_code: string;
      worktree_name: string;
      model: string;
      effort: string;
      depends_on: string[];          // other doc short codes
      single_author: boolean;        // wave runs alone if true
      coordination_notes: string[];  // human-readable callouts
    }>;
  }>;
  total_instances: number;
  peak_concurrent: number;
}
```

**Computation:**

1. Walk the doc tree from root.
2. Build the dependency graph from each doc's frontmatter `depends_on` array (new field).
3. Topo-sort into layers. Each layer = a wave.
4. For each doc, decide single-author vs fan-out via the rules in Section 9 (Formal Gates).
5. Allocate migration ranges (Section 9.2).

## 6. New Skills (Claude Code plugin extension)

These are skills the orchestration agent uses; they are not user-facing slash commands.

### `katana:orchestrate-batch`

Spawn a batch of agents from a wave plan, wait for completion, report.

Pseudocode:

```
batch = wave.agents
for agent_spec in batch:
  spawn_agent(agent_spec)
wait_for_agents(batch.ids, target="completed")
for record in results:
  if record.status == "completed":
    summarize record.completion_payload
  else:
    escalate to human
```

### `katana:start-instance`

Single-instance spinup for one-off work (testing, hotfixes, side-tasks not on the wave plan). Wraps `spawn_agent` with sensible defaults pulled from the doc.

### `katana:report-to-orchestrator`

Child agent calls this on completion. Writes the completion payload to its agent record and emits the configured completion signal so the orchestrator's `wait_for_agents` unblocks.

## 7. Sibling Architecture Docs

Per `lessons-learned.md §2`, every level needs typed sibling documents. Add to Katana:

| Parent doc type | Sibling doc types |
|---|---|
| product-doc | none (it IS the strategic sibling) |
| epic | epic-architecture, epic-ui-hints |
| user-story | story-architecture (schema deltas, API additions), story-ui-hints |
| task-* | task-spec (concrete files to touch, acceptance criteria) |

Frontmatter on each doc carries `siblings: { architecture?: short_code; ui_hints?: short_code; spec?: short_code }`. The `validate_document` MCP tool rejects publication of a parent without required siblings present and complete.

This codifies what NELP did informally with `Documentation/Architecture/Schema/finalized/planning/user-stories/EPIC-NN-*/{README,UI-HINTS,US-*}.md`.

## 8. Frontmatter Additions

New top-level fields across doc types (extend `docs/schema/frontmatter.md`):

```yaml
# Dependency graph (used by compute_wave_plan)
depends_on: [KAT-E-0001, KAT-E-0002]    # other doc short codes
blocks: []                                # auto-computed reverse index

# Execution profile (used by spawn_agent defaults)
execution:
  model_tier: strong | cheap | ui
  effort: low | medium | high | xhigh
  platform: claude-code | cursor | codex-cli
  worktree_name: kat-epic-1
  branch_name: epic/kat-e-0001
  migration_range: "0010-0029"           # optional, gate-enforced
  single_author: true | false            # forced single-author wave?

# Codex review
codex_review:
  required: true | false
  precommit_required: true | false
  completion_status: pending | passed | escalated

# Sibling docs
siblings:
  architecture: KAT-EA-0001
  ui_hints: KAT-EU-0001
```

## 9. Formal Gates (codified from manual rules)

Each gate is a check that runs at a specific lifecycle event and blocks progress on violation. Plugs into the existing gate engine via `src/workflow/gate-adapter.ts`.

### 9.1 Decomposition gates

Run on `decompose_document` MCP call.

- **`recommended_agent_present`**: every child task must have `execution.model_tier` and `execution.effort` set. Reject if missing.
- **`no_template_placeholders`**: tasks must not contain `{placeholder}` strings or "TBD". Reject if found.
- **`acceptance_criteria_concrete`**: each task has at least one acceptance criterion that contains a verifiable predicate (not "works correctly"). Soft-warn if heuristic suggests filler.

### 9.2 Wave-planning gates

Run on `compute_wave_plan` MCP call.

- **`single_author_classification`**: an Epic is classified single-author if any of:
  - `execution.single_author == true` in frontmatter (manual override).
  - The Epic is referenced by `depends_on` of ≥3 downstream epics AND defines a shared contract (heuristic: introduces a public interface in a `*-architecture.md` sibling).
  - The Epic edits a file flagged in the workspace as `shared_surface` (configured per-project).
- **`migration_range_allocation`**: every Epic with schema changes gets a non-overlapping migration range. Allocator assigns; gate validates no two epics' ranges overlap.
- **`disjoint_surfaces_in_wave`**: agents in the same fan-out wave must have disjoint `owns_files` (frontmatter) and disjoint `owns_tables`. Reject otherwise.

### 9.3 Pre-commit gates

Run via git pre-commit hook installed by the platform.

- **`audit_plugin_green`** (existing).
- **`protected_branch_block`**: current branch not in workspace's `protected_branches` list (default `main`, `staging`, plus any configured).
- **`migration_in_range`**: any staged migration's number falls within the current Epic's `execution.migration_range`.
- **`no_lint_or_ts_rule_edits`**: staged diff must not modify `eslint.config.*`, `tsconfig*.json` rule sections, etc.
- **`no_db_mocks_in_integration_tests`**: configurable glob (e.g., `**/__tests__/integration/**`) must not contain `vi.mock("@supabase/...")` or similar.
- **`codex_precommit_passed`** (if `codex_review.precommit_required`): runs Codex CLI; rejects on `BLOCK`.

### 9.4 Phase-transition gates

Run on `transition_phase` MCP call.

- **`hitl_approval_for_active`**: transitioning a non-task doc to `active` requires `human_approved_at` field in frontmatter (set by an explicit MCP tool call).
- **`completion_review_passed`** (if `codex_review.required`): transitioning to `completed` requires `codex_review.completion_status == passed`.
- **`siblings_present`**: doc cannot be `ready` or `active` without its required sibling docs in the same phase or completed.
- **`children_terminal`**: an Epic cannot transition to `completed` unless every child User Story and every grandchild Task is in `completed` or `cancelled`.

### 9.5 Spawn gates

Run on `spawn_agent` MCP call.

- **`doc_in_active_or_ready`**: cannot spawn an agent on a doc still in `discovery` or `design`.
- **`dependencies_completed`**: every doc in `depends_on` must be in `completed` (or `active` if explicitly allowed in workspace config).
- **`worktree_clean`**: target worktree path must not already host a different agent.
- **`platform_available`**: requested platform CLI is installed and authenticated.

## 10. Reporting Protocol

Child agents report up via Katana doc state, not via custom messages. The orchestrator inspects via `query_agent` and `read_document`.

**On completion**, a child agent:

1. Runs Codex completion review (if required) and resolves it.
2. Transitions its Epic to `completed`.
3. Opens a PR to the configured branch (project-config, e.g., `dc-phase-1`).
4. Writes a `completion_payload` to its agent record:

```json
{
  "epic_short_code": "KAT-E-0007",
  "pr_url": "https://github.com/...",
  "tests_summary": "142 passing, 0 failing",
  "audit_summary": "baseline updated, no regressions",
  "codex_review_summary": "LGTM after round 1",
  "open_questions": [],
  "follow_up_tasks_filed": ["KAT-T-2401", "KAT-T-2402"]
}
```

5. Calls `katana:report-to-orchestrator`.

**On block / question**, a child agent:

1. Transitions status to `waiting_for_orchestrator` via MCP.
2. Writes the question to its agent record.
3. Polls via `query_agent` for an answer.

The orchestrator inspects pending questions during its poll cycle. If it can answer from its own context (rare — orchestrator doesn't know task specifics), it sends `send_to_agent`. Otherwise it forwards to the human.

## 11. Implementation Plan

Five phases, each shippable and useful on its own.

### Phase 1 — Frontmatter + dependency graph (foundation)

- Extend `docs/schema/frontmatter.md` with `depends_on`, `blocks`, `execution`, `codex_review`, `siblings`.
- Extend `validate_document` to enforce the new fields per doc type.
- Build `compute_wave_plan` MCP tool against the existing in-memory doc graph.
- No agent spawning yet; output is consumable by humans (renders as `BATCHES.md`-style table).

**Exit:** `compute_wave_plan` returns a correct wave plan for a sample project with 5 Epics.

### Phase 2 — Single-agent spawning

- Build `spawn_agent`, `query_agent`, `list_active_agents`, `terminate_agent`.
- Subprocess-based for Claude Code (process management via `node:child_process`).
- Filesystem-backed agent state in `.katana/agents/<id>.json`.
- Worktree creation + per-worktree `.claude/settings.json` writing.

**Exit:** orchestration agent (manually written, opus + high) can spawn one child agent that completes an Epic end-to-end.

### Phase 3 — Multi-agent + wave execution

- Build `wait_for_agents`, `send_to_agent`.
- Build `katana:orchestrate-batch` skill.
- Wire `compute_wave_plan` output into `orchestrate-batch`.

**Exit:** orchestration agent runs a 3-Epic fan-out wave concurrently and reports completion summaries.

### Phase 4 — Formal gates

- Implement all gates in Section 9 as pluggable adapters under `src/mcp/gates/`.
- Wire pre-commit hook installer (the existing audit plugin pattern is the model).
- Codex review CLI wrapper as a gate adapter.

**Exit:** an Epic with `codex_review.required: true` can't transition to `completed` without a passed completion review; an Epic with a migration outside its range can't commit.

### Phase 5 — Sibling architecture docs + cross-platform agents

- Add typed sibling doc types (`epic-architecture`, `story-ui-hints`, etc.) to the document type registry.
- Extend `spawn_agent` to support Cursor / Codex-CLI / OpenAI-agent platforms (per-platform launcher modules).
- Build a migration command that converts a Metis workspace to Katana (initiatives → epics, etc.) — useful for migrating Metis projects.

**Exit:** a fresh project can choose Claude Code or Cursor per agent based on `execution.platform`; Metis migration is documented and tested.

## 12. Out of Scope

- **Cross-machine orchestration.** All children run on the orchestrator's host. Distributed orchestration is a separate effort.
- **GPU-pool model routing.** We assume one model = one API call; routing is by API key + model name.
- **Cost accounting.** Useful but separate; agents log token use, aggregation is downstream tooling.
- **Replacing the Ralph loop.** The per-task loop in `src/workflow/loop.ts` continues to run inside each child.

## 13. Open Questions

| Question | Owner | Notes |
|---|---|---|
| How exactly does `spawn_agent` start a Claude Code session non-interactively and inject the initial message? | implementation | Options: (a) `claude --print --model <m> < instructions.md`; (b) a wrapper script that writes initial message to stdin; (c) Anthropic SDK directly, bypassing the CLI. Probably (c) for cleanest control but loses Claude Code's hooks/MCP integration. |
| Does the orchestrator itself run inside Claude Code, or as a standalone Node process? | architecture | Probably a Claude Code session for HITL ergonomics. Means the orchestration agent is itself a child of the human's terminal session — recursion-friendly. |
| How do we prevent the orchestrator from running out of context window after many wave cycles? | runtime | Children report short summaries (Section 10), not full diffs. Orchestrator's compute_wave_plan output is structural. Should still budget ~80k tokens for an end-to-end 16-Epic project. |
| Codex CLI authentication in spawned worktrees | implementation | Codex CLI uses ambient `OPENAI_API_KEY`; should just work as long as the parent shell exports it. Document explicitly. |
| Recovery semantics if the orchestrator process dies mid-wave | runtime | All state is filesystem-persisted under `.katana/agents/`. A new orchestrator session can resume via `list_active_agents` and `wait_for_agents`. Document a resume flow. |
| HITL escalation surface | UX | When a child blocks on a question and the orchestrator forwards to human, where does the human see it? Probably the orchestrator's own terminal — but that's hidden if the human walked away. Consider a notification hook (existing pattern in NELP's hook config). |

## 14. Success Criteria

A Katana project with this extension is "done" enough to dogfood when:

- A `compute_wave_plan` call on a 10+ Epic product produces a correct wave plan in <1s.
- An orchestration agent spawns a 3-agent fan-out wave, waits for completion, and reports results without human intervention beyond initial approval.
- Pre-commit gates catch every Phase 1 NELP-style violation (protected-branch push, migration-range collision, lint-rule edit, DB mock in integration test) in a synthetic test repo.
- A Codex completion review failure on a required-review Epic correctly blocks the `completed` transition.
- The full NELP Phase 1 wave plan (16 Epics, 8 waves) can be modeled in Katana and executed by an orchestration agent — even if we don't actually run it, the plan must be representable and validatable end-to-end.

## 15. References

- `lessons-learned.md` (this directory) — sources for every design choice in this spec.
- `~/.claude/CLAUDE.md` — the global rules (rubric, protected branches, audit, lint/TS, etc.) we're codifying.
- NELP Phase 1 artifacts: `/Users/danielcassil/Code/nelp/agents/`, `/Users/danielcassil/Code/nelp/BATCHES.md`, `/Users/danielcassil/Code/nelp/agents/codex-review-protocol.md`.
- Existing Katana ADRs: `docs/adr/KAT-A-0001..KAT-A-0003.md`.
- Existing Katana surfaces: `src/mcp/tools/*`, `src/workflow/loop.ts`, `src/workflow/gate-adapter.ts`, `src/workflow/dispatcher.ts`.
