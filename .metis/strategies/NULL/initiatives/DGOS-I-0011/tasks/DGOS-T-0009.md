---
id: decision-actions-tier-2
level: task
title: "Decision Actions & Tier-2 Investigating Agent"
short_code: "DGOS-T-0009"
created_at: 2026-05-22T17:53:55.870644+00:00
updated_at: 2026-05-22T21:35:36.447539+00:00
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

# Decision Actions & Tier-2 Investigating Agent

## Parent Initiative

[[DGOS-I-0011]] — completes the decision pathway from [[DGOS-A-0005]]: turning a `DecisionVerdict` into ADR-3's sideways-channel **actions**, and adding the Tier-2 investigating agent (the one allowed cross-port dependency).

## Objective

Implement the **decision actions** that ADR-3 requires after a verdict is produced — **patch-and-resume** (write a task patch to the affected leaf and resume it) and **create-follow-up** (call `WorkSource.createTask` to seed new authoritative work when the decision is large) — both **policy-gated** by the autonomy profile. Also implement **Tier 2**: when Tier 1 returns low `confidence` or high `risk`, spawn an ephemeral **read-only** agent that investigates relevant files/state and returns the same `DecisionVerdict` shape. Tier 2 is the **only** allowed `DecisionProvider → AgentTransport` cross-port dependency and must be named/contained as such.

## Acceptance Criteria

- [ ] **Patch-and-resume:** given a verdict resolving a leaf's `needs-decision`, the Supervisor writes a task patch to the affected leaf (execution store + targeted WorkSource `markStatus`/patch) and resumes that leaf's work; a test shows the resumed leaf proceeds with the patched instruction.
- [ ] **Create-follow-up:** when the decision is "large," `WorkSource.createTask(spec, parentId?)` seeds a new authoritative task that becomes visible to the next `listTasks`; a test shows the new task is scheduled by the loop on the next checkpoint.
- [ ] **Action selection is policy-gated:** which action is taken is decided against the autonomy profile + verdict; a "large" decision past the autonomy threshold additionally requires **Tier 3 sign-off before `createTask`** (tested).
- [ ] **Tier 2 investigator:** triggered only on Tier-1 low-confidence / high-risk; spawns a **read-only** worker via AgentTransport (no edits permitted — enforced via permission gating), lets it read relevant files/state, and returns a `DecisionVerdict`. The improved verdict re-enters the same action path.
- [ ] The cross-port dependency is **explicitly named and contained**: DecisionProvider depends on AgentTransport only for Tier 2; this is the sole cross-port edge and is documented/asserted so the SDK transport does not leak into the DecisionProvider abstraction elsewhere.
- [ ] Read-only enforcement for the Tier-2 worker is real (it cannot edit files); a test attempts an edit and confirms it is denied.
- [ ] Every action and Tier-2 investigation appends to the durable `DecisionRecord` trail ([[DGOS-T-0003]]).
- [ ] Tested against fakes for: patch-and-resume, create-follow-up below threshold (auto), create-follow-up above threshold (requires human sign-off), Tier-2 escalation improving a low-confidence verdict.

## Implementation Notes

### Technical Approach

- Build the action dispatcher as a function of (verdict, autonomy profile, decision size) → {patch-and-resume | create-follow-up | escalate-to-human-then-act}. Keep the "large decision" classifier explicit and documented (size by scope/impact, not vibes).
- Tier 2 reuses the AgentTransport port (not the SDK adapter directly) and spawns a worker constrained to read-only tools via the permission surface — implemented by denying edit/write/bash-mutating tools through Tier-0 policy for that worker.
- Resume-and-patch must coordinate with the loop's node state ([[DGOS-T-0008]]) and the execution store so the patched leaf resumes deterministically (or restarts from evidence if its resume token is invalid).
- create-follow-up writes only through `WorkSource.createTask`, never into the execution store as authoritative task data (boundary discipline).

### Dependencies

- **Upstream:** [[DGOS-T-0007]] (DecisionProvider + verdict + Tier-2 hook), [[DGOS-T-0008]] (loop node states + resume), [[DGOS-T-0004]] (AgentTransport for the Tier-2 worker), [[DGOS-T-0005]] (`WorkSource.createTask`), [[DGOS-T-0003]] (DecisionRecords).
- **Downstream:** [[DGOS-T-0011]] (large cross-contract decisions often produce follow-ups / quiesce), [[DGOS-T-0012]] (notifier used on Tier-3 sign-off).

### Risk Considerations

- **Cross-port leak:** Tier 2 is the one sanctioned exception; allowing any other DecisionProvider→transport call erodes the abstraction. Mitigation: name it in the port contract and assert no other path.
- **Read-only not actually enforced:** a Tier-2 investigator that can edit is dangerous. Mitigation: enforce via permission gating and test the denial.
- **Auto create-follow-up of large decisions** could spawn unwanted work. Mitigation: policy gate + Tier-3 sign-off above threshold.

### Execution Profile

**Recommended Agent: opus + medium.** Substantive integration across DecisionProvider, the loop, AgentTransport, and WorkSource, with the carefully-bounded cross-port dependency — but it follows the patterns those tasks established rather than defining new substrate. Medium, leaning on the precision of the upstream contracts.

## Status Updates

### 2026-05-22 — Decision actions + Tier-2 investigator complete (via Codex gpt-5.5)

Verdict actioning fills the seam T-0008 left, in `daimyo/src/supervisor/decision-actions.ts`:
- **patch-and-resume:** adds `WorkSource.patchTask` (across port/adapters/fakes), writes the patch + `markStatus(active)` + execution-store evidence, resumes the leaf with the patched instruction.
- **create-follow-up:** large decisions seed an authoritative task via `WorkSource.createTask`, scheduled on the next checkpoint.
- **policy-gated selection:** action chosen from (verdict, autonomy profile, explicit decision-size classifier); a large decision above the autonomy threshold parks for **Tier-3 human sign-off before `createTask`**.
- **Tier 2:** low-confidence/high-risk Tier-1 verdicts spawn a **read-only** worker through AgentTransport; the improved verdict re-enters the action path. Read-only is enforced by denying edit/write/mutating-bash.

**Orchestrator verification:** typecheck/lint/test/build all green (49 passed / 5 live-skipped). Key tests confirmed real by name: `cross-port-boundary.test.ts` asserts `DecisionProvider → AgentTransport` is the only named cross-port edge AND core imports stay in `src/core` (static enforcement); `denies edit and mutating bash permissions for the Tier 2 read-only worker`; `uses Tier 2 read-only investigation to improve a low-confidence Tier 1 verdict`; create-follow-up `below-threshold (auto)` and `above the autonomy threshold (requires human sign-off)`. WorkSource conformance suite still passes after the `patchTask` addition. `src/core` import-pure. Version 0.7.0 → 0.8.0. No escape hatches. **exit_criteria_met: true.** Completed.