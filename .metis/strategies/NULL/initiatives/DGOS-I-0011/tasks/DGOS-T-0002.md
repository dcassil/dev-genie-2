---
id: daimyo-package-scaffold-core
level: task
title: "Daimyo Package Scaffold, Core Domain Types, Port Interfaces & Engine Primitives"
short_code: "DGOS-T-0002"
created_at: 2026-05-22T17:53:47.577285+00:00
updated_at: 2026-05-22T20:11:48.770864+00:00
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

# Daimyo Package Scaffold, Core Domain Types, Port Interfaces & Engine Primitives

## Parent Initiative

[[DGOS-I-0011]] — establishes the hexagonal core skeleton from [[DGOS-A-0005]] that every other task in this initiative builds on.

## Objective

Create the `daimyo` package as a new top-level sibling plugin (alongside `katana/`, `guardrails/`, `audit/`, `dev-genie/`) and lay down the **hexagonal core skeleton**: the core domain types, the **three port interfaces** (`AgentTransport`, `WorkSource`, `DecisionProvider`) as typed contracts with no concrete adapters yet, and the **two engine primitives** every trivial built-in reduces to — a *bounded structured-model-call client* (`{context, request} → typed JSON`) and a *shell runner* (run a declared command, capture exit code + output). This is the foundation: it defines the seams so downstream tasks implement adapters without touching the core.

## Acceptance Criteria

- [ ] A `daimyo/` package exists at repo top level mirroring katana's structure: npm package (`package.json` + `.claude-plugin/plugin.json`), `src/`, `bin/`, build step producing committed `dist/`, and the root `.gitignore` un-ignore line for `daimyo/dist/`.
- [ ] TypeScript + lint config matches the repo's existing standards (no new relaxed rules; reuse the shared tsconfig/eslint conventions used by sibling plugins).
- [ ] Core domain types are defined and exported: at minimum `NodeId`/`TaskId`, `NodeType` (`leaf` | `inner`), node status, the child return union (`done` | `needs-decision` | `failed`), `DecisionRecord`, and the `DecisionVerdict` shape (`{ type: "decision" | "access" | "human", suggested_choice, suggested_response, confidence: 0-10, risk: 0-10, block_trigger: boolean }`) from DGOS-A-0005.
- [ ] The three port interfaces are defined as TypeScript interfaces with full method signatures and doc comments, **with no concrete implementation**: `AgentTransport`, `WorkSource` (`listTasks`/`getTask`/`markStatus`/`createTask`), `DecisionProvider`.
- [ ] The cross-port dependency `DecisionProvider → AgentTransport` (for the future Tier-2 investigator) is expressed in the type design and documented as the **only** allowed cross-port edge.
- [ ] The two engine primitives are implemented as small, tested, dependency-light modules: a structured-model-call client (takes a prompt/context + a JSON schema, returns typed JSON, with the model + API key injectable) and a shell runner (runs a declared command, returns `{ exitCode, stdout, stderr }`).
- [ ] Capability ports (`Validation`, `RepoIntelligence`, `Context`, `Roles`/planning) are declared as interfaces so DGOS-T-0006 and others can implement built-ins behind them; they are NOT implemented here beyond the interface.
- [ ] `npm run build` produces `dist/`, `npm test` runs and passes for the engine primitives, and `npm run lint`/typecheck pass clean.
- [ ] The package is installable as a plugin (valid `plugin.json`); registry wiring into dev-genie is deferred to [[DGOS-T-0012]] and explicitly noted as out of scope here.

## Implementation Notes

### Technical Approach

- Scaffold by copying katana's package conventions (build tooling, `dist/` commit policy, `bin/` entry, plugin manifest layout) so the marketplace pipeline treats it uniformly. Follow the repo CLAUDE.md rules for `dist/` un-ignore and version bumping.
- Keep the core **pure**: the core module must import none of the adapters and none of the sibling plugins. Ports are interfaces; adapters are wired at composition root only.
- The structured-model-call client and shell runner are the *primitives the trivial built-ins reduce to* (per the ADR capability table) — build them generic enough that DecisionProvider Tier 1 and the Validation built-in both consume them without modification.
- Define types so that `DecisionVerdict` is a distinct minimal type and the mapping to ADR-1's canonical Role result (`produced/skipped/blocked/needs_human`) is a clearly-marked adapter responsibility (implemented in DGOS-T-0007), not baked into the core.
- Establish the unit-test-against-fakes pattern the ADR calls for: provide fake/stub implementations of the three ports in a test-support module so later tasks can test the core with no real agent, work system, or model.

### Dependencies

- **Upstream:** [[DGOS-T-0001]] (spike) — its go/no-go informs whether the `AgentTransport` interface needs to model a PTY-style fuzzy "maybe idle" path from day one or can stay SDK-crisp; the interface should at least leave room for the `stalled` vs `log` distinction regardless.
- **Downstream:** every other task (T-0003 through T-0012) depends on this scaffold and these types/interfaces.

### Risk Considerations

- **Over- or under-specified ports leak** (ADR's main negative consequence). Mitigation: design the `AgentTransport` event/command vocabulary as data types here but defer the *full* contract semantics (payloads, correlation, hang semantics) to DGOS-T-0004; this task fixes the type shapes, not every guarantee.
- **Premature coupling:** accidentally importing a sibling plugin into core. Mitigation: enforce with a lint boundary / dependency check that core imports nothing outside core + std.
- **Build/`dist` drift:** forgetting the committed-`dist` policy breaks marketplace consumption. Mitigation: verify `dist/` is un-ignored and committed before closing the task.

### Execution Profile

**Recommended Agent: opus + high.** This is the load-bearing groundwork — package structure, core types, and port interfaces that every downstream task consumes. A wrong abstraction here creates compounding rework across the entire initiative, which is exactly the case the global rubric reserves opus + high for.

## Status Updates

- 2026-05-22 (agent): Scaffolded top-level `daimyo/` package with Katana-style esbuild MCP bundle, strict local TS/lint/test scripts, core domain/port contracts, engine primitive tests, fake port implementations, root `dist/` un-ignore entries, and generated `dist/daimyo-mcp.mjs`. Verification passed: `npm run typecheck`, `npm test`, `npm run lint`, `npm run build`.
- 2026-05-22 (orchestrator verification): independently re-ran typecheck/lint/test/build — all green (2 test files / 4 tests, 532kb bundle). Confirmed `src/core` import-purity (internal-only) with the single documented `DecisionProvider → AgentTransport` edge in `decision-provider.ts`; `domain.ts` carries the exact ADR `DecisionVerdict` shape, the `ChildReturn` union, and `DecisionRequest.surface: "permission" | "routing"` (pre-splits the two decision surfaces for DGOS-T-0007). No escape hatches / relaxed rules. `npm install` required a non-root cache due to a root-owned `~/.npm` entry. **exit_criteria_met: true.** Completed.