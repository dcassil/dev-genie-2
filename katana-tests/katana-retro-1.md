# Katana Retro #1

Field feedback from driving an agent through a full build (Vite + TS
tic-tac-toe) using the Katana document tree. Source: `resume.md` "Katana
Plugin Findings". This doc captures the open questions; it is the input to a
deep dive of the dev-genie Metis initiatives to decide what Katana should own
vs. offload.

Status: **draft / discussion** — nothing decided yet.

---

## Category A — Real bugs (defects)

### A1. Placeholder `scaffold_task` leaked into low-pass docs
Low-pass docs contained unresolved reference tokens like
`@HIGH_PASS_KAT-US-0003@`. Decomposition's template substitution did not
resolve the high-pass reference.

- Open questions:
  - Is the high-pass doc created/linked *before* the low-pass is generated?
  - Does substitution silently no-op when the referent is missing?
- Impact: actively misleads an agent reading the low-pass doc.

### A2. `exit_criteria_met` stays `false` after completion
The field never flips to `true` even once a doc is `completed`.

- Open questions:
  - Is the field ever written to (dead/aspirational field), or is the
    completion transition supposed to compute it and doesn't?
- Impact: a field that is always `false` implies a check that isn't
  happening — worse than having no field.

---

## Category B — Design tensions (judgment calls, not bugs)

### B1. Verbose, one-step-at-a-time phase transitions
Walking a doc todo→active→…→completed takes one tool call per step. Forward-
only single-step transitions are a correctness/auditability feature, but the
agent often already knows the destination phase.

- Options:
  - "transition to phase X" that walks intermediate steps server-side.
  - Accept as the cost of an auditable lifecycle.
- Classification: UX-vs-rigor tradeoff.

### B2. High-pass / low-pass split is overhead for tiny tasks
The split (public API/board model first, implementation second) pays off when
*different agents* handle each pass. For one agent doing both in a single
session it is pure ceremony.

- Option: make the split optional / size-driven at decompose time rather than
  always-on.

---

## Category C — Missing capabilities (highest interest)

### C1. No write-back of progress / verification evidence
The agent ran real verification (typecheck, build, game-core scenario checks,
headless browser smoke) and **none of it landed in the Katana docs**. Docs
read "completed" but carry no evidence.

- This is the difference between Katana being a *checklist* and being a
  *record*. Metis docs accumulate working notes; Katana docs apparently don't.
- Weighted highest of all findings.

### C2. Validation is structural-only
Validation checks document shape, not whether acceptance criteria were met by
the code.

