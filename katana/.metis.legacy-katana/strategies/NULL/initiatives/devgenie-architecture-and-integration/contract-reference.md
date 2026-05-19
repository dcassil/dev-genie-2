# dev-genie Sub-plugin Contract Reference

This document captures the exact registry-row shape, install-check signal patterns, setup-command convention, and post-setup verification convention for the dev-genie orchestration framework. Future tasks can use this reference to author new sub-plugin entries without re-discovering these patterns.

## Source Files Read

- `/Users/danielcassil/Code/gaurd-rails-boilerplate/dev-genie/skills/orchestration/SKILL.md`
- `/Users/danielcassil/Code/gaurd-rails-boilerplate/dev-genie/skills/project-detection/SKILL.md`
- `/Users/danielcassil/Code/gaurd-rails-boilerplate/dev-genie/skills/existing-config-detection/SKILL.md`
- `/Users/danielcassil/Code/gaurd-rails-boilerplate/dev-genie/skills/reconcile/SKILL.md`

## Registry-Row Shape

Each entry in the Sub-plugin registry must specify all four required fields. Below are the exact patterns from the existing entries:

### 1. guardrails

- **Purpose**: architecture scaffolds + per-stack guard rails skills.
- **Install check**: a guardrails plugin is reachable. Practical signals: `${CLAUDE_PLUGIN_ROOT}/../guardrails/` exists, OR a `guardrails/` directory exists at the workspace root, OR the `/scaffold-architecture` slash command is registered. If none of these is true, instruct the user to install the `guardrails` plugin and pause.
- **Setup command**: `/scaffold-architecture <pattern>`. The pattern should be the `suggested_architecture` from project-detection if confidence is high; otherwise ask the user to choose from `react-next-vercel-webapp`, `node-api`, `supabase-api`, `supabase-node-rag`, or **skip** if the repo already has its own architecture.
- **Post-setup verification**: confirm that either (a) `eslint.config.mjs` and `tsconfig.json` from the chosen architecture exist in the target dir, or (b) the user explicitly skipped scaffolding because the repo already has a chosen architecture.
- **Notes**: `/scaffold-architecture` itself invokes the `universal-guard-rails` skill at the end. Do not duplicate that here. The universal skill now asks **Q3 — Edit-time lint feedback** (offer to install a `PostToolUse` hook on `Edit|Write|MultiEdit` that runs `guardrails/scripts/lint-edited-file.sh` via `.claude/settings.json`). **Q3 defaults to "yes"**: architecture skills install `eslint_d` as a devDependency, so the hook runs through the warm daemon (~50–150ms) instead of cold-start `eslint` (~1.2s). To disable hooks at any time set `"disableAllHooks": true` in `.claude/settings.json` (or `~/.claude/settings.json`); see Claude Code hooks documentation for the current disable mechanism.
- **Top-up for already-scaffolded repos**: if guardrails was scaffolded before the edit-time hook shipped, run `/guardrails-add-edit-hook` instead of re-scaffolding. It uses `dev-genie/lib/claude-settings-merger.mjs` (idempotency key: the `command` value `guardrails/scripts/lint-edited-file.sh`) to merge the hook entry into `.claude/settings.json` without touching unrelated content.

### 2. audit

- **Purpose**: composite-score scan + regression-blocking pre-commit hook.
- **Install check**: an audit plugin is reachable. Practical signals: `${CLAUDE_PLUGIN_ROOT}/../audit/` exists, OR an `audit/` directory exists at the workspace root, OR the `/audit-init` slash command is registered. If `.audit/audit.config.json` already exists in the target repo, treat audit as already-baselined and confirm with the user before re-running.
- **Setup command**: `/audit-init`.
- **Post-setup verification**: confirm `.audit/audit.config.json` and `.audit/audit.results.json` exist in the target repo, and that a pre-commit hook (typically `.git/hooks/pre-commit`) was installed and runs cleanly.

## Install-Check Signal Patterns

Three signal styles are used consistently across all entries to detect whether a sub-plugin is already installed:

1. **Plugin filesystem location**: `${CLAUDE_PLUGIN_ROOT}/../<name>/` exists (guardrails or audit plugin directory at the known plugins path).
2. **Workspace root directory**: a `<name>/` directory exists at the workspace root (local copy of the plugin).
3. **Slash command registration**: the `/<slash-command>` is registered and callable (e.g. `/scaffold-architecture` for guardrails, `/audit-init` for audit).

Verbatim from orchestration.md:

> a guardrails plugin is reachable. Practical signals: `${CLAUDE_PLUGIN_ROOT}/../guardrails/` exists, OR a `guardrails/` directory exists at the workspace root, OR the `/scaffold-architecture` slash command is registered. If none of these is true, instruct the user to install the `guardrails` plugin and pause.

