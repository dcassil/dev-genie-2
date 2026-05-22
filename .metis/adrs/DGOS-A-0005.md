---
id: 001-loop-execution-substrate-out-of
level: adr
title: "Loop Execution Substrate: Out-of-Process Supervisor and Pluggable Agent Transport"
number: 1
short_code: "DGOS-A-0005"
created_at: 2026-05-22T16:56:22.459378+00:00
updated_at: 2026-05-22T17:36:38.740593+00:00
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

# ADR-5: Loop Execution Substrate: Out-of-Process Supervisor and Pluggable Agent Transport

## Context

ADR-3 decided the *contract* for execution: one recursive govern-verify Loop with leaf nodes (edit + locally validate) and inner nodes (govern + authoritatively validate), with `done` / `needs-decision` / `failed` return semantics. ADR-1 named the Loop primitive and required that a Loop be *"reconstructable from durable state after process loss."* ADR-3 explicitly deferred *"worker transport, or adapter technology."* ADR-4 defined the per-domain autonomy profile that gates ask-versus-proceed.

What none of these decided is **where the Loop actually runs as a process**. The unstated-but-natural reading is that the Loop runs *inside an agent's context* — an orchestrator agent that spawns sub-agents, tracks task state in its own conversation, and reasons across the whole run. Field experience on a real long-running autonomous project demonstrated that this reading fails, and fails expensively:

- An orchestrator agent driving dozens of sequential sub-agent tasks **fills its own context window quickly**, because every task, decision, and sub-agent result accretes in one conversation.
- Adding a third agent layer (a parent agent that restarts orchestrators from a handoff doc when context nears capacity) **increased per-task wall-clock from 5–20 min to 50–120 min** and still **failed to handle stuck sub-agents, errors, and permission requests** reliably.
- The core defect is structural: an agent was made the *durable* unit of a long-running loop, but agents have bounded context and non-deterministic control flow. Durability and bounded-context are in direct tension when the loop lives in a conversation.

The same project surfaced the shape of the missing piece: a **deterministic, non-agent process** that owns the durable loop, drives agents from the outside, distinguishes an agent that is *working/logging* from one that is *paused awaiting a decision/permission/answer*, applies cheap static policy first, spends a small bounded model call only at genuine decision points, and escalates to a human only on hard blocks. That process must be usable as a standalone tool **and** drop cleanly into the dev-genie Engine/Role/Loop architecture without a fork.

We need to decide the Loop's execution substrate: the process model, the agent transport, the work-source coupling, and the state-ownership boundary that keeps it durable, testable, and standalone-capable.

## Decision

The recursive govern-verify Loop runs as an **out-of-process deterministic supervisor** — an ordinary OS process (the "Supervisor"), not an in-context agent. Agents become **disposable workers** the Supervisor spawns, drives, and recycles. The Supervisor is built as a **ports-and-adapters (hexagonal) core** so that the same core is a standalone tool and the dev-genie integration substrate.

### Process model