- Probably correct to keep validation structural (it can't run your tests).
- Pairs with C1: if evidence were written back, validation could at least
  check that *evidence exists* for each acceptance criterion.

---

## Cross-cutting theme

C1 (write-back) and A2 (`exit_criteria_met`) share one root cause: **Katana
docs are write-once scaffolding, not living records.** This likely intersects
the dev-genie "Artifact Protocol / Document Engine" (DGOS-I-0002) and
"Validation Engine" (DGOS-I-0007) initiatives.

B1 and B2 are more cosmetic / lifecycle-ceremony issues.

---

## Deep-dive synthesis (against Metis + ADRs as source of truth)

Read: DGOS-V-0001 (vision), DGOS-A-0001 (Engine/Role/Loop split), DGOS-A-0002
(Role invocation), DGOS-I-0002/0003/0005/0007/0009/0028.

### Key realization

The vision *describes* Katana as the "workflow kernel" that owns documents,
phase machines, gates, board, MCP tools, adapters, task execution loops,
orchestration loops, context loading, and validation routing. But ADR-0001 and
the Engine/Role/Loop initiatives **systematically pull most of that ownership
back out of Katana** into separate primitives. ADR-0001 is explicit: the old
"one package owns everything" model produces weak contracts — which is exactly
what this retro hit.

**Most retro pain points are not Katana bugs to fix in place. They are
capabilities the dev-genie architecture already plans to move out of Katana.**
The retro is empirical confirmation that Katana's thin, monolithic versions of
these jobs are inadequate, and it tells us *which downstream plugin/primitive*
must hedge against each one.

### Finding → owner mapping

| Finding | Root cause in today's Katana | Where dev-genie puts it | Owner primitive / initiative |
|---|---|---|---|
| C1 no write-back / no evidence | Docs write-once; no execution loop writes records | `ExecutionRecord` artifact + Developer Execution Loop writes outcomes back | Document Engine (I-0002) + Work Loop (I-0005) |
| A2 `exit_criteria_met` always false | Completion is *asserted*, never *computed* | Validation gates (not agent promises) decide completion → `ValidationReport` drives the gate | Validation Engine (I-0007) |
| C2 structural validation only | Katana validates doc *shape* only | Validation matrix runs lint/type/test/build/audit per artifact type | Validation Engine (I-0007) |
| B2 high/low-pass overhead | Decomposition strategy hardcoded in the kernel | Declarative, size-driven strategy recipe with capability/contract-boundary decomposition as the default and pass splits only when they reduce coupling | Strategy Engine (I-0003) |
| B1 verbose phase transitions | No orchestrator — the agent walked phases manually | The recursive govern-verify loop drives routing/phases | Recursive loop root node (collapses I-0005/I-0009/I-0028); phase machine itself stays Katana |
| A1 placeholder leak (`@HIGH_PASS_…@`) | Decomposition substitution bug | Genuine Katana / Document Engine kernel bug | Katana kernel / I-0002 |

### Katana's correct scope (per Metis source of truth)

Katana stays **standalone-usable but document-scoped**. It is the document
tool: create documents, provide search/CRUD tools, provide templates, own the
phase machine and board, own short codes / frontmatter schema, and own
platform adapters. Each other plugin is likewise independently usable, but
**no single plugin runs the complete workflow.**

Katana **offloads**:
- Strategy / recipe selection, including whether work should split by capability boundary or by pass-oriented stories in the rare cases where that is cleaner → Strategy Engine (I-0003)
- Real validation + the success/complete decision → Validation Engine (I-0007)
- Execution evidence / write-back → recursive loop leaf + `ExecutionRecord` (I-0005, I-0002)
- "What to do next" routing and the larger orchestration → the recursive govern-verify loop (I-0028, collapsing I-0005/I-0009)
- Guardrails / architecture constraints → Guardrails Engine
- Quality scoring / regression blocking → Audit Engine

Katana **keeps**: document storage, short codes, frontmatter/schema, board,
phase machine, MCP CRUD/search/transition tools, templates, platform adapters.

### Two timelines

1. **Architecture-level (not yet built):** C1, C2, A2, B2, B1 are evidence and
   concrete test cases for initiatives still in `discovery`. They don't change
   *what* to build much, but they back specific design choices with a real
   failure story (C1→ExecutionRecord, A2/C2→ValidationReport, B2→recipe
   sizing). These get folded into the relevant Metis initiatives/ADRs as
   "things to hedge against when decomposing."

2. **Katana-standalone (exists now):** Per the vision constraint *"keep Katana
   standalone and usable without dev-genie,"* two findings are real bugs in
   today's kernel, fixable independent of the buildout: **A1** (placeholder
   leak) and **B1 ergonomics** (a "transition to phase X" helper that walks
   intermediate steps). These are the only near-term Katana code changes.

---

## Simplified target workflow (resolved direction)

This is the simplified, stronger pattern agreed during the retro. It is the
intended end state and supersedes any older framing in the Metis docs that
treats orchestration, the developer loop, and wave execution as separate
unrelated loops, or that lets an executing agent self-assert completion.

### Core invariant

**A child claims done. A parent verifies done. Completion is never a
self-assertion.** This is the primary hedge against findings A2 and C1.

### Phase 0 — Bootstrap (dev-genie owns)

1. `dev-genie init` scaffolds the documents folder (Katana workspace).
2. Detect whether the directory is an existing project (Repo Intelligence).
3. If existing, ask the user: evaluate the codebase before writing the product
   vision, or write the vision without considering what exists. Explain *why*
   we would evaluate: to document the current architecture as a pattern, or to
   map it to a first-class pattern.

### Phase 1 — Vision + architecture (human-gated)

4. Write the Product Vision (Planner Role). Human approves before proceeding.
5. Only after vision approval, choose the architecture pattern (Architect /
   Strategy Role + Guardrails): document existing architecture as a custom
   pattern, map it to a first-class Guardrails pattern, or let the user pick /
   have us pick based on the vision. Human approves.

### Phase 2 — Project readiness (produces initiatives; does not do them inline)

6. New project: initiatives to set up project structure (folders, `npm init`,
   `ts init`, configs, Guardrails eslint/architecture rules).
   Existing project: initiatives to add eslint rules that *guide* refactor,
   refactor initiatives, and documentation of the ideal architecture + folder
   structure.
7. Initialize Audit, scan the existing codebase if present, store the baseline.
8. Project is now "ready" for normal workflows.

### Phase 3 — Normal workflow: one recursive govern-verify loop

