---
name: dev-genie-managed-repo-conventions
description: Use BEFORE editing files in any repo where dev-genie is installed — look for `.dev-genie/init.last-run.json`, `eslint.config.guardrails.mjs`, `.audit/audit.config.json`, or `<!-- dev-genie:*:begin/end -->` / `<!-- katana:*:begin/end -->` markers. Explains which files are managed by dev-genie, how layered files / JSON-merged files / fenced managed regions / locks work, and how to make intentional overrides survive a rerun of `/dev-genie-init`.
---

# Working in a dev-genie'd repo

If this repo has dev-genie installed, several files are *managed* — dev-genie owns them, and a future `/dev-genie-init` rerun reconciles them against the baseline. Editing them by hand without understanding the boundaries will cause one of:

- A clean rerun reports your edit as **drift / conflict** (correct behavior; dev-genie refuses to silently clobber your edit).
- Your edit gets re-applied on every rerun (wasted effort).
- Worse, you fight the baseline session after session.

This skill teaches the boundaries.

## Is this repo dev-genie'd?

Any **one** of these existing is enough:

- `.dev-genie/init.last-run.json` (the idempotency record)
- `eslint.config.guardrails.mjs` (layered ESLint baseline)
- `.audit/audit.config.json` (audit baseline)
- Any file containing `<!-- dev-genie:<feature>:begin/end -->` or `<!-- katana:begin/end -->` markers

If none of those exist, this skill does not apply — edit freely.

## The four kinds of managed surface

### 1. Layered files (owned entirely by dev-genie)

**Examples:** `eslint.config.guardrails.mjs`

**Rule:** **do not edit by hand.** This file is the baseline layer. Override it by extending it in your own ESLint config (the layered pattern keeps your customizations untouched while dev-genie owns the baseline). If you genuinely need the baseline itself to change, either:
- change the architecture (`/scaffold-architecture` or rerun `/dev-genie-init` with a different baseline), or
- add a **lock** for the specific rule you need to keep custom (see §4 below).

### 2. JSON-merged files (yours; dev-genie merges specific keys)

**Examples:** `.claude/settings.json` (specifically the `hooks.PostToolUse` array), `tsconfig.json` (specific compiler options), `package.json` scripts that dev-genie sets up.

**Rule:** **edit freely.** dev-genie merges its keys idempotently and leaves your keys alone. If you delete one of dev-genie's keys, a rerun will restore it unless you've added a lock.

### 3. Fenced managed regions (one file, mixed ownership)

**Pattern:** `<!-- dev-genie:<feature>:begin -->` … `<!-- dev-genie:<feature>:end -->` (or the `<!-- katana:begin/end -->` variant).

**Found in:** `CLAUDE.md` most commonly. Occasionally in other config files or scripts.

**Rule:** **edit outside the fences freely. Do NOT edit inside the fences.** If you do, dev-genie's reconciliation detects the drift and emits `status: conflict` for that region — it will not silently overwrite your edit. Your options:
- Revert your inside-fence edit and put the content outside the fence instead.
- Add a lock if your edit is intentional and you want it to survive future reruns.

The fenced-region writers replace only what's between the markers; everything outside is untouched on every rerun.

### 4. Locks — your overrides, made first-class

**Where they live:** typically in `CLAUDE.md`, parsed by dev-genie's apply-flow into `{ pattern, reason, sourceLine }`. The interactive `/dev-genie-init` prompt also offers to add locks for findings you choose to keep custom.

**Rule:** **locks are the right escape valve when you intentionally diverge from the baseline.** Use them. The next rerun reports locked targets as `blocked` (not `applied`) — which is correct and intentional. A lock without a clear `reason` will frustrate the next person; always include one.

A lock is a contract: "yes, I know dev-genie wants X here; I want Y; don't reconcile this until I explicitly lift the lock."

## Before-you-edit checklist

When about to write to any of these files:

1. **Is it in the managed list above?** If no → edit freely; you're done.
2. **Is it layered (`eslint.config.guardrails.mjs`)?** Don't edit; extend the layer in your own ESLint config.
3. **Is it JSON-merged (`.claude/settings.json`, `tsconfig.json`)?** Your keys are safe; edit them.
4. **Does it have fenced markers?** Only edit outside the fences. If you need to change something inside, add a lock or change the baseline.
5. **Do you genuinely need a baseline override?** Add a lock with a clear `reason:` rather than fighting the baseline session after session.

## The idempotency record

`.dev-genie/init.last-run.json` stores:

- A fingerprint of the repo state at the last apply.
- The set of managed mutations that were applied.

**Don't delete it.** If you do, the next `/dev-genie-init` still works, but it loses its baseline reference for drift detection — it can no longer tell intentional edits apart from drift as confidently. (The detector falls back to baseline-vs-current comparison instead of baseline-vs-last-applied.)

If you need to "reset" the dev-genie state on a repo, the right move is to remove the lock entries you no longer want and rerun `/dev-genie-init` — not to delete the last-run record.

## When in doubt

**Re-run `/dev-genie-init`.** It is idempotent:

- If nothing changed → all-skip report, no writes.
- If you drifted → conflict findings, no writes, clear next step.
- If you missed an upgrade → stale/update findings, applies cleanly.

The cost of a rerun is approximately zero. The cost of guessing at the boundaries is high. When unsure, rerun and read the report.

## Status taxonomy you'll see in reports

| Status     | Meaning                                                                                       |
|------------|-----------------------------------------------------------------------------------------------|
| `applied`  | dev-genie wrote a managed file or merged a managed region.                                    |
| `skipped`  | Already at desired state (idempotent skip). No write happened.                                |
| `blocked`  | Target is locked. No write happened. This is intentional — your lock did its job.             |
| `conflict` | Managed region drifted from baseline (user-edited). No write happened. **You decide next.**   |

`conflict` is never silent — it requires you to choose: revert, lock, or change the baseline.
