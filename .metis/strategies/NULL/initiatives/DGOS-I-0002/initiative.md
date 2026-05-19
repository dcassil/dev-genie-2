---
id: artifact-protocol-and-document
level: initiative
title: "Artifact Protocol and Document Engine"
short_code: "DGOS-I-0002"
created_at: 2026-05-19T16:57:05.709267+00:00
updated_at: 2026-05-19T16:57:05.709267+00:00
parent: DGOS-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/discovery"


exit_criteria_met: false
estimated_complexity: L
strategy_id: NULL
initiative_id: artifact-protocol-and-document
---

# Artifact Protocol and Document Engine Initiative

## Context

Katana already has markdown/YAML documents, short codes, SQLite-backed storage, templates, gates, and MCP CRUD tools. The target system needs those primitives generalized into a shared artifact protocol that all role plugins can consume and produce.

## Goals & Non-Goals

**Goals:**
- Define the common artifact metadata contract: status, confidence, missing context, human review flag, source artifacts, output artifacts, and skip reason.
- Extend Katana document/frontmatter schemas to support dependency graph, execution profile, sibling artifacts, decision records, validation reports, and execution records.
- Keep artifacts repo-native and easy for humans to inspect.
- Provide migration paths from legacy Katana and Dev-Genie Metis documents.

**Non-Goals:**
- Implement every artifact type in the first pass.
- Replace Metis as the strategic workspace.
- Build role-specific planning logic inside the document engine.

## Detailed Design

The MVP artifact chain is Vision -> ProductDoc -> Epic -> Story -> TaskSet -> Task -> ExecutionRecord, with supporting RepoProfile, ArchitectureImpact, FrontendPlan, BackendPlan, QualityPlan, DecisionRequest, DecisionRecord, and InsightNote.

Every artifact must be validatable without model interpretation. Markdown carries the human-readable body; YAML frontmatter carries machine-readable routing and lifecycle data.

## Alternatives Considered

- Keep separate schemas per plugin: rejected because orchestration would require adapter glue for every handoff.
- Store artifacts only in SQLite: rejected because repo-native files are the durable memory humans and agents can review.
- Make all artifacts Katana tasks: rejected because planning, design, architecture, and validation artifacts need different lifecycle semantics.

## Implementation Plan

- [ ] Extend Katana Frontmatter and schema docs with shared artifact metadata.
- [ ] Add typed supporting artifact kinds required for the existing-repo major feature MVP.
- [ ] Add validation gates for artifact metadata completeness and skip result correctness.
- [ ] Add legacy import notes for katana/.metis.legacy-katana and legacy-guardrails-boilerplate/.metis.legacy-dev-genie.
- [ ] Document the artifact contract for plugin authors.
