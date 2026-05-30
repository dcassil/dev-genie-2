# RESUME — dev-genie build-out

_Last updated: 2026-05-25 (DGOS-I-0016 complete; live-dogfood findings captured)_

## ⇣ LATEST SESSION STATUS (read this first)

**(1) DGOS-I-0016 — Installer & Reconciliation Engine: COMPLETE.** All 7 tasks
(T-0051..0057) + the initiative transitioned to completed. Commits on local
`main`, NOT pushed: `027d4c3` (T-0053 detector) → `ac08e3f` (T-0054 planner) →
`b2db180` (T-0055 ManagedWriter port + adapters; dev-genie 0.3.1→0.3.2) →
`ddeb7fa` (T-0056 applier) → `aeb0a45` (T-0057 E2E fixtures + seam) → `98517c8`
(initiative complete).

**(3) Live dogfoods — PARTIAL; two items need a decision.**
- Fixed two real bugs the dogfood surfaced (committed, NOT pushed):
  - `695cc7a` **daimyo 0.15.1** — `AnthropicStructuredModelClient` now strips
    Markdown ```json fences before parsing (live model fenced its output → strict
    JSON.parse threw). Tested, dist rebuilt (deliberate release).
  - `8420073` **roles dogfood** — explicit 120s model-call timeout
    (`ROLES_LIVE_TIMEOUT_MS`); was aborting at daimyo's 30s default mid-generation.
- **roles dogfood now runs end-to-end against the live model** (auth OK, ~28–34s,
  output parses) and surfaces the REAL finding: the live Architect role's output
  **fails ArchitectureImpact protocol-schema validation** — missing envelope
  fields (`artifact_id`/`producer`/`source_refs`/`output_refs`/`ownership`/
  `diagnostics`, `confidence.score`, `review_required` shape) and every
  `*_surfaces` object missing `owns_files`/`owns_interfaces`/`owns_data`/
  `owns_workflow_steps`. This is a v0.x schema-conformance gap (prompt /
  schema-injection / structured-output-retry design), NOT a quick fix — it is
  exactly what **DGOS-T-0028** ("First Execution Record, Validation Outcome, and
  v0.5 Findings") exists to capture. **DECISION NEEDED:** treat as a finding for
  T-0028 vs. invest in conformance now.
- **protocol-proof dogfood — BLOCKED.** Its `live-dogfood.ts` requires
  `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL` and authenticates with
  `Authorization: Bearer` (a gateway pattern); the standard Anthropic API needs
  `x-api-key`. `.env.local` only has `ANTHROPIC_API_KEY`. **DECISION NEEDED:**
  provide gateway creds / skip / adapt the client to direct `x-api-key`.
- Live-run artifacts are on disk under `roles/evidence/dogfood/` (untracked).

## Standing workflow (reaffirmed across the session)

- **Decompose** next initiative with a fully-autonomous Agent subagent (opus), then
  **work tasks in order with Codex agents** (`codex exec`, run in background).
- **Commit per task, locally on `main`, NO push.** Auto through the chain — stop
  only on failure or a genuine blocker.
- Per-commit discipline: `git reset` → explicit-path `git add` → verify staged set.
  Revert incidental `daimyo/dist/` re-bundle churn (`git checkout -- daimyo/dist/`)
  before committing — daimyo's dist refreshes only on a deliberate daimyo release.
- Every decomposed task carries `Recommended Agent: <model> + <effort>`.
- Repo rule: plugin fixes go to `main`; bump plugin version in BOTH
  `.claude-plugin/plugin.json` and `package.json`; commit source + dist + bump.

## Current directive: "do 1, then 3"

**(1)** Finish building **DGOS-I-0016 — Installer & Reconciliation Engine**.
**(3)** Then run the live dogfoods using the `.env.local` ANTHROPIC_API_KEY.

## Where we are

### Completed initiative sequence (all committed on `main`, NOT pushed)
`I-0011 → I-0001 → I-0013 → ADR-4 → I-0010 → I-0009 → I-0004` ✅
Last completion commit: `2a5a875` (I-0004 Platform Packaging & Installer).

### DGOS-I-0016 — IN PROGRESS, 2/7 tasks done
- ✅ **T-0051** — `InstallPlan` + `ReconciliationReport` protocol schemas.
  protocol `0.5.0 → 0.6.0`; compat additive (17 schemas, 2 added); 86 tests. Commit `5b6817c`.
- ✅ **T-0052** — Installer Engine scaffold at `engines/src/installer/`
  (`engine.ts` / `detector.ts` / `planner.ts` / `applier.ts` / `ports.ts` /
  `adapter/index.ts` / `index.ts`). `detect` / pure sync no-IO `plan` / IO `apply`.
  Separate `FsReadPort` (read) vs `ManagedWriter` (write) so write capability is
  unreachable from detect/plan. In-code `RepoState` / `DesiredState`;
  `INSTALLER_ENGINE_VERSION`. Stub bodies (empty mutations / all-skipped).
  engines `0.7.0 → 0.8.0`; 62 tests. Commit `07963f1`.
- ⬜ **T-0053 — NEXT** — repo-state detector behind injected `FsReadPort`
  (read-only; populates `RepoState`: repo_classification greenfield|existing,
  plugin presence, managed-region presence per target, lock declarations,
  last-run record ref). Recommended: **opus + high**.
- ⬜ **T-0054** — pure `plan()` planner with mutation/skip rules. opus + high.
- ⬜ **T-0055** — `ManagedWriter` port + dev-genie/katana write adapters
  (may need a thin wrapper export in dev-genie + a dev-genie version bump). opus + high.
- ⬜ **T-0056** — lock-aware managed-write applier emitting `ReconciliationReport`
  (conflict-not-clobber, idempotent). opus + high.
- ⬜ **T-0057** — fixture suite + bootstrap consumable seam. opus + medium.

All I-0016 work is in `engines/` → sequential, single package.

### Then (3): live dogfoods
- `protocol-proof`: `PROTOCOL_PROOF_LIVE_SDK_TESTS=1 npm run dogfood:live`
- `roles`: `ROLES_LIVE_SDK_TESTS=1`
- Uses the `.env.local` ANTHROPIC_API_KEY (gitignored — never print it).
- Capture committed evidence.

## Codex worker mechanics (for I-0016 tasks)

Prompts live in `/tmp/installer-codex/` (`PREAMBLE.md` + `T-00XX.md`). Pattern:
```
codex exec -C /Users/danielcassil/Code/dev-genie \
  -s workspace-write \
  -c sandbox_workspace_write.network_access=true \
  -c shell_environment_policy.inherit=all \
  -c 'shell_environment_policy.exclude=[]' \
  - < /tmp/installer-codex/T-0053.md > /tmp/installer-codex/T-0053.log 2>&1
