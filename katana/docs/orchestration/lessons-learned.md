# Multi-Agent Orchestration — Lessons Learned

Source: NELP Phase 1 (May 2026) — 16 initiatives, 17-day deadline, three concurrent agents at peak. The patterns, rules, and gates below were discovered or refined during that exercise and should inform Katana's orchestration design.

## 1. The Vision-to-Spec Iteration Path

We moved through six levels of granularity, each grounded in the level above and validated against external source-of-truth documents.

```
Project brief (.docx, customer-supplied)
  └─ Finalized architecture / schema / phase-1 MVP docs (.md, owner-authored)
       └─ Vision document (Metis, strategic, 6mo–2yr)
            └─ Initiatives / Epics (Metis, 1–6mo)
                 └─ User stories (in our case, embedded as sub-sections of initiatives)
                      └─ Tasks (Metis, 1–14d, decomposed on demand)
                           └─ Sub-tasks (subagent dispatches within a task)
```

**Key insight: every level must validate against both the level above AND against the canonical external docs.** The Metis initiative for "EPIC-09 Council Projects" referenced `schema.md`, `architecture.md`, `phase-1-mvp.md`, and the per-epic UI-HINTS file — not just the vision doc. Decisions in the initiative cite specific sections of those canonical docs (e.g. `phase-1-mvp.md §Per-Table Reconciliation`).

**The iteration loop we ran for every initiative:**

1. Read the next-level-up doc (vision for epics; epic for stories; story for tasks).
2. Read the relevant canonical source docs.
3. Draft the doc.
4. Cross-reference back: does every decision in the draft have a source? Does anything in the source contradict the draft?
5. Identify dependencies and conflicts with sibling docs at the same level.
6. Add "Alternatives Considered" with rejected options and rationale rooted in canonical sources.
7. Add "Operating Rules" section codifying cross-cutting constraints (branches, audit, lint, etc.).
8. Refine until alternatives, dependencies, and operating rules are exhaustive — not pad-with-filler.

This iteration produced 17 fully-populated initiative documents totalling ~80k tokens of structured planning before any code was written.

## 2. Document Hierarchy & Sibling Architecture Docs

Metis's document model had Vision → Initiative → Task. We supplemented it manually with:

- **External sibling docs**: `schema.md`, `architecture.md`, `phase-1-mvp.md`, `phase-1-mvp-technical-considerations.md`, `product.md`, `product-vision.md`. These were the canonical sources of truth that every initiative cited.
- **Per-epic UI-HINTS docs**: Sibling to each epic's README, naming exactly which `@right-peak/ui` components, recipes, hooks, and Tailwind utility patterns the epic's UI should consume.
- **Per-epic user-stories trees**: Sibling files under each epic for US-01..US-NN with story-level acceptance criteria and test obligations.
- **UI inventory and gap-list docs**: `ui-library-inventory.md` and `new-ui-components-needed.md` — cross-cutting, referenced by every UI-bearing initiative.

**The pain point:** Metis treats initiatives as single-file. All this sibling content lived in `Documentation/Architecture/Schema/finalized/planning/...` outside Metis, which means Metis tooling can't enforce that the initiative cites them or that the sibling content stays in sync.

**Implication for Katana:** every level (Epic, User Story, Task) should have explicit support for typed sibling documents — architecture spec, UI hints, schema deltas, test plan — with link integrity enforced.

## 3. The Model + Effort Rubric

We codified the following rubric in `~/.claude/CLAUDE.md` under "Metis Task Decomposition — Model & Effort Assignment". Every task created during decomposition MUST include a `Recommended Agent: <model> + <effort>` line.

