---
id: recursive-multi-child-waves
level: task
title: "Recursive Multi-Child Waves: Sibling Impact & Quiesce-Resume"
short_code: "DGOS-T-0011"
created_at: 2026-05-22T17:53:58.398078+00:00
updated_at: 2026-05-22T21:56:43.681348+00:00
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

# Recursive Multi-Child Waves: Sibling Impact & Quiesce-Resume

## Parent Initiative

[[DGOS-I-0011]] — generalizes the single-child loop into ADR-3's "a multi-agent wave is just an inner node with more than one child," with the sibling-impact and quiesce/resume coordination ADR-3 specifies.

## Objective

Extend the Supervisor loop ([[DGOS-T-0008]]) to run an inner node with **more than one child concurrently** (a wave), and implement the **parent-side sibling-impact detection** and **quiesce/resume** behavior from ADR-3. Waves are not a separate architecture — they are the recursive case. The parent governs but does not reason: it detects conflicts from declared ownership surfaces + runtime touch reports, classifies them (hard / soft / none), and quiesces dependent siblings around a shared-contract change, then resumes valid work.

## Acceptance Criteria

- [ ] An inner node can spawn and supervise **multiple concurrent child workers**, each with its own AgentTransport session and execution-store node state; the loop multiplexes their events deterministically.
- [ ] **Ownership surfaces** are consumed at decomposition time: `owns_files`, `owns_interfaces`, `owns_data`, `owns_workflow_steps`, optional `depends_on` (ADR-3 field set).
- [ ] **Runtime touch reports** from leaves are collected: the concrete files/interfaces/data a leaf touched or intends to touch.
- [ ] **Conflict classification** implemented per ADR-3: **hard conflict** (direct ownership overlap or shared-contract change) → quiesce affected siblings; **soft conflict** (likely dependency impact, no confirmed overlap) → load sibling context / patch instructions if needed; **no conflict** → continue.
- [ ] **Quiesce/resume:** on a hard conflict the owning inner node quiesces dependent children, applies the patch or follow-up (via decision actions from [[DGOS-T-0009]]), and resumes valid work. Tested with two siblings where one changes a shared interface.
- [ ] **Bubble-by-scope:** a question that changes a shared contract or sibling interface bubbles to the node that owns all affected siblings (not handled by the nearest parent if that parent doesn't own all affected siblings); task-local questions are handled by the nearest parent. Tested.
- [ ] **Parent-scope authoritative validation** runs across the inner node's whole owned surface after children claim done ([[DGOS-T-0006]]), and wave completion reflects that, never child claims.
- [ ] Wave completion triggers checkpoint reconciliation ([[DGOS-T-0010]]).
- [ ] Concurrency is bounded/configurable and tested against fakes for: independent siblings (no conflict, parallel completion), hard conflict (quiesce + resume), soft conflict (context load), and a cross-sibling decision bubbling to the correct owning node.

## Implementation Notes

### Technical Approach

- Generalize the inner-node governance from [[DGOS-T-0008]] to a set of children; the loop's event handling already keys by session/correlation, so multiplexing is an extension of the existing state machine, not a rewrite.
- Implement the hybrid sibling-impact model ADR-3 mandates: declared ownership surfaces (static) + runtime touch reports (dynamic) + conservative parent-side conflict checks. Prefer false-positive-safe conservative checks for hard conflicts.
- Quiesce = pause dependent children via AgentTransport `interrupt`/hold without disposing their state; resume re-issues with patched instructions or after the shared change settles.
- Route shared-contract decisions through DecisionProvider at the **owning** node and apply via [[DGOS-T-0009]] actions (patch-and-resume / create-follow-up).

### Dependencies

- **Upstream:** [[DGOS-T-0008]] (single-child loop + inner-node governance to generalize), [[DGOS-T-0009]] (decision actions for quiesce-driven patches/follow-ups), [[DGOS-T-0006]] (parent-scope validation), [[DGOS-T-0010]] (wave-completion checkpoint), [[DGOS-T-0004]] (`interrupt` for quiesce).
- **Downstream:** none within this initiative; this is the last behavioral layer. Real multi-task runs ([[DGOS-A-0005]] review trigger / Protocol Proof MVP) exercise it.

### Risk Considerations

- **Concurrency bugs / nondeterminism** in event multiplexing. Mitigation: keep per-node state in the store and make event handling a deterministic transition keyed by correlation; test with scripted fake event interleavings.
- **Missed sibling impact** (under-detecting a hard conflict) corrupts shared contracts. Mitigation: conservative parent-side checks that err toward declaring hard conflict; combine static ownership + runtime touch evidence rather than inference alone.
- **Quiesce deadlock / starvation** if resume conditions never met. Mitigation: bounded quiesce with escalation to `needs-decision`/human if resume can't proceed.

### Execution Profile

**Recommended Agent: opus + high.** Concurrent multi-child supervision plus hard/soft conflict detection and quiesce/resume is the most coordination-heavy behavior in the initiative, with real nondeterminism risk and shared-contract-corruption stakes. Top tier.

## Status Updates

2026-05-22 — Implemented in `daimyo/`: bounded multi-child wave supervision, ownership-surface parsing, runtime touch reports, hard/soft sibling-impact handling, hard-conflict quiesce/resume through existing decision actions, bubble-by-scope routing, parent-scope wave validation, checkpoint reconciliation preservation, minor version bump, dist rebuild, and fake interleaving tests. Verified `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` in `daimyo/`.

2026-05-22 (orchestrator verification): re-ran typecheck/lint/test/build — all green (62 passed / 5 live-skipped). Four wave tests confirmed real by name: independent siblings in a bounded wave (parallel, no conflict), quiesce-and-resume after a hard shared-interface conflict, soft dependency-impact context load without quiescing, and cross-sibling decisions bubbling to the node owning all affected siblings — via scripted fake event interleavings. Generalized the existing inner-node governance (no rewrite); event handling is a deterministic transition keyed by session/correlation. `src/core` import-pure. Version 0.9.0 → 0.10.0. No escape hatches. **exit_criteria_met: true.** Completed.