```
Run in background. Then orchestrator verifies (engines typecheck/lint/test/build
green; detector stays read-only via FsReadPort), reverts daimyo/dist churn,
appends an orchestrator-verification status update to the task doc, transitions
task → completed, scope-commits (`.metis` + `engines` only).

## Open / parked (awaiting user decision)

- **DGOS-I-0014 decomposition** (tasks T-0024..0028) — created by an over-reaching
  subagent, left **parked & uncommitted**. Decision pending: revert / keep / decompose.
- Working tree has pre-existing `.metis` churn (ADRs, other initiative files) —
  untouched, not ours to commit.
- **Nothing has been pushed** anywhere.

## Key architecture facts (don't re-derive)

- pnpm workspace = 5 TS packages: `protocol`, `daimyo`, `roles`, `engines`,
  `protocol-proof`. Legacy plugins `katana`/`dev-genie`/`guardrails`/`audit` are
  NOT in the workspace.
- protocol: JSON Schema = source of truth → generated TS (never hand-edit
  `src/generated`). Gate = validate-schemas + check:codegen + check:compatibility + vitest.
- ADR-1 Engine contract: deterministic, typed I/O, NO model call in core.
  Pattern = pure core + isolated IO (decision-policy is the template; installer mirrors it:
  detect → pure `plan()` → IO `apply()` → report).
- Marketplace load model: plugins pulled from `main`, launched self-contained
  (`node ${CLAUDE_PLUGIN_ROOT}/bin/...`), NO install step → bundling required.
  Native-dep plugins (katana better-sqlite3, daimyo claude-agent-sdk binary) use
  ensure/recover launcher. Libraries do NOT commit dist; bundle-at-release inlines.
- daimyo ↔ roles cycle was broken: Roles-backed adapter lives in
  `roles/src/daimyo/roles-planning.ts` (daimyo stays Roles-agnostic).

## Resume by

Launching **T-0053** via Codex (in-order, auto-through-the-chain, no push), then
T-0054 → T-0057 to complete I-0016, then the (3) live dogfoods.
