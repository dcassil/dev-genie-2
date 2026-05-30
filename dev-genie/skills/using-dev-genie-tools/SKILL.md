---
name: using-dev-genie-tools
description: Use when starting work in a repo and you need to know which dev-genie ecosystem tools (dev-genie / guardrails / audit / katana / daimyo / roles) are available, what each does today, and when to reach for each. Read this BEFORE invoking marketplace setup commands so you pick the right starting point and don't reach for capabilities that aren't wired yet.
---

# Using dev-genie tools

This is the orientation map for the dev-genie ecosystem. It is honest about what works today and what is built-but-not-wired-yet. Read this when:

- You are setting up a repo for the first time and don't know where to start.
- A user asks "what can dev-genie do" / "what tools are available."
- You are unsure whether to reach for katana, audit, or daimyo for a given task.
- You are working in a repo and want to know if dev-genie is already managing parts of it.

## Step 1 — quick detection (what's already here?)

Before recommending anything, check what's already in place at the repo root:

| If you see…                                       | The repo is…                                                              |
|---|---|
| `.dev-genie/init.last-run.json`                   | already dev-genie'd; rerun of `/dev-genie-init` is safe and idempotent    |
| `eslint.config.guardrails.mjs`                    | guardrails baseline applied (layered ESLint config)                       |
| `<!-- dev-genie:*:begin/end -->` markers anywhere | has managed regions — read `dev-genie-managed-repo-conventions` skill     |
| `<!-- katana:begin/end -->` markers anywhere      | has katana-managed regions                                                |
| `.audit/audit.config.json`                        | audit baseline installed; `/audit-run` produces a quality score           |
| Pre-commit hook referencing `audit`               | audit pre-commit gate active                                              |
| A `.katana/` dir or a `katana.sqlite` file        | katana work tracking active                                               |

If none of those exist, this is a fresh repo from dev-genie's perspective — `/dev-genie-init` is the right first move.

## Step 2 — the map: when to reach for each tool

### `dev-genie` — `/dev-genie-init`

**Use when:** any repo where you want consistent lint / types / hooks / Claude settings across machines and sessions.

**What it actually does today:** detects greenfield vs existing repo, asks for an architecture baseline (one of `node-api`, `react-next-vercel-webapp`, `supabase-api`, `supabase-node-rag`), then layers in ESLint baseline, TypeScript settings, `.claude/settings.json` hooks, the audit baseline, and a pre-commit hook. Idempotent rerun via `.dev-genie/init.last-run.json`. Conflict-not-clobber: hand-edited managed regions are reported, never overwritten.

**Don't reach for it when:** the repo is a throwaway script, or you intentionally want full custom control over linting and don't want any baseline.

### `guardrails`

**Use indirectly** via `/dev-genie-init` — it owns the four architecture baselines.

**Use directly** via `/scaffold-architecture` only if you want to layer an additional baseline on top of an existing one. Advanced; rarely needed.

### `audit` — `/audit-init`, `/audit-run`

**Use when:** any real project where quality drift matters. `/audit-run` produces a composite quality score (lint, types, tests, security) — concrete leverage for "are we getting better or worse." `/audit-init` is typically run for you by `/dev-genie-init`; you only call it directly to re-baseline.

**Don't reach for it when:** prototypes where the score is noise.

### `katana` — `/katana-board`, `/katana-decompose`, `/katana-work`, `/katana-validate`

**Use when:** multi-week work where decomposing into product-doc → epic → story → 2-pass task genuinely helps. The two-pass (high-pass design / low-pass implementation) task model is the actual value.

**Don't reach for it when:**
- The repo already uses Metis or another work tracker — pick one, don't run both.
- The work is small enough that decomposition overhead exceeds the planning value.

### `daimyo` (MCP server; advanced)

**Use when:** you have a long-running task you want supervised by a govern-verify loop, or you are building tooling on top of daimyo's supervisor substrate.

**Don't reach for it as a first move.** It is not "Claude with extra steps." It's a supervisor substrate; most workflows don't need it.

### `roles` — `role-invoke` CLI (experimental)

**Use when:** experimenting with the Architect / Planner / QualityGovernor role contracts. There is a known v0.x schema-conformance gap where the live model's output does not fully match the `ArchitectureImpact` artifact schema.

**Don't reach for it as a daily tool.** Treat as research surface.

## Step 3 — decision tree

```
Fresh repo, nothing in place?
    → /dev-genie-init  (pick an architecture baseline)
    → /audit-run       (capture a starting score)

Existing repo, no dev-genie installed?
    → /dev-genie-init  (it reconciles to the baseline; respects locks
                        for things you intentionally keep custom)

Existing repo, dev-genie already present, suspect drift?
    → /dev-genie-init  (idempotent — no-op if nothing changed,
                        explicit findings if there's drift)

Need to decompose larger work?
    → /katana-decompose  (only if no other tracker is in this repo)

Want a quality number / track drift over time?
    → /audit-run

Long autonomous task that needs supervision?
    → daimyo MCP server (advanced; read daimyo's README first)
```

## Things NOT to do

- Do not edit `eslint.config.guardrails.mjs` by hand. Override by extending the layer in your own ESLint config, or add a lock if you really need the baseline to change.
- Do not edit content inside `<!-- dev-genie:*:begin/end -->` or `<!-- katana:*:begin/end -->` markers. Read the `dev-genie-managed-repo-conventions` skill first.
- Do not run `/dev-genie-init` and then immediately rewrite the files it managed — the next rerun will surface that as a conflict (it correctly will not clobber).
- Do not delete `.dev-genie/init.last-run.json` — it is the idempotency fingerprint.
- Do not run katana alongside another work tracker (Metis, Jira-as-files, etc.) in the same repo.

## What's NOT available yet (so you don't go looking)

- No single `/bootstrap` command that runs the whole sequence in one shot. Bootstrap (DGOS-I-0012) is planned. For now: `/dev-genie-init`, then `/audit-run`, then optionally add katana — three explicit steps.
- No autonomous role-chaining workflow. Architect / Planner / QualityGovernor are individually callable but not orchestrated.
- The new InstallerEngine in `engines/` is built and tested, but `/dev-genie-init` still uses its legacy detect/apply path. Same behavior, different internals — no agent-facing difference yet.
- No automated plugin-version bumping. When you change a plugin's code, bump its version in both `<plugin>/.claude-plugin/plugin.json` and `<plugin>/package.json` and tell users to `/plugin update <name>`.