> an audit plugin is reachable. Practical signals: `${CLAUDE_PLUGIN_ROOT}/../audit/` exists, OR an `audit/` directory exists at the workspace root, OR the `/audit-init` slash command is registered. If `.audit/audit.config.json` already exists in the target repo, treat audit as already-baselined and confirm with the user before re-running.

## Setup-Command Convention

Sub-plugins are invoked via slash commands. The orchestration skill does not directly call scripts; instead, it prompts the user to confirm and then invokes the slash command.

- **guardrails**: `/scaffold-architecture <pattern>`
- **audit**: `/audit-init`

Each slash command is responsible for its own internal flow, including user confirmation prompts and destructive action warnings.

## Post-Setup Verification Convention

After a sub-plugin's setup command completes, the orchestration skill verifies the installation by checking for specific files in the target repository:

**guardrails**:
- Confirm that either:
  - (a) `eslint.config.mjs` and `tsconfig.json` from the chosen architecture exist in the target dir, OR
  - (b) the user explicitly skipped scaffolding because the repo already has a chosen architecture.

**audit**:
- Confirm `.audit/audit.config.json` and `.audit/audit.results.json` exist in the target repo.
- Confirm a pre-commit hook (typically `.git/hooks/pre-commit`) was installed and runs cleanly.

## Greenfield vs Reconciliation Paths

**Greenfield path** (project_kind == greenfield): Walk the Sub-plugin registry in order, running the install check for each entry. If already installed, ask the user whether to re-run or skip. Confirm before invoking the setup command, run post-setup verification, and report results. After all entries succeed, run the Final-state checklist and report any unmet items.

**Reconciliation path** (project_kind == existing): Invoke the `existing-config-detection` skill to produce a structured detection report of the repo's current lint/ts/format/hook/CI/audit state. Then invoke the `reconcile` skill to compare detected state against the recommended baseline, classify findings by severity, prompt the user to resolve any agent-config locks, and apply chosen changes. The reconciliation path supersedes the registry walk for existing repos.

## Final-State Checklist

After walking the registry (greenfield path) or finishing the reconciliation path, the orchestration skill verifies the project ends up with the following:

- [ ] guardrails skills are reachable (the user can invoke `/scaffold-architecture` and the per-architecture skill for their chosen pattern), OR the user explicitly opted out of scaffolding.
- [ ] An architecture is chosen for the project, or the user explicitly chose to skip.
- [ ] `.audit/audit.config.json` exists and contains thresholds.
- [ ] `.audit/audit.results.json` exists with a baseline scan.
- [ ] A pre-commit hook is installed and runs the audit re-scan on commit.
- [ ] Q3 (edit-time ESLint `PostToolUse` hook) was offered. If accepted, `.claude/settings.json` contains a `PostToolUse` entry whose `command` is `guardrails/scripts/lint-edited-file.sh`, and `guardrails/scripts/lint-edited-file.sh` exists in the repo. If declined or skipped, recommend `/guardrails-add-edit-hook` as the top-up.

Additional checks for the **reconciliation path**:

- [ ] Either `eslint.config.guardrails.mjs` (layered) is present OR a managed override block is written in the user's existing eslint config.
- [ ] All agent-config locks surfaced during reconcile are resolved (skip / lift-temp / lift-perm).
- [ ] When a CI workflow is present, it runs `lint` and `typecheck`; otherwise dev-genie wrote `.github/workflows/dev-genie-guardrails.yml`.
- [ ] `.dev-genie/init.last-run.json` exists so re-runs can diff against it.

**Note**: Adding a new sub-plugin may require a new line under this Final-state checklist section in the orchestration skill to verify the new plugin's output.

## Adding a New Sub-Plugin

When creating a new sub-plugin entry in the orchestration registry:

1. Append a new numbered entry to the **Sub-plugin registry**. Choose its position carefully — entries earlier in the list run first, and any entry that consumes results from another plugin must come after it.
2. Each entry must specify all four required fields:
   - **Purpose**: one-sentence description of what the sub-plugin does.
   - **Install check**: three-signal pattern (plugin filesystem, workspace root dir, or slash command) to detect if already installed.
   - **Setup command**: the slash command to invoke (e.g. `/my-plugin-init`).
   - **Post-setup verification**: file-existence checks or other concrete signals to confirm successful setup.
3. Optional fields include **Notes** (special behavior, defaults, top-up commands) and **Top-up for already-scaffolded repos** (alternative commands for repos that have partial setup).
4. If the new plugin needs to influence the final-state checklist, add a line there too.
5. Do not introduce a separate config file or registry format. The registry is the orchestration.md markdown file by design — one place to edit, no parsing.