- The Supervisor is plain, deterministic code. Its "memory" is **durable state on disk**, not a conversation, so it never fills a context window and is reconstructable after process loss (satisfying ADR-1's Loop requirement directly).
- It realizes ADR-3's node tree: it is the durable owner of the root inner node and all inner-node governance. **Leaf and inner nodes are disposable agent sessions** spawned per unit of work and recycled. No agent is the durable unit; the process is.
- The Supervisor consumes the structured result stream of each agent session and acts only on explicit turn boundaries and explicit pause events. It does not reverse-engineer "is it done?" from prose or terminal redraws when a structured transport is available.

### Three ports (hexagonal core)

The Supervisor core depends only on three interfaces; concrete systems are adapters behind them:

1. **AgentTransport** — how to spawn and drive an agent. The Supervisor speaks an event/command vocabulary: events `turn_ended`, `needs_permission`, `needs_input`, `log` (the agent is making progress — narration, tool output), `exited`, and a transport-derived `stalled` signal (distinct from `log`: no progress for a configurable interval); commands `respond`, `approve`, `deny`, `choose_option`, `interrupt`, `resume`. **`log` and `stalled` are deliberately separate events** — collapsing "the agent is narrating" and "the agent is idle" into one signal would reintroduce the working-vs-paused ambiguity this ADR exists to remove. The port contract (specified in DGOS-I-0011, not here) MUST define, for each event: its **payload** (e.g. `needs_permission` carries tool name, arguments, and a `correlationId`), the **correlation model** (every `respond`/`approve`/`deny`/`choose_option` references the `correlationId` of the pending event it answers), **ordering/async guarantees**, and **hang semantics** (what interval and what missing-progress condition raises `stalled`, and how `interrupt` is expected to be honored). Without these specified, the port cannot be faked deterministically. The **primary adapter is the Claude Agent SDK** (streaming I/O; `result` message as the unambiguous turn-end signal; `canUseTool` for permission events; `PreToolUse` hooks for deterministic in-band allow/deny; `interrupt()`/`AbortController` for hang control; `resume`-by-session-id for handoff). **Open SDK assumption to pin first:** whether a *sub-agent's* (Task-spawned) tool-permission requests reliably surface to the parent session's `canUseTool`/hooks is version-dependent and historically inconsistent; ADR-3's recursion depends on it, so DGOS-I-0011's first spike MUST verify this against a pinned SDK version. If it does not hold, the recursive `needs_permission` event degrades and that case must fall back to PTY-style detection. A **PTY adapter** (drive any terminal agent by parsing output and sending keystrokes) is a planned secondary adapter; the Supervisor core MUST NOT depend on either concretely.
2. **WorkSource** — authority over **task definition + status**. Surface: `listTasks()` (returns tasks with status and a revision/etag), `getTask(id)`, `markStatus(id, status, evidence)`, and `createTask(spec, parentId?)` returning a new ID. The create operation is required, not optional: ADR-3 mandates that an inner node, when a routed decision is "large," **creates a follow-up work item** rather than patching in place — so the substrate must be able to write a new task back into the authoritative WorkSource (see "Decision actions" below). Status is a lowest-common-denominator **task-definition** set: `todo | active | done | blocked`. `needs-decision` is deliberately **excluded** — a task being mid-decision is Supervisor execution state, not WorkSource truth, so it lives in the execution store, not the WorkSource status (preserving the state-ownership boundary). Each adapter MUST define a **bidirectional** mapping between its native states and this LCD set — not just the write direction. **katana** (rich; maps `done` onto phase/gate transitions and supplies decomposition, ownership surfaces, gates, and must map its multiple non-done phases *back* to `todo|active|blocked` on read), **metis** (maps onto/from task phases), **markdown checklist** (toggles `- [ ]` ↔ `- [x]`; the zero-dependency floor that ships in core), and **JSON**. The markdown floor guarantees genuine standalone operation with no external system. Adapters whose native model cannot express a follow-up create (e.g. an append-only markdown plan) satisfy `createTask` by appending; the contract is "the new task becomes visible to the next `listTasks`," not any particular richness.
3. **DecisionProvider** — how a judgment is produced. It serves **two mechanically distinct decision surfaces** that the tiers handle differently; conflating them is a known leak risk:
   - **Permission-gating** — "may this agent run this tool/action?" In the SDK transport these arrive as discrete events (`canUseTool` / `PreToolUse`) carrying a tool name and arguments. They are resolvable by deterministic rules with **no model call**.
   - **Decision-routing** — "which of these design/product/scope options is correct?" These are ADR-3 `needs-decision` content bubbles. They are **not** tool-permission events and never surface as `PreToolUse`; they require judgment, not a rule about a tool name.

   The tiers (matching ADR-3 routing and ADR-4 gating):
   - **Tier 0 — deterministic policy (Engine):** a Decision Policy Engine (DGOS-I-0009) evaluated against the autonomy profile (ADR-4) and static allow/deny rules. Runs in-process, no model call. For the **permission** surface this is expressed largely as `PreToolUse` hooks/`canUseTool` returns. For the **decision-routing** surface it covers only cases a static rule can settle (e.g. "this decision domain is `delegate` and the change is local → proceed"); most routing decisions fall through to Tier 1. (Note: Tier 0 spends no *additional* model tokens, but the agent context that produced the underlying tool call or bubble is not itself free — Tier 0 is zero-*decision*-cost, not zero-run-cost.)
   - **Tier 1 — bounded Role call:** a single fresh-context model call (a Role per ADR-1, DGOS-I-0010) given a *small fixed payload* `{context, rules, request}`. It returns a **DecisionVerdict** — the on-the-wire decision payload `{ type: "decision" | "access" | "human", suggested_choice, suggested_response, confidence: 0-10, risk: 0-10, block_trigger: bool }`. This verdict is a *distinct, minimal type*, not ADR-1's full Role-result schema; the DecisionProvider adapter is responsible for mapping it to/from ADR-1's canonical Role output (`produced/skipped/blocked/needs_human` with `confidence`, `missing_context`, `human_review_required`) and for emitting the durable `DecisionRecord` ADR-3's sideways channel expects. No tools, no filesystem — fast, cheap, deterministic harness.
   - **Tier 2 — investigating Role:** only when Tier 1 returns low `confidence` or high `risk`, an ephemeral read-only agent investigates relevant files/state before returning the same `DecisionVerdict` shape. Tier 2 therefore **uses the AgentTransport port** to spawn its read-only worker; this is an explicit, allowed cross-port dependency (DecisionProvider → AgentTransport) and the only one — it must be named in the port contracts so the SDK transport does not leak into the DecisionProvider abstraction by accident.
   - **Tier 3 — human:** when policy or the verdict's `block_trigger`/`risk`/`confidence` crosses the autonomy-profile threshold, the Supervisor parks the run in an `awaiting_human` state and notifies via a pluggable notifier (console floor; email/push later).

   **Decision actions (ADR-3 sideways channel).** Producing a verdict is not the end; ADR-3 requires the inner node to then act. The Supervisor applies the verdict via one of: **patch-and-resume** (write a task patch to the affected leaf and resume it — execution-store + targeted WorkSource `markStatus`/patch), or **create-follow-up** (when the decision is large, call `WorkSource.createTask` to seed new authoritative work). Which action is taken is itself policy-gated (a "large" decision past the autonomy threshold may additionally require Tier 3 sign-off before `createTask`).

### Capability adapters: standalone built-ins vs injected Engines/Roles

The Supervisor (package name **`daimyo`**) consumes deterministic Engines (Decision Policy, Validation, Repo Intelligence, Context) and Roles (Planner, Architect, …), but it **does not own them**. They are also used during init, planning, and architecture — *before* `daimyo` ever runs — so ownership inside the Supervisor would force the execution runtime to exist before you can plan, which is backwards. They live in their own packages (or are exposed by the package that already owns them), and `daimyo` is merely one consumer.

To keep `daimyo` genuinely standalone, each consumed capability is a **port with a trivial built-in shipped in `daimyo`**, swappable for a richer **injected adapter** that dev-genie supplies. Crucially, the trivial built-ins reduce to **two engine primitives `daimyo` already needs**: a *bounded structured-model-call client* (`{context, request} → typed JSON`) and a *shell runner* (run a declared command, check exit code). No Engine/Role package is a hard dependency of the `daimyo` core.

| Capability (port) | Standalone trivial built-in | dev-genie injected adapter | Required? |
|---|---|---|---|
| **DecisionProvider** | Tier 0: tiny static allow/deny + autonomy config; Tier 1: bounded model call → `DecisionVerdict`; Tier 3: human | Decision Policy Engine + ADR-4 autonomy profile + versioned Role prompts | **Required**, always satisfiable (worst case: unknown decision → ask human) |
| **Validation** | Run the task's declared command (lint/test/build) + exit code; if none, model call → `{pass, fail, reasons}` acceptance check | Validation Engine wrapping audit composite scores + guardrails lint/type gates + baselines | **Required** — it *is* ADR-3's "parent verifies, never self-assertion" invariant; trivially satisfiable |
| **Repo Intelligence** | None / on-demand: a worker (or Tier-2 agent) reads files live when a decision needs it | Repo Intelligence Engine (indexed facts, ownership surfaces) | **Optional** — absence only makes decisions less informed |
| **Context** | Task text + its declared files + basic file read | Context Engine (per-Role context profiles) | **Optional** — trivial assembly always available |
| **Roles (planning)** | Goal-only mode: bundled "decompose goal → tasks" prompt; otherwise plan comes from the WorkSource | Versioned Planner/Architect Roles with context profiles | **Optional** — unneeded when a plan already exists |

Only **DecisionProvider** and **Validation** are conceptually required, and only because the loop's invariants depend on them (somewhere for `needs-decision` to go; a parent verifier so completion is not self-asserted). Both are satisfied by trivial built-ins. Everything else is enrichment; the Tier-2 investigating agent partially substitutes for Repo Intelligence by reading files live.

### State-ownership boundary (resolves the sync problem)

Two state categories are kept strictly separate so there is no two-way sync:

- **Task definition + status** lives *only* in the WorkSource and is mutated **in place** through `markStatus`. The Supervisor keeps **no authoritative copy**, so there is nothing to mirror or reconcile.
- **Execution / loop state** (per-node status, `DecisionRecord`s, retry counts, transport session IDs, resume tokens, the execution cursor) lives *only* in the Supervisor's own durable store (e.g. `.supervisor/` as jsonl or sqlite), keyed by task ID.

External changes to the plan (tasks added, removed, edited, or marked done by a human in katana/metis/the md file) are handled by **read + diff-by-ID at checkpoints** (before selecting the next task, after a wave completes), not by continuous mirroring: new ID → schedule a node; missing ID → cancel its node; changed acceptance/deps → mark the node stale and re-run/re-validate; externally completed → drop from queue. For v1 this is last-read-wins at checkpoints with no locking; the WorkSource revision/etag is available for optional optimistic-concurrency later.

The one case that needs explicit handling is a task that is **mid-execution** (a worker is actively running it) when the external diff says it was deleted or its acceptance changed. Rule: the diff does not silently mutate an in-flight node — it issues `interrupt` to the worker via AgentTransport, marks the node `superseded` in the execution store, and records what work product (if any) the interrupted worker had already produced so a human or a re-run can decide its fate. Already-merged work product from a prior run of a now-stale task is **not** auto-reverted; the node is re-queued and its parent's authoritative validation (ADR-3) is responsible for catching inconsistency. v1 does not attempt automatic rollback of merged work.

### Packaging

The Supervisor ships as a **new top-level sibling plugin named `daimyo`**, alongside `katana/`, `guardrails/`, `audit/`, and `dev-genie/`. It owns the Loop primitive — the one runtime primitive with no package home until now (katana owns documents, dev-genie owns install, guardrails/audit own deterministic checks; none should absorb a long-running stateful process). `daimyo` mirrors katana's structure (npm package + `bin/` + optional MCP server + committed `dist/`), and dev-genie's orchestration registry gains one new entry to install it. It depends on its sibling packages **only through port adapters**, never as hard imports.

`daimyo` ships as a **standalone package** (core + SDK transport + markdown/JSON WorkSource + bundled-prompt DecisionProvider + command-runner Validation + console notifier). To be genuinely standalone past Tier 0, the package **ships its own minimal, versioned Tier-1 Role prompt** (per ADR-1's "versioned prompt and artifact contract") so the bounded decision call works with only a model API key and no dev-genie present; absent that prompt a deployment degrades to Tier 0 + Tier 3 (deterministic policy + human) only. **dev-genie depends on this package** and supplies richer adapters (katana WorkSource, the real Decision Policy Engine + autonomy profile as DecisionProvider, its own stronger Role prompts, richer notifiers). dev-genie does not absorb the core; the port boundary is what makes it simultaneously standalone and integrated.

## Alternatives Analysis

| Option | Pros | Cons | Risk Level | Implementation Cost |
|--------|------|------|------------|-------------------|
| In-context orchestrator agent owns the loop (status quo / natural reading of ADR-3) | No new process or transport to build; cross-task reasoning stays in one agent | Context-fill kills long runs; non-deterministic control flow; poor handling of stuck agents/errors/permissions; not reconstructable after loss | High | Low upfront, very high operational |
| Multi-layer agents (parent restarts orchestrator from handoff docs) | Keeps everything inside agents; no non-agent code | Empirically 3–6× slower per task; still fails stuck/error/permission handling; handoff fragility; durability still bounded by context | High | Medium, with poor payoff |
| Out-of-process supervisor, single hard-wired transport + work system (e.g. SDK + katana only) | Simplest to build; one code path | Couples the durable Loop to katana's schema; not standalone; not reusable; vendor-locked to one agent transport | Medium | Medium |
| Out-of-process supervisor, hexagonal core with AgentTransport + WorkSource + DecisionProvider ports | Durable by construction; standalone and dev-genie-integrated from one core; testable against fakes; vendor- and work-system-agnostic; tiered cost control | Three port contracts to design well; SDK adapter first means non-Claude agents wait for the PTY adapter; thin abstractions can leak | Low | Medium-High |

## Rationale

The hexagonal out-of-process supervisor is the smallest design that simultaneously fixes the observed failure and honors the existing ADRs.

It fixes the failure at the root: durability and bounded-context stop fighting because the durable unit becomes deterministic code with on-disk state, while agents become disposable and short-lived. Context-fill ceases to be a loop-level concern; it degrades to "recycle this worker," which the Supervisor already does between nodes.

It honors ADR-1 (Loop must be reconstructable from durable state — now true by construction), ADR-3 (the recursive node tree is preserved; the Supervisor *is* the durable root inner node and the deferred "worker transport/adapter technology" is exactly what this ADR supplies), ADR-4 (the autonomy profile is the Tier-0/Tier-3 threshold), and the Engine/Role/Loop split (deterministic policy = Engine, the bounded decision call = Role, the supervisor = Loop).

The three-port boundary is what makes "standalone tool" and "dev-genie substrate" the same artifact rather than a fork. The state-ownership rule (WorkSource owns task data, Supervisor owns execution state, reconcile by diff-by-ID) removes the sync overhead that would otherwise make multi-work-system support impractical. The tiered DecisionProvider gives a zero-token common path and reserves model spend (and human attention) for genuine uncertainty, which is the original cost and latency complaint.

The SDK adapter is chosen as the first transport because it eliminates the most dangerous component of the naive design — distinguishing "logging" from "paused" — by turning pauses into explicit, structured events, and because it natively exposes permission, hook, interrupt, and resume primitives the Supervisor needs. The PTY adapter is deferred, not abandoned: the port exists so it can be added without touching the core when a non-SDK agent must be driven.

## Consequences

### Positive
- Long autonomous runs survive indefinitely; durability no longer competes with context budget.
- Stuck agents, errors, and permission requests are first-class, observable transport events with explicit handling (interrupt/timeout, `failed` routing, `canUseTool`/hooks) rather than emergent agent behavior.
- Decision cost is controlled by construction: most decisions cost zero tokens (Tier 0), model spend is a small fixed payload (Tier 1), and humans are interrupted only past an explicit threshold (Tier 3).
- The same core is a standalone tool and the dev-genie Loop substrate; no fork, and the core is unit-testable against fake adapters with no real agent or terminal.
- No task-data sync problem: one authoritative copy per task, mutated in place; external plan edits handled by cheap diff-by-ID.
- Vendor- and work-system-agnostic by design; new agents (PTY, future SDKs) and new work systems are added as adapters.

### Negative
- Three port contracts must be designed carefully; an under-specified abstraction (especially modeling PTY's fuzzy "maybe idle" alongside the SDK's crisp events) will leak and require rework.
- First release drives only Claude (SDK adapter); non-Claude agents wait on the PTY adapter, so "agent-agnostic" is a near-term promise, not a v1 fact.
- A new durable execution-state store and its resume/recovery semantics must be built and tested independently of Role reasoning quality.
- Tier thresholds (confidence/risk/`block_trigger` vs. autonomy profile) require tuning; mis-tuned thresholds either over-ask the human or over-act autonomously.
- Durability is asymmetric across a process loss: the Supervisor's own execution state always survives (it is on disk), but an in-flight *agent session* it was resuming may not, because SDK `resume`-by-session-id is subject to server-side retention windows and version compatibility. When a resume token is no longer valid, the affected worker must be **restarted from its task definition + accumulated evidence rather than resumed** — the run survives, but that node loses its in-progress conversation.

### Neutral
- This ADR does not fix the execution-state persistence format (jsonl vs sqlite) or the exact `.supervisor/` layout; those are implementation choices under DGOS-I-0011.
- This ADR does not change ADR-3's decomposition/validation model; it provides the runtime that executes it.
- The package name (`daimyo`) and placement (new top-level sibling plugin owning the Loop primitive) are decided here. Release/versioning cadence relative to the other dev-genie plugins, and whether `daimyo` is published to a public registry vs. consumed only from this repo, remain for the Platform Packaging initiative (DGOS-I-0004).
- Continuous file-watching of the WorkSource (instead of checkpoint diff) remains a possible later option; v1 uses checkpoint reconciliation.
- **Worker session model (clarified post-DGOS-T-0001, 2026-05-22):** the Supervisor spawns **each leaf/inner node as its own top-level agent session** — recursion lives in the deterministic Supervisor process, not in nested SDK `Task` sub-agents. The DGOS-T-0001 spike found the SDK surfaces structured `needs_permission` events for direct + 1-level sub-agent calls but **not** for ≥2 nested sub-agents; the top-level-session-per-node model means every node gets depth-0 permission events, so this limitation does not bite and **no PTY fallback is required for v1**. The PTY adapter remains a future port-level option for non-SDK agents, not a workaround for nested permissions.

## Review Schedule

### Review Triggers
- A second agent transport (PTY or a non-Claude SDK) is implemented and the AgentTransport port proves too SDK-shaped to fit it without modification.
- The checkpoint diff-by-ID reconciliation proves insufficient (e.g. mid-flight human/Supervisor conflicts on the same task occur often enough to need locking/optimistic concurrency).
- Tier-1 bounded Role calls prove too context-starved to make good decisions, forcing a re-balancing of how much state the Supervisor injects.

### Scheduled Review
- **Next Review Date**: After DGOS-I-0011's first end-to-end autonomous run on a real multi-task plan (Protocol Proof MVP, DGOS-I-0013).
- **Review Criteria**: Did a long run complete without context-fill failure? Were stuck/error/permission events handled deterministically? What fraction of decisions resolved at Tier 0 vs 1 vs 2 vs 3, and was per-task latency back in the 5–20 min range?
- **Sunset Date**: Not a temporary decision; no sunset. Reviewed against the criteria above rather than expired.