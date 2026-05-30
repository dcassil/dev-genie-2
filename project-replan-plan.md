# Project Replan Plan — Metis Recreation

## Purpose

The current `.metis` workspace (1 vision, 2 ADRs, 31 initiatives) was authored
before the Katana retro (`katana-tests/katana-retro-1.md`) clarified the
target architecture. Rather than patch 34 documents in place, we will recreate
the Metis workspace from a clean slate, using the originals + the retro
decisions as source material, and consolidating/dropping documents where the
new model makes them redundant.

This document is the complete strategy for that recreation. **No `.metis`
mutation happens until this plan is approved.**

## Inputs (source of truth, in priority order)

1. `katana-tests/katana-retro-1.md` — the agreed target architecture and the
   decisions that override older framing.
2. `.metis.orig/` — the original documents (renamed, read-only reference).
3. The four plugin packages (`katana/`, `audit/`, `guardrails/`, `dev-genie/`)
   for ground truth about what exists today.

When the retro and an original document conflict, **the retro wins.**

## Core architectural decisions to bake into the new docs

From the retro, these supersede the original framing everywhere:

1. **Katana is document-scoped.** It owns documents, templates, short codes,
   frontmatter/schema, board, phase machine, search/CRUD/transition tools, and
   platform adapters. It does NOT own strategy, validation-completion,
   guardrails, audit, or orchestration. Each plugin is independently usable but
   no single plugin runs the whole workflow.
2. **One recursive govern-verify loop**, not three separate loops. Leaf nodes
   edit code; inner nodes govern children and run authoritative validation.
   "Wave execution" = an inner node with >1 child; "orchestration" = the root
   inner node.
3. **Completion is owned by the parent's authoritative Validation pass**, never
   self-asserted by an executing agent. `exit_criteria_met` reflects a
   ValidationReport.
4. **Validation is one engine at two scopes** — fast/narrow at the leaf,
   authoritative/full (lint+test+AC+audit) at the parent.
5. **Parent–child return contract:** `done` / `needs-decision` / `failed`.
   Decisions route sideways to Roles; they bubble up by scope; child autonomy
   is bounded by the Decision Policy Engine.
6. **Bootstrap phases 0–2** (init → detect → vision-gate → architecture pattern
   → readiness initiatives → audit baseline) are first-class and owned by
   dev-genie + Strategy/Guardrails/Audit.
7. **Audit runs at epic level to start**, moving to story level only if rework
   volume demands it.
8. **Decomposition defaults to capability or contract boundaries.** High/low/ui
   pass splitting is only a Strategy recipe heuristic, not hardcoded Katana
   behavior, and when used it should split stories rather than create
   overlapping tasks inside one story.

## Method

### Step 0 — Preserve

- Rename `.metis` → `.metis.orig`. Do not delete. It becomes the read-only
  reference and the audit trail for what changed.
- Confirm `.metis.orig` still opens/reads (SQLite + markdown intact).

### Step 1 — Re-initialize

- Initialize a fresh `.metis` with the **streamlined** preset (vision →
  initiative → task; ADRs enabled) to match the original configuration.
- New short codes will restart from `DGOS-*-0001`. We accept short-code churn
  and track it in the crosswalk (Step 5).

### Step 2 — Recreate in dependency order

Create documents top-down so parents exist before children:

1. **Vision** (`DGOS-V-0001`) — rewrite from the original vision + retro.
2. **ADRs** — recreate the foundational decisions (see ADR plan below).
3. **Initiatives** — create the consolidated set (see disposition table),
   each parented to the vision, each `runtime_primitive` tagged.

### Step 3 — Per-document procedure

For every new document:

1. Read the relevant original(s) from `.metis.orig`.
2. Apply the retro decisions; reconcile conflicts in the retro's favor.
3. Re-evaluate the planned scope using the same decomposition test we now want
   the product to use: prefer capability or contract boundaries over phase
   labels; prefer scopes that minimize file overlap, hidden coupling, and
   cross-agent coordination; use pass-oriented splits only when they reduce
   coupling and only at the story level.
4. If the improved shape is at least 90% identical in intent and structure to
   the current plan, apply it directly and record the refinement in the new
   document. If it materially changes scope, ownership, or decomposition, stop
   and ask the human before proceeding.
5. Fill the Metis template **completely** (per global completeness rules — no
   placeholders, no TBD, every section substantive).
6. For strategic docs (vision, ADRs, initiative consolidation), **stop at the
   human checkpoint** before mass creation continues.

### Step 4 — Human-in-the-loop checkpoints