| Tier | When to use |
|---|---|
| **opus + high** | Core architecture work: new patterns, initial groundwork that downstream depends on, complex multi-file refactors, schema design consumed by other tasks, RLS substrate, formula registries — anything where a wrong choice creates compounding rework. |
| **opus + medium** | Substantive but pattern-following: touches multiple files, needs reasoning across moderate context, integration work, non-trivial features fitting a known pattern. |
| **opus + low** | Small (1–2 files) but design-is-clear; the implementation is the only question. |
| **sonnet + medium** | Single-file changes / adds / focused edits where all reasoning choices are already defined in task notes — mechanical or follows a stated pattern. |
| **haiku + low** | Tool-driven changes: simple find/replace, copy-paste from clear example, mechanical refactors with no reasoning required, no cross-file invariants to preserve. |

**Hard rules around the rubric:**

- **Initiative decomposition itself is always `opus + high`** — getting the breakdown right is load-bearing; downgrading cascades errors across every downstream agent.
- **When in doubt between two tiers, choose the higher tier** — a task that turns out simpler is cheap; a task that turns out harder and was assigned to a weaker model produces compounding cleanup work.

**Codified per-level defaults in Katana already** (`.katana/workflow.json`):

```json
{
  "models": [
    { "level": "product-doc",    "tier": "strong" },
    { "level": "epic",           "tier": "strong" },
    { "level": "user-story",     "tier": "strong" },
    { "level": "task-high-pass", "pass": "high", "tier": "strong" },
    { "level": "task-low-pass",  "pass": "low",  "tier": "cheap" },
    { "level": "task-ui",        "tier": "ui" }
  ]
}
```

The Phase 1 rubric maps cleanly onto these tiers; `task-high-pass` ↔ opus, `task-low-pass` ↔ sonnet/haiku, `task-ui` ↔ frontend-tuned model. Katana's model-config already covers this.

## 4. The Wave / Concurrency Pattern

For NELP Phase 1 we produced an 8-wave parallel execution plan from the 16-initiative dependency graph. Each wave is either:

- **Fan-out wave** (Waves 0, 2, 3, 5) — multiple initiatives with disjoint surfaces; up to 3 agents run concurrently in isolated worktrees.
- **Single-author wave** (Waves 1, 4, 6, 7) — one keystone initiative; load-bearing for everything downstream; no concurrency.

**Single-author wave criteria** (codify these as Katana doc properties):

- The initiative defines a contract or schema that ≥3 downstream initiatives consume directly.
- The initiative edits a shared surface where concurrent edits would conflict (e.g., three live pages, formula registry, RLS substrate).
- The work is conceptually one author's call (e.g., snapshot supersession semantics).

**Fan-out wave criteria:**

- Surfaces are disjoint (different files, different tables, different routes).
- No shared mutable contract.
- Migration-number ranges are pre-claimed (no DB-migration race).

**Gates between waves:**

