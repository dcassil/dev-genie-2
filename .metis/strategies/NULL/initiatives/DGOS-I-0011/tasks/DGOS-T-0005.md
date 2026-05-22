---
id: worksource-port-markdown-checklist
level: task
title: "WorkSource Port, Markdown-Checklist Floor & JSON Adapter"
short_code: "DGOS-T-0005"
created_at: 2026-05-22T17:53:50.791512+00:00
updated_at: 2026-05-22T20:58:46.681667+00:00
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

# WorkSource Port, Markdown-Checklist Floor & JSON Adapter

## Parent Initiative

[[DGOS-I-0011]] — implements the second port from [[DGOS-A-0005]] plus the two zero-dependency adapters that guarantee genuine standalone operation.

## Objective

Implement the **WorkSource port** — the authority over **task definition + status** — and its two floor adapters: a **markdown-checklist** adapter (toggles `- [ ]` ↔ `- [x]`, the zero-dependency floor that ships in core and makes `daimyo` runnable with no external system) and a **JSON** adapter. The WorkSource owns task data and is mutated **in place**; the Supervisor keeps no authoritative copy. Status is the lowest-common-denominator **task-definition** set `todo | active | done | blocked` — `needs-decision` is deliberately excluded because mid-decision is Supervisor execution state, not WorkSource truth.

## Acceptance Criteria

- [ ] The port surface is implemented: `listTasks()` (returns tasks each with status + a revision/etag), `getTask(id)`, `markStatus(id, status, evidence)`, and `createTask(spec, parentId?)` returning a new id. `createTask` is **required**, not optional (ADR-3's inner node must be able to seed follow-up work).
- [ ] The LCD status set is exactly `todo | active | done | blocked`; `needs-decision` is not representable in WorkSource status (a test asserts this is not accepted).
- [ ] Each adapter defines a **bidirectional** mapping between native states and the LCD set — both the write direction (LCD → native) and the read direction (native → LCD). For the markdown adapter the mapping is the checklist toggle plus a documented rule for `active`/`blocked` (which a bare checklist can't natively express) so reads round-trip sensibly.
- [ ] **Markdown-checklist adapter:** parses a plan file's `- [ ]`/`- [x]` items into tasks with stable IDs; `markStatus(done)` toggles to `- [x]`; `createTask` **appends** a new item (the contract is "visible to the next `listTasks`", not in-place richness); a revision/etag is derived (e.g. content hash or mtime) so the reconciler can detect external edits.
- [ ] **JSON adapter:** reads/writes a structured task list with explicit status + revision fields and full `createTask`/`markStatus` support.
- [ ] `evidence` passed to `markStatus` is persisted/attached in whatever form each adapter supports (at minimum recorded; markdown may store it as a sub-bullet or companion file).
- [ ] Adapters are tested against the fake/port-contract test suite; a shared conformance test verifies all WorkSource adapters honor the same behavioral contract (including bidirectional mapping round-trips and append-as-create visibility).
- [ ] The markdown adapter ships **inside `daimyo` core's standalone package** (no external dependency) per the ADR's "markdown floor guarantees genuine standalone operation."

## Implementation Notes

### Technical Approach

- Author a `WorkSource` conformance test suite (parametrized over adapters) so katana/metis adapters added later (out of scope here) inherit the same guarantees. This is the contract enforcer the ADR's "each adapter MUST define a bidirectional mapping" needs.
- Markdown adapter: assign stable IDs from item position + text hash (so an edit that changes text is detectable as a changed task by the reconciler). Document the chosen ID scheme since reconciliation diff-by-ID depends on ID stability semantics.
- Revision/etag: cheap and adapter-appropriate (content hash for markdown/JSON). It's available for optional optimistic concurrency later; v1 reconciliation is last-read-wins at checkpoints.
- Keep `createTask`'s contract minimal: "the new task becomes visible to the next `listTasks`." Append-only sources satisfy it by appending.

### Dependencies

- **Upstream:** [[DGOS-T-0002]] (port interface stubs + core types + fakes).
- **Downstream:** [[DGOS-T-0008]] (loop selects tasks + marks status), [[DGOS-T-0009]] (`createTask` for follow-up work), [[DGOS-T-0010]] (diff-by-ID reconciliation reads `listTasks` + revision). Rich katana/metis adapters are a later/separate effort but must satisfy this conformance suite.

### Risk Considerations

- **ID instability breaks reconciliation:** if markdown IDs shift when the file is edited, the reconciler mis-detects adds/removes. Mitigation: define and test a stable ID scheme; document its guarantees explicitly.
- **One-directional mapping leak:** implementing only LCD→native breaks reading external state back. Mitigation: conformance test asserts round-trip in both directions.
- **Accidentally storing status in the Supervisor:** mitigated by keeping this the sole authority and routing all status writes through `markStatus`.

### Execution Profile

**Recommended Agent: opus + medium.** Multi-file work (port + two adapters + conformance suite) with real reasoning about ID stability and bidirectional mapping, but it follows a clear, well-specified pattern from the ADR rather than setting new architecture. Medium fits; the bidirectional-mapping and stable-ID subtleties keep it above the mechanical tier.

## Status Updates

- 2026-05-22: Read preamble, DGOS-T-0005, ADR-5 WorkSource section/state boundary, supporting ADRs, and CLAUDE.md. Found existing Daimyo port stub already defines the required method surface; implementation will add runtime LCD status validation, markdown/JSON adapters under `daimyo/src/adapters`, shared conformance tests, version bump, and rebuilt dist.
- 2026-05-22: Implemented WorkSource LCD helpers, markdown-checklist and JSON adapters, shared adapter conformance tests, adapter exports, and Daimyo 0.4.0 version bump. Verified `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` all pass from `daimyo/`. Core import-boundary check found no adapter imports under `daimyo/src/core`.
- 2026-05-22 (orchestrator verification): re-ran typecheck/lint/test/build — all green (22 passed / 5 live-skipped; 11 of those are the WorkSource conformance + adapter tests). Confirmed `src/core` import-pure, LCD set enforced at runtime (`needs-decision` rejected with an explicit error + documented exclusion), bidirectional native↔LCD mappings on both adapters, markdown stable-ID scheme + content-hash revision + append-as-create, JSON adapter with explicit status/revision/evidence. Version 0.3.0 → 0.4.0. No escape hatches. **exit_criteria_met: true.** Completed.