- **CP1:** Approve this replan plan (disposition table + ADR plan).
- **CP2:** Approve the rewritten Vision before any initiative is created.
- **CP3:** Approve the ADR set.
- **CP4:** Approve the consolidated initiative list (titles + scope) before
  writing full initiative bodies.

### Step 5 — Crosswalk

Maintain `project-replan-crosswalk.md`: a table mapping every original short
code → its disposition (kept / rewritten / merged-into / dropped) with a one-
line reason. Every one of the 34 originals must appear, so nothing is silently
lost.

### Step 6 — Verify

- `lint_workspace` on the new `.metis`; resolve all issues.
- Confirm zero template placeholders remain.
- Confirm the crosswalk accounts for all 34 originals.
- Confirm every initiative has a parent and a `runtime_primitive` tag.

### Rollback

If the recreation goes wrong, delete the new `.metis` and rename `.metis.orig`
back to `.metis`. Nothing is destructive until we choose to remove `.metis.orig`
at the very end (a separate, explicit decision).

## ADR plan

| New ADR | Source | Action |
|---|---|---|
| Engine / Role / Loop Primitive Split | A-0001 | Rewrite, faithful, still core |
| Role Invocation Convention | A-0002 | Rewrite, faithful, still valid |
| Recursive Govern-Verify Execution Loop | retro | **New** — claim-vs-verify invariant, leaf/inner nodes, parent–child return contract, bubble-by-scope, completion = parent validation |

(Decision point: completion-authority could be its own ADR or folded into the
recursive-loop ADR + Validation initiative. Proposed: fold in, to avoid ADR
sprawl.)

## Proposed initiative disposition (PROPOSED — confirm at CP4)

Consolidates 31 initiatives down to 15. Grouped by theme.

### Foundations
| Original(s) | New initiative | Action |
|---|---|---|
| I-0002 Artifact Protocol & Document Engine | Artifact Protocol & Shared Schemas | Split from document-layer concerns; rewrite with ExecutionRecord, ValidationReport, DecisionRequest, DecisionRecord emphasis |
| I-0002 Artifact Protocol & Document Engine | Document Engine & Katana Schema Layer | Split from cross-primitive protocol work; rewrite around markdown/frontmatter schema, indexing, migrations, and document semantics |
| I-0001 Repo Restructure & Package Boundary Cleanup, I-0030 Remove Prompt-Only Role Handoffs | Package Boundaries & Handoff Cleanup | Merge |
| I-0010 Platform Packaging & Installer Reconciliation | Platform Packaging & Installer | Keep (rewrite) |

### Engines
| Original(s) | New initiative | Action |
|---|---|---|
| I-0003 Strategy & Planner Engine | Strategy Engine & Decomposition Recipes | Rewrite (recipe owns decomposition heuristics, including when pass-splitting is warranted) |
| I-0004 Repo Intelligence Engine Extraction, I-0029 Move Repo Detection | Repo Intelligence Engine | Merge |
| I-0006 Context Engine | Context Engine | Keep |
| I-0007 Validation Engine & Gate Adapter | Validation Engine & Completion Authority | Rewrite (owns completion, one engine two scopes) |
| I-0020 Decision Policy Engine, I-0021 Decision Scope & Review Modes, I-0011 Human Review & Decision Governance | Decision Policy & Governance | Merge |

### Roles
| Original(s) | New initiative | Action |
|---|---|---|
| I-0023 Planner, I-0024 Designer, I-0025 Architect, I-0026 Principal FE/BE, I-0027 PM | Role Contracts & Autonomy | Merge into one initiative; per-role detail becomes sections/tasks (confirm at CP4 — may keep Architect/Planner separate if large) |

### Loops (the big collapse)
| Original(s) | New initiative | Action |
|---|---|---|
| I-0005 DecisionRequest/Micro-Workflow, I-0009 Multi-Agent Wave, I-0028 Orchestrator Loop, I-0022 Developer Loop DecisionRequest | Recursive Govern-Verify Execution Loop | **Merge all four into one** |

### Bootstrap & readiness (new)
| Original(s) | New initiative | Action |
|---|---|---|
| (new, from retro phases 0–2; overlaps I-0010) | Bootstrap & Project Readiness | **New** — init, detect, vision-gate, arch-pattern selection, readiness initiatives, audit baseline |

### Proof & tests
| Original(s) | New initiative | Action |
|---|---|---|
| I-0031 Protocol Proof MVP | Protocol Proof MVP | Keep |
| I-0008 Existing Repo Major Feature v0.5 Full Flow | Existing Repo Major Feature v0.5 | Keep |
| I-0012 Workflow Test Harness, I-0013–I-0019 (7 scenario initiatives) | Workflow Test Harness & Scenario Corpus | Merge — the 7 scenario initiatives become scenarios/tasks under the harness, not standalone initiatives |

### Disposition summary
- **Keep (rewrite faithfully):** I-0006, I-0010, I-0031, I-0008
- **Rewrite (apply retro):** Vision, I-0003, I-0007, A-0001, A-0002
- **Split:** I-0002 -> {Artifact Protocol & Shared Schemas, Document Engine & Katana Schema Layer}
- **Merge:** {I-0001+I-0030}, {I-0004+I-0029}, {I-0020+I-0021+I-0011},
  {I-0023+I-0024+I-0025+I-0026+I-0027}, {I-0005+I-0009+I-0028+I-0022},
  {I-0012+I-0013..I-0019}
- **New:** Recursive Govern-Verify Loop ADR, Bootstrap & Project Readiness
- **Drop outright:** none yet — every original maps somewhere (confirm at CP4)

Net: 1 vision + 3 ADRs + 15 initiatives, down from 1 + 2 + 31.

## Per-new-document content specifications

For each new document: the originals to read, its `runtime_primitive`, the
retro decisions that apply (by number from "Core architectural decisions"
above), and the key content / what changes from the original. Authoring a doc
means reading its sources from `.metis.orig`, then writing a complete Metis
template incorporating these notes. This section exists so execution does not
rely on conversation context.

### Vision — `DGOS-V-0001`
- Sources: original `DGOS-V-0001`.
- Applies: all decisions 1–8.
- Content/changes: keep the Engine/Role/Loop primitive framing and the artifact
  chain (Vision → ProductDoc → Epic → Story → TaskSet → Task → ExecutionRecord).
  **Rewrite the runtime section** so Loops are described as one recursive
  govern-verify loop (leaf vs inner node), not three separate loops. State the
  claim-vs-verify completion invariant. Restate Katana as document-scoped
  (decision 1) and explicitly list what Katana does NOT own. Add the bootstrap
  phases 0–2 to the "future state"/flow narrative. Keep the standalone-usability
  constraint for every plugin.

### ADR — Engine / Role / Loop Primitive Split
- Sources: original `DGOS-A-0001`.
- Applies: 1, 2.
- Content/changes: faithful rewrite. In the Loop section, add that the concrete
  Loop shape is the recursive govern-verify loop with leaf and inner node types
  (forward-ref the new ADR).

### ADR — Role Invocation Convention
- Sources: original `DGOS-A-0002`.
- Applies: 5.
- Content/changes: faithful rewrite. Subprocess Role runner, `RoleInvocation`/
  `RoleResult` envelopes, v0.1 subset for the Protocol Proof MVP. Keep intact —
  still valid. Note that wave workers are Loop nodes, not Role calls (now phrased
  as "inner/leaf loop nodes").

### ADR — Recursive Govern-Verify Execution Loop (NEW)
- Sources: retro doc "Simplified target workflow" section.
- Applies: 2, 3, 4, 5, 7.
- Content/changes: the new core decision. Must define: the claim-vs-verify
  invariant (decision 3); leaf node (only node that edits code: write → lint own
  changes → self-check AC → coverage → claim done) vs inner node (governs
  children, runs authoritative lint+test+AC+audit, owns rework loop, never edits
  code); that this single primitive collapses the former Developer/Wave/
  Orchestrator loops (wave = inner node with >1 child, orchestration = root inner
  node); the parent–child return contract (`done`/`needs-decision`/`failed`); the
  two channels (vertical execution, sideways decision-to-Role); bubble-by-scope
  (local → nearest parent; shared-contract → bubble to owning node, quiesce
  siblings, patch, resume); patch-vs-new-task sizing; completion = parent's
  authoritative Validation pass (fold completion-authority here per decision 2).
  Leaves always bubble decisions to parents, and sibling impact is detected
  through declared ownership surfaces plus runtime touch reports, with the
  parent deciding whether to load sibling context or quiesce siblings.

### Initiative — Artifact Protocol & Shared Schemas (`protocol`)
- Sources: `I-0002`.
- Applies: 1, 3, 5.
- Content/changes: shared artifact metadata contract (status, confidence,
  missing_context, human_review_required, source/output artifacts, skip_reason).
  Emphasize `ExecutionRecord` (the write-back evidence that hedges retro C1),
  `ValidationReport`, `DecisionRequest`, `DecisionRecord` schemas, ownership
  metadata, and content-hash expectations. This is the cross-primitive
  contract layer and should stay separate from document storage concerns.