- Specific upstream initiatives in `completed` phase.
- CI gate green.
- Sometimes a coordination artifact landed (e.g., EPIC-10 must add `outcome_measures.hard_dollar_enabled` before Wave 5's NDNQI and Patient Experience agents start).

## 5. The Codex Review Pattern (dual-model collaboration)

For the highest-complexity initiatives (architecture keystones, contract definitions, schema substrate), we layered **Codex review** on top of Opus implementation. **Opus writes; Codex reviews; they negotiate; the human is the final arbiter.**

Two triggers, both mandatory for reviewed initiatives:

### Trigger A — Pre-commit (light, single round)

Before every `git commit`, after the audit plugin passes, run a lightweight Codex pass against the staged diff. Verdicts: `LGTM` / `FIX-AND-RETRY` / `BLOCK`. Output is transient (`.codex-precommit.md`, gitignored). Catches rule violations at minimum diff size.

### Trigger B — Initiative completion (heavy, multi-round negotiation)

Before transitioning the initiative phase to `completed`, run a full Codex review against the cumulative diff. Verdicts: `LGTM` / `ITERATE` / `BLOCK`. If `ITERATE`, Opus writes a response document (Accepted / Rejected with rationale / Deferred / Need clarification) and Codex runs Round 2. **Max 2 rounds; if no convergence, escalate to human.** Review artifacts commit alongside the PR.

**Critical constraints:**

- **Codex never writes code, never pushes commits, never edits Metis/Katana docs.** Read-only reviewer.
- **Rejected feedback must cite a canonical source.** "I'd name this differently" is not a valid review item; "this violates `phase-1-mvp.md §Per-Table Reconciliation`" is.
- **Round 3 is forbidden** — if two specialized models with full context can't converge, the call is human judgment.

This pattern works because:

- Opus's primary failure mode is over-confidence in a chosen approach; an independent reviewer with full canonical-doc context catches that.
- Codex's primary failure mode is over-prescribing alternatives; the "must cite canonical source" rule constrains it.
- The human is escalation-only, not constant baby-sitting — escalation triggers are mechanical (Round 2 verdict, BLOCK at any point).

## 6. The Per-Agent Instruction-Set Pattern

Every primary agent (one Claude session = one initiative in flight) gets a **self-contained markdown doc** at `agents/agent-NN-<name>.md`. The pattern:

```
# Agent NN — <Initiative Title> (Wave N)
## Mission           — what this instance is responsible for
## Setup             — worktree name, branch, model+effort, migration range
## Read first        — initiative + canonical docs + global rules + project memory
## Dependencies      — upstream / blocks / can-run-in-parallel-with
## Workflow          — decompose → check in with human → execute → open PR
## Codex review      — pre-commit + completion triggers (if applicable)
## Tools to use      — explicit MCP tools, skills, subagent dispatch guidance
## What you own      — single-owner files, tables, contracts
## Hard rules        — protected branches, migration range, lint, audit, dev-DB only, etc.
## End-of-job checklist
```

**Why this works:**

- An agent spinning up with zero conversation context can read one file and start.
- The same template applies to every initiative — only specifics differ.
- Cross-references between agent docs (upstream/blocks/parallel) form a machine-readable dependency graph.
- The human doesn't need to remember 16 instances' worth of context — each agent self-describes.

**Implication for Katana:** instruction-set docs should be generated automatically from the epic/story/task + dependency graph + canonical-doc references. The orchestration agent should never need to read or write these — only spawn agents pointing to them.

## 7. Cross-Cutting Conflict-Management Patterns

When multiple agents work concurrently in the same repo, the constants of git, DB migrations, and shared files create natural choke points. We codified the following patterns:

### Migration-number ranges

Each agent claims a pre-allocated range (e.g., 0010–0029 for EPIC-01, 0030–0049 for EPIC-02, etc.) before writing any migration. No agent can write a migration outside its range. Eliminates DB-migration collisions.

### Single-owner files

For files that semantically belong to one initiative (e.g., `packages/ui/src/components/*` owned by UI Scaffolding, three live pages owned by Dashboards), the agent doc names it as "what you own" and downstream agents are told to only consume by import — never edit. Eliminates merge churn.

### Named coordination points

Where two parallel agents both need the same field/column/file, the agent docs explicitly name where the ownership lives (e.g., "the `hard_dollar_enabled` column should land in EPIC-10, NOT in EPIC-11 or EPIC-13"). One place adds it; both consume.

### Bridge code marking

Every code site that exists only because of a pre-existing-schema accommodation carries a `TODO(phase-1-bridge:<area>)` comment with the canonical target and convergence step. This makes the bridge surface greppable as a single inventory and prevents bridge code from being indistinguishable from canonical code.

### "Disjoint surface" verification

Before scheduling two initiatives in parallel, verify that their owned tables, files, and APIs do not overlap. If they overlap, either:

- Sequence them (one before the other), or
- Promote the shared surface to a separate initiative that runs first.

## 8. Global Rules We Added (and where they live)

### `~/.claude/CLAUDE.md` (global, all projects)

- **Plan Mode** — disabled in projects with `.metis/` (or `.katana/`). Use the project's doc system.
- **Code Quality (Audit Plugin)** — audit must be green before every commit. Update baseline if scores improved; fix regressions before committing.
- **Metis Workflow** — once Metis is initialized, all work tracks in Metis docs (parallel rule applies to Katana).
- **Metis Document Completeness** — initiatives, tasks, vision, ADRs must be fully populated; no TBD, no placeholders, no one-line stubs.
- **Protected Branches & Deployments** — `main` and `staging` are read-only to the agent. Vercel / Supabase deploys require explicit per-action approval; one-time approval is not blanket approval.
- **Metis Task Decomposition — Model & Effort Assignment** — the rubric (Section 3 above). Decomposition itself is always opus + high.
- **Lint & Type Rules** — agents can't edit ESLint or TypeScript rules without permission. No `any` / `unknown` casts / `ts-ignore` / inline disables as workarounds.

### Per-project (Metis initiative "Operating Rules" sections)

- Migration-number range claim.
- Supabase ref (dev only, never staging/prod).
- Branch target (Phase 1: PRs to `dc-phase-1`, not `staging` or `main`).
- Bridge-code marking convention.
- Integration tests don't mock the DB.
- Initiative-level HITL: check in with human before transitioning to `active` or making architectural decisions.

### Per-agent instruction set (in `agents/agent-NN-*.md`)

- The hard-rules sections in each agent doc repeat the global rules so a fresh agent reading just its own doc gets everything it needs.
- Initiative-specific additions: what you own, what to avoid (e.g., "no PDF export — out of scope"), Codex review obligation.

## 9. Patterns That Should Become Formal Gates in Katana

Many of the rules above are currently enforced by **convention** — agents read them in CLAUDE.md or their instruction-set doc and follow them. They should be enforced by **the platform** to remove convention-drift.

Candidates for formal gates (the MCP / phase-machine should reject or warn):

| Pattern | Where to enforce |
|---|---|
| Decomposition produces tasks with `recommended_agent` line | `decompose_document` MCP tool — reject if missing |
| Task templates fully populated, no `{placeholder}` | `validate_document` MCP tool — reject on placeholder match |
| Migration in the claimed range | Pre-commit hook reading doc frontmatter `migration_range` |
| Protected branch push prevention | Pre-commit hook reading global config |
| Audit plugin green | Pre-commit hook (already exists in NELP) |
| Codex review for high-tier initiatives | `transition_phase` to `completed` requires `codex_review_status: passed` in frontmatter |
| Initiative-level HITL approval | `transition_phase` from `discovery`→`active` requires explicit human flag |
| Lint/TS rule edits | Pre-commit hook reading the ESLint/TS config diff |
| Integration tests don't mock DB | Lint rule (existing) or pre-commit grep |
| Bridge-code TODO comments present | Pre-commit grep on bridge-flagged file paths |

These become **gate adapters** that plug into Katana's existing gate engine (`src/workflow/gate-adapter.ts`).

## 10. What We Did Manually That Should Be Automated

The manual NELP Phase 1 process produced these artifacts by hand. The orchestration spec should automate them.

| Artifact | Where it came from | Automation target |
|---|---|---|
| Per-initiative "Parallel Execution & Sequencing Notes" section | Hand-written into 16 Metis initiatives | Computed from the doc dependency graph + the canonical "single-author vs fan-out" criteria |
| `agents/agent-NN-*.md` instruction-set docs | Hand-written, ~100 lines each | Generated from epic + dependencies + canonical-doc references + global rules |
| `BATCHES.md` wave plan | Hand-written | Computed by `katana plan-waves` (or an MCP tool) |
| Migration-number range allocation | Manually claimed in each agent doc | Generated by Katana, written to doc frontmatter, enforced by gate |
| Codex review invocation | Manual `codex exec` from the agent | Built into the gate engine; phase-machine calls it automatically on commit / completion |
| Spinning up 16 terminals manually | Tedious; humans forget which batch is next | Replaced by orchestration agent + `spawn_agent` MCP tool |

The next document in this directory, `spec-multi-agent-orchestration.md`, proposes a comprehensive implementation plan for the automation.