Epics, then decompose epic → stories → tasks via Katana. The default is to
shape stories around capability or contract boundaries that can be reviewed and
validated independently, then keep tasks narrow within that boundary. If a
high/low/ui-style split is useful, it should happen at the story level rather
than by creating overlapping tasks inside one story. Execution is **one
recursive primitive** with two node types, applied at every level (task,
story, epic):

- **Leaf node (task):** the only node that edits files. Read task → write code
  → lint its own changes → self-check AC → ensure test coverage → claim done.
- **Inner node (story, epic, root):** governs children, never edits code. When
  all children claim done, run the authoritative pass (lint + unit tests + AC
  check + audit). On issue → dispatch a rework agent with details, loop. When
  clean → mark children done and claim done to its own parent.

This collapses the previously separate Developer Execution Loop (I-0005),
Multi-Agent Wave Execution Loop (I-0009), and Orchestrator Loop (I-0028) into
one recursive loop: "wave execution" is simply an inner node with more than one
child; "orchestration" is the root inner node.

### Parent–child return contract (the upward channel)

A child returns one of: `done` (claim — parent must verify), `needs-decision`
(a DecisionRequest), or `failed` (error → rework). Two orthogonal channels:

- **Vertical (execution):** parent ↔ child loops carry `done` / `needs-decision`
  / `failed`.
- **Sideways (decision):** an inner node routes a `needs-decision` to the
  correct Role (Planner / Designer / Architect / Quality) via the Role runner,
  receives a `DecisionRecord`, then patches the child's task and resumes, or
  creates a follow-up task if the decision is large.

Rules:

- **The parent governs but does not reason.** It routes decisions to Roles; it
  does not answer them.
- **Decision scope sets how high it bubbles.** A task-local question is handled
  by the nearest parent. A question that changes a shared contract / sibling
  interface bubbles to the node owning all affected siblings, which quiesces
  them, applies the patch, and resumes the still-valid ones. (Generalizes the
  I-0009 wave quiesce rule into a recursive property.)
- **A child's autonomy is bounded by the Decision Policy Engine.** Out-of-scope
  questions *must* be raised as `needs-decision`, never guessed. (Enforces the
  vision's "no hidden product/arch/design decisions" principle.)
- **Patch vs. new task:** small decision → patch instructions + resume; large →
  create a follow-up work item, sized from the DecisionRecord.

### Validation: one engine, two scopes

The leaf's self-check (lint changes / check AC / coverage) and the inner node's
authoritative pass (lint + tests + AC + audit) are the **same Validation
Engine** invoked at different scopes — fast/narrow at the leaf, authoritative/
full at the parent. We do not build two checkers. The leaf's cheap check exists
to reduce parent rework cycles; the parent's run is the gate that decides
completion (and is what `exit_criteria_met` should reflect — never an agent
claim).

### Audit scope

Audit runs at the **epic** inner-node level to start (regression-vs-baseline is
wasteful per task). If epic-level audit produces too much major rework, move it
down to the story level.

### Resolved ownership

| Concern | Owner |
|---|---|
| init, detect, scaffold, reconcile | dev-genie |
| vision / epics / stories content | Planner / PM Roles |
| architecture pattern catalog + eslint rules | Guardrails |
| documents, templates, decomposition, phases, board, search/CRUD/transition | Katana |
| baseline scan, regression audit | Audit |
| authoritative lint+test+AC+audit aggregation + completion decision | Validation Engine |
| spawning/governing child agents, rework loop, routing | the recursive govern-verify loop |
| autonomy / review / human-block policy | Decision Policy Engine |

### Resolved implementation direction

1. A leaf always bubbles to its parent. Leaves do not route decisions directly;
   they edit, validate locally, and report.
2. Sibling impact is detected through declared ownership surfaces plus runtime
   touch reports, with the parent making the final conflict decision. Touched
   files alone are too weak.

### Metis docs to update to reflect this (next step, human-in-the-loop)

- DGOS-A-0001: note the recursive govern-verify loop as the concrete shape of
  the Loop primitive; leaf vs inner node distinction.
- DGOS-I-0005 / I-0009 / I-0028: reconcile toward one recursive loop rather than
  three separate loops; record the parent–child return contract and the
  bubble-by-scope rule.
- DGOS-I-0007: completion decision = parent's authoritative Validation pass;
  `exit_criteria_met` reflects a ValidationReport, never an agent claim;
  one engine at two scopes.
- DGOS-I-0002: `ExecutionRecord` carries the evidence written back (hedges C1).
- DGOS-I-0003: high/low/ui pass split becomes a strategy recipe choice, not a
  hardcoded Katana behavior (hedges B2).
- Bootstrap/readiness phases (0–2) should be reflected in the dev-genie
  installer/setup and Strategy/Guardrails/Audit initiatives.