### Initiative — Document Engine & Katana Schema Layer (`engine`)
- Sources: `I-0002`.
- Applies: 1, 3.
- Content/changes: markdown/frontmatter schema, indexing, cross-links,
  migrations, document validation substrate, and Katana document semantics.
  This is the document-layer engine that persists and validates repo-native
  artifacts, but it does not own the cross-primitive protocol contract itself.

### Initiative — Package Boundaries & Handoff Cleanup (`meta`)
- Sources: `I-0001` + `I-0030`.
- Applies: 1.
- Content/changes: package boundary rules (Katana doc-scoped; Guardrails/Audit
  independently installable; no single package runs the full workflow). Replace
  prompt-only role handoffs with the subprocess Role runner convention.

### Initiative — Platform Packaging & Installer (`engine`)
- Sources: `I-0010`.
- Applies: 6.
- Content/changes: keep; installer/reconciliation. Note overlap with the new
  Bootstrap initiative — installer is the deterministic setup Engine that
  Bootstrap orchestrates.

### Initiative — Strategy Engine & Decomposition Recipes (`engine`)
- Sources: `I-0003`.
- Applies: 8.
- Content/changes: deterministic classification + declarative recipes. The
  default decomposition rule is capability or contract boundary first, not pass
  label first. Recipes should prefer stories that can be reviewed and validated
  independently, with narrow tasks inside each story boundary. **High/low/ui
  pass split is only a recipe choice here**, used when it reduces coupling, and
  when used it should split stories rather than create overlapping tasks inside
  one story (hedges retro B2). Recipes declare required inputs, produced
  artifacts, primitive routes, gates, skip conditions.

### Initiative — Repo Intelligence Engine (`engine`)
- Sources: `I-0004` + `I-0029`.
- Applies: 6.
- Content/changes: extract repo detection out of dev-genie into this engine;
  RepoProfile facts (frameworks, scripts, CI, hooks, ownership). Used by
  Bootstrap phase 0 detection and by the Context Engine.

### Initiative — Context Engine (`engine`)
- Sources: `I-0006`.
- Applies: 4, 5.
- Content/changes: keep. Minimal context bundle assembly per Role/task. Supplies
  context bundles named in `RoleInvocation` and to leaf nodes.

### Initiative — Validation Engine & Completion Authority (`engine`)
- Sources: `I-0007`.
- Applies: 3, 4, 7.
- Content/changes: **owns the completion decision** (hedges retro A2/C2). One
  engine invoked at two scopes (leaf fast/narrow vs parent authoritative full:
  lint+test+AC+audit). Writes `ValidationReport`; `exit_criteria_met` reflects
  that report, never an agent claim. Adapters for Katana doc gates, package
  scripts, Guardrails checks, Audit scans. Audit runs at epic level to start
  (decision 7).

### Initiative — Decision Policy & Governance (`engine`)
- Sources: `I-0020` + `I-0021` + `I-0011`.
- Applies: 5.
- Content/changes: deterministic autonomy/review/routing/forbidden-action/
  human-block evaluation; decision scope configuration and review modes; human
  review governance at strategic/high-risk boundaries. **Bounds child autonomy**
  in the recursive loop (out-of-scope question → must raise `needs-decision`).

### Initiative — Role Contracts & Autonomy (`role`)
- Sources: `I-0023` + `I-0024` + `I-0025` + `I-0026` + `I-0027` (+ Quality
  Governor and Refactor/Migration roles from the vision).
- Applies: 5.
- Content/changes: one initiative, a full section per role (Planner, Designer,
  Architect, Principal FE, Principal BE, PM, Quality Governor, Refactor/
  Migration). Each section: artifacts produced, decision scopes owned, autonomy
  vs human-review boundaries, skip behavior. Shared contract (RoleInvocation/
  RoleResult, artifact I/O) stated once. Decomposes into per-role tasks.

### Initiative — Recursive Govern-Verify Execution Loop (`loop`)
- Sources: `I-0005` + `I-0009` + `I-0028` + `I-0022`.
- Applies: 2, 3, 4, 5, 7.
- Content/changes: **the big collapse** — one initiative for what were four
  loop initiatives. Implements the new ADR: leaf/inner nodes, parent–child
  return contract, sideways decision routing to Roles via the subprocess runner,
  bubble-by-scope + sibling quiesce (from I-0009 wave rules, generalized),
  task patch/resume vs follow-up task, durable records/resumability, the rework
  loop. Multi-agent waves = inner node with >1 child in isolated worktrees.

### Initiative — Bootstrap & Project Readiness (`loop`/`meta`) (NEW)
- Sources: retro phases 0–2; overlaps `I-0010`.
- Applies: 6.
- Content/changes: `dev-genie init` → scaffold docs folder → detect existing
  project → ask user (evaluate codebase vs vision-blind) → vision (human gate)
  → architecture pattern selection (document existing as pattern / map to
  first-class Guardrails pattern / user picks) (human gate) → produce setup
  initiatives (new project) or refactor + eslint-guidance initiatives (existing)
  → init Audit + scan + baseline → project ready. Human gates are explicit.

### Initiative — Protocol Proof MVP (`meta`)
- Sources: `I-0031`.
- Applies: 5.
- Content/changes: keep. Smallest proof: one hand-authored Story → one Architect
  Role invocation → one validated ArchitectureImpact artifact → dogfood on a
  real dev-genie planning change. Uses the v0.1 RoleInvocation/RoleResult subset.

### Initiative — Existing Repo Major Feature v0.5 (`meta`)
- Sources: `I-0008`.
- Applies: 1–8 (full flow).
- Content/changes: keep. The end-to-end existing-repo flow after the protocol
  proof: request → repo profile → product/stories → architecture impact → FE/BE
  plans → task set → first execution record. Exercises the recursive loop.

### Initiative — Workflow Test Harness & Scenario Corpus (`meta`)
- Sources: `I-0012` + `I-0013`–`I-0019`.
- Applies: 2, 3, 4, 5.
- Content/changes: the harness plus the 7 scenarios as fixtures/tasks (vision→
  reviewed task set; runtime product decision loop; dashboard strategy/task
  mapping; autonomous design decision modes; architecture escalation/approval;
  validation failure recovery; runtime primitive contract/skip behavior). Each
  scenario asserts primitive-specific behavior (Role skip records, Engine
  validation reports, Loop resume records) and the claim-vs-verify invariant.

## Risks & mitigations

- **Short-code churn breaks references.** Mitigation: crosswalk doc (Step 5);
  the retro doc references concepts, not just codes.
- **Lost nuance from originals.** Mitigation: `.metis.orig` retained; per-doc
  procedure requires reading the original before rewriting.
- **Over-consolidation hides distinct work.** Mitigation: CP4 review of the
  consolidated list before full bodies are written; merges are reversible by
  splitting later.
- **Effort.** ~19 documents to author completely. Mitigation: dependency-order
  creation; checkpoints prevent wasted work on a wrong vision.

## Decisions (resolved)

These were delegated and are now fixed. Recorded here so execution does not
depend on conversation memory.

1. **Preservation mechanic:** `.metis` → `.metis.orig` (read-only reference),
   fresh `.metis` created. Confirmed. **Not executed yet** — awaiting explicit
   go-ahead to run the rename.
2. **ADR count: 3.** Completion-authority ("gates decide completion, not agent
   promises") is folded into the Recursive Govern-Verify Loop ADR + the
   Validation Engine initiative, not a standalone ADR. Rationale: it is a
   direct corollary of the claim-vs-verify invariant; a separate ADR would
   duplicate that reasoning.
3. **Role initiatives: merge into one** ("Role Contracts & Autonomy"). Per-role
   detail (Planner, Designer, Architect, Principal FE, Principal BE, PM, Quality
   Governor, Refactor/Migration) becomes a full section per role and decomposes
   into per-role tasks. Rationale: the shared contract (RoleInvocation/
   RoleResult, autonomy bounded by Decision Policy, artifact I/O) is identical
   across roles; per-role variance is the artifact list + decision scopes, which
   fit cleanly as sections. Simpler and keeps the shared contract in one place.
4. **Test scenarios: merge into harness** ("Workflow Test Harness & Scenario
   Corpus"). The 7 original scenario initiatives become scenarios/tasks under
   the harness. Rationale: a scenario is a fixture/test case, not a project.
5. **Preset: streamlined retained** (vision → initiative → task, ADRs enabled),
   matching the original configuration.
6. **Initiative review rule:** when refining the consolidated initiative set,
   apply improvements directly if they preserve at least 90% of the planned
   intent and structure; stop and ask the human only when the refinement
   materially changes scope, ownership, or decomposition.
7. **CP4 approved adjustment:** split the original combined "Artifact Protocol &
   Document Engine" initiative into two initiatives: "Artifact Protocol &
   Shared Schemas" and "Document Engine & Katana Schema Layer."

### Execution gate

Proceed in this order once the user says go: run Step 0 rename → Step 1 re-init
→ Step 2 Vision rewrite → **stop at CP2** for vision approval before creating
any initiative.
