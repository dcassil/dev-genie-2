---
id: repository-restructure-and-plugin
level: initiative
title: "Repository Restructure and Plugin Boundary Cleanup"
short_code: "DGOS-I-0001"
created_at: 2026-05-19T16:56:49.168684+00:00
updated_at: 2026-05-19T16:56:49.168684+00:00
parent: DGOS-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/discovery"


exit_criteria_met: false
estimated_complexity: S
strategy_id: NULL
initiative_id: repository-restructure-and-plugin
---

# Repository Restructure and Plugin Boundary Cleanup Initiative

## Context

The repository previously had `katana/` as a standalone package and a misspelled `gaurd-rails-boilerplate/` wrapper containing `dev-genie/`, `guardrails/`, `audit/`, and its own Metis workspace. The current restructure promotes those plugin directories to first-class top-level folders and preserves legacy Metis workspaces for reference.

## Goals & Non-Goals

**Goals:**
- Make top-level plugin names match the intended system boundaries: `katana/`, `dev-genie/`, `guardrails/`, and `audit/`.
- Preserve legacy Metis data under temporary names so prior vision/task context is not lost.
- Establish the parent `.metis/` workspace as the current strategic source of truth.
- Keep existing package/plugin code intact during the move.

**Non-Goals:**
- Rewrite plugin internals during this initiative.
- Convert all docs and code references in one pass unless they break local usage.
- Delete the legacy wrapper repository before its remaining state is reviewed.

## Detailed Design

Initial filesystem target:

```text
dev-genie/
guardrails/
audit/
katana/
legacy-guardrails-boilerplate/
katana/.metis.legacy-katana/
legacy-guardrails-boilerplate/.metis.legacy-dev-genie/
.metis/
```

The parent `.claude-plugin/marketplace.json` continues to describe the sibling plugin suite. Future cleanup can decide whether Katana remains a separate package repo or whether this parent becomes a monorepo with workspace tooling.

## Alternatives Considered

- Keep the misspelled wrapper: rejected because the typo and nested structure obscure plugin boundaries.
- Move everything under `.ai-os/`: rejected for now because Katana already provides the kernel primitives and top-level plugin folders are clearer for development.
- Delete old Metis folders: rejected because they preserve source context for the consolidated vision.

## Implementation Plan

- [x] Rename `katana/.metis` to `katana/.metis.legacy-katana`.
- [x] Rename the old Dev-Genie workspace to `legacy-guardrails-boilerplate/.metis.legacy-dev-genie`.
- [x] Promote `dev-genie/`, `guardrails/`, and `audit/` to top-level directories.
- [x] Rename the old misspelled wrapper to `legacy-guardrails-boilerplate/`.
- [ ] Review stale documentation paths and update only the ones that describe repository layout rather than host-repo install paths.
- [ ] Decide whether to add monorepo package tooling at the parent level.