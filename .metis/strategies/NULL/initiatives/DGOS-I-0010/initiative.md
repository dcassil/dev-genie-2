---
id: platform-packaging-and-installer
level: initiative
title: "Platform Packaging and Installer Reconciliation"
short_code: "DGOS-I-0010"
created_at: 2026-05-19T16:57:34.145209+00:00
updated_at: 2026-05-19T16:57:34.145209+00:00
parent: DGOS-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/discovery"


exit_criteria_met: false
estimated_complexity: M
strategy_id: NULL
initiative_id: platform-packaging-and-installer
---

# Platform Packaging and Installer Reconciliation Initiative

## Context

The ecosystem now has top-level plugin folders, a parent marketplace, Katana platform adapters, and Dev-Genie init/reconcile logic. Packaging needs to reflect the new structure without breaking standalone plugin installation.

## Goals & Non-Goals

**Goals:**
- Make plugin marketplace metadata correct for top-level dev-genie, guardrails, audit, and katana.
- Keep Katana standalone-first with its own package build and platform adapters.
- Make Dev-Genie init detect sibling plugins from the new layout.
- Preserve existing host-repo install paths used by generated hooks and docs.

**Non-Goals:**
- Publish packages in this initiative.
- Collapse all plugins into one package.
- Rewrite Claude/Cursor/Codex adapters beyond path correctness.

## Detailed Design

Parent-level plugin discovery should point to sibling directories. Dev-Genie remains the first user entry point for setup. Katana remains the execution kernel and can be installed independently. Guardrails and Audit remain installable without Dev-Genie.

Stale path cleanup should distinguish repository source layout from host-repo installed layout; references such as guardrails/scripts/lint-edited-file.sh are still valid when copied into a target repo.

## Alternatives Considered

- Put all plugins under plugins/: deferred because current top-level names are simpler and match user-facing boundaries.
- Make Dev-Genie depend on Katana at runtime immediately: rejected until MVP flow proves the contract.
- Delete standalone marketplace files: rejected because each plugin should remain independently publishable.

## Implementation Plan

- [ ] Review parent .claude-plugin/marketplace.json after the move.
- [ ] Update Dev-Genie plugin discovery docs for the new source layout.
- [ ] Decide whether Katana should be added to the parent marketplace or remain separate.
- [ ] Add a root README describing the plugin boundaries.
- [ ] Add optional workspace tooling only after package ownership is settled.
