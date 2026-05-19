# Smoke-Test Plan: dev-genie init Offering Katana

## Overview

This manual, step-by-step smoke-test plan validates the wiring shipped in KAT-T-0022..0025. It tests that `dev-genie init` in a fresh repo correctly detects greenfield projects, walks the plugin registry, and surfaces katana as an optional install. The test does NOT require katana implementation; it stops at the "katana offered" step if `/katana-init` does not yet exist.

## Smoke-Test Checklist

- [ ] **1. Setup** — Create a temporary test repo and verify plugin availability.
  - Run `mkdir /tmp/katana-smoke && cd /tmp/katana-smoke && git init`.
  - Verify that the `dev-genie`, `guardrails`, and `audit` plugins are reachable (check `${CLAUDE_PLUGIN_ROOT}/../<name>/` or slash command availability).
  - Reference: `/Users/danielcassil/Code/gaurd-rails-boilerplate/dev-genie/skills/orchestration/SKILL.md` § "How to use this skill"

- [ ] **2. Run dev-genie** — Invoke dev-genie init and confirm greenfield detection.
  - In the test repo, run `/dev-genie-init`.
  - Confirm that dev-genie does NOT take the reconciliation path (i.e., no `.audit/` or `eslint.config.mjs` exists yet).
  - Confirm that project-detection reports `project_kind == greenfield`.
  - Reference: `/Users/danielcassil/Code/gaurd-rails-boilerplate/dev-genie/skills/project-detection/SKILL.md` § "Step 2 — classify project_kind"

- [ ] **3. Walk registry** — Confirm dev-genie walks sub-plugin entries in order: guardrails → audit → katana.
  - Observe the dev-genie orchestration flow (either via console logging or CLI output) as it steps through each entry.
  - Confirm that entry 1 is `guardrails`, entry 2 is `audit`, and entry 3 is `katana`.
  - Verify that entries are processed in this strict order (guardrails must complete before audit).
  - Reference: `/Users/danielcassil/Code/gaurd-rails-boilerplate/dev-genie/skills/orchestration/SKILL.md` § "Sub-plugin registry (ordered)"

- [ ] **4. Katana offer** — Confirm dev-genie surfaces a yes/no prompt for katana.
  - Observe that dev-genie asks the user whether to install katana.
  - Confirm that the prompt defaults per the `suggests_katana` signal from project-detection (default: "no" for a fresh greenfield repo unless other signals are present).
  - Confirm that the prompt text references katana's purpose: "agent-driven kanban workflow that decomposes work product-doc → epic → story → task."
  - Reference: `/Users/danielcassil/Code/gaurd-rails-boilerplate/dev-genie/skills/orchestration/SKILL.md` § "3. katana" and `/Users/danielcassil/Code/gaurd-rails-boilerplate/dev-genie/skills/project-detection/SKILL.md` § "Step 4 — katana detection"

- [ ] **5. If katana plugin available** — Accept the prompt and confirm `/katana-init` is invoked successfully.
  - If the katana plugin is installed and `/katana-init` is available, respond "yes" to the katana prompt.
  - Confirm that dev-genie invokes `/katana-init` (the same setup command as the standalone path).
  - After `/katana-init` completes, confirm that `.katana/config.toml` and `.katana/vision.md` exist in the test repo.
  - Run `claude mcp list` and confirm that the katana MCP server is registered and visible.
  - Reference: `/Users/danielcassil/Code/katana/.metis/strategies/NULL/initiatives/devgenie-architecture-and-integration/install-paths.md` § "dev-genie path" and `/Users/danielcassil/Code/gaurd-rails-boilerplate/dev-genie/skills/orchestration/SKILL.md` § "3. katana" (Post-setup verification)

- [ ] **6. If katana plugin NOT available** — Confirm graceful degradation and user messaging.
  - If the katana plugin is not reachable (signals from `/Users/danielcassil/Code/gaurd-rails-boilerplate/dev-genie/skills/orchestration/SKILL.md` § "Install check" are all false), confirm that dev-genie detects this and pauses with a documented user message.
  - Confirm the message instructs the user to install the katana plugin and offers `/katana-init` as the follow-up command.
  - Confirm that the test does not attempt to invoke `/katana-init` if the plugin is not available.
  - Reference: `/Users/danielcassil/Code/gaurd-rails-boilerplate/dev-genie/skills/orchestration/SKILL.md` § "3. katana" (Install check)

- [ ] **7. Final-state checklist** — Confirm each item from orchestration's Final-state checklist is reported.
  - After the registry walk completes (or the katana-not-available branch is taken), confirm dev-genie runs the Final-state checklist and reports all items.
  - Verify that the two new katana lines are included:
    - "If katana was offered and accepted: `.katana/config.toml` and `.katana/vision.md` exist, and `claude mcp list` shows the katana MCP server."
    - "If katana was declined: the orchestration log records the decline and recommends `/katana-init` as a follow-up command."
  - Confirm that each checklist item is reported with a pass/fail status.
  - Reference: `/Users/danielcassil/Code/gaurd-rails-boilerplate/dev-genie/skills/orchestration/SKILL.md` § "Final-state checklist"

## Notes for Test Runner

- This test is **manual and human-runnable**; it does not require automation or CI integration.
- If `/katana-init` does not yet exist, proceed through step 6 and confirm that dev-genie handles the absence gracefully.
- The test validates the **wiring** (install check signals, registry walk order, prompt flow) rather than katana's internal implementation.
- Each step should be marked complete once the observed behavior matches the spec.
- If any step fails, check the referenced file and file a new task (e.g., `KAT-T-XXXX`) rather than modifying this task.
