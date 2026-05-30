---
id: package-boundaries-handoff-cleanup
level: initiative
title: "Package Boundaries & Handoff Cleanup"
short_code: "DGOS-I-0003"
created_at: 2026-05-21T17:42:28.255873+00:00
updated_at: 2026-05-21T17:42:28.255873+00:00
parent: DGOS-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/discovery"


exit_criteria_met: false
estimated_complexity: M
strategy_id: NULL
initiative_id: package-boundaries-handoff-cleanup
---

# Package Boundaries & Handoff Cleanup Initiative

## Context

The original initiative set mixed runtime contracts with package boundaries and still relied on prompt-only handoffs in several places. After the primitive split and Role invocation ADR, package ownership and handoff mechanisms need to be made explicit.

This initiative owns the cleanup needed so package boundaries reflect the new architecture and handoffs use typed runtime contracts rather than informal prompt expansion.

## Goals & Non-Goals

**Goals:**
- Clarify package boundaries across `dev-genie`, `katana`, `guardrails`, and `audit`.
- Remove prompt-only role handoff patterns from architectural plans and implementation surfaces.
- Ensure runtime routing names primitives, not packages.
- Preserve standalone usability for Katana, Guardrails, and Audit.

**Non-Goals:**
- Redesign the artifact protocol itself.
- Implement every Role or Loop.
- Collapse packages into one repo-local runtime.

## Architecture

### Overview

Package boundaries should align with the architectural ownership model: Katana is document-scoped, Guardrails owns architecture constraints, Audit owns quality scanning, and Dev-Genie owns meta-level setup and orchestration glue.

### Sequence Diagrams

A typical handoff should be: Loop decides it needs a Role or Engine -> invokes the primitive through its typed contract -> records the result. The package providing that primitive is an installation detail, not the runtime contract.

## Detailed Design

The work falls into two buckets:

- boundary cleanup: remove or rewrite plans that imply one package owns strategy, validation, audit, and orchestration simultaneously
- handoff cleanup: replace vague prompt inheritance and role simulation language with subprocess Role runner and typed artifact handoffs

This initiative should also produce explicit guidance for contributors so new work uses `Engine`, `Role`, and `Loop` vocabulary consistently.

### Target ownership model

The default package boundary direction should be:

- `dev-genie`: owns bootstrap flow, autonomy-profile capture and persistence, top-level loop coordination, decision-policy integration, role-runner integration, and cross-package wiring
- `katana`: owns document structures, project-workflow state, markdown/frontmatter persistence, document decomposition, and document-scoped validation only
- `guardrails`: owns deterministic architecture and policy-rule checks that can be invoked as validation adapters, but not completion authority or product decisions
- `audit`: owns audit scans, audit evidence collection, and audit-oriented reports, but not loop control or completion authority

The autonomy profile introduced in `DGOS-A-0004` belongs to `dev-genie` bootstrap and governance configuration, not to Katana documents and not to the validation or audit packages.

### Handoff rules

Package handoffs should follow these rules:

- runtime records name primitives and typed artifacts, not package names
- cross-package calls use typed artifact contracts or explicit adapter interfaces, never raw prompt inheritance
- Katana may persist artifacts and project state, but it does not become the owner of loop policy or autonomy configuration
- Guardrails and Audit return structured results that parent validation and loop layers consume; they do not decide completion themselves

### Boundary examples

Example ownership map:

```json
{
  "dev_genie": [
    "bootstrap_sequence",
    "autonomy_profile",
    "loop_runtime",
    "decision_policy_binding",
    "role_runner_binding"
  ],
  "katana": [
    "document_store",
    "phase_model",
    "decomposition_records",
    "document_lint"
  ],
  "guardrails": [
    "architecture_rules",
    "boundary_checks",
    "policy_rule_adapters"
  ],
  "audit": [
    "audit_scans",
    "audit_reports",
    "quality_signal_collection"
  ]
}
```

Example handoff chain:

```text
Loop decides parent validation is required -> Validation Engine invokes Guardrails and Audit adapters -> adapters return typed reports -> parent Loop records the ValidationReport and decides completion or rework
```

These examples are directional rather than final implementation names, but they make the package split concrete enough to guide later design and code organization.

## Alternatives Considered

- Keep package boundaries informal and fix only the docs: rejected because the confusion would reappear during implementation.
- Keep prompt-only handoffs for speed: rejected because they undermine inspectability, replay, and durable runtime state.
- Move everything into Dev-Genie as the top-level runtime package: rejected because it conflicts with the standalone-usability requirement for the other packages.

## Implementation Plan

- [ ] Define package ownership rules consistent with the vision and ADRs.
- [ ] Identify and rewrite prompt-only handoff surfaces.
- [ ] Document primitive-vs-package naming rules for contributors.
- [ ] Add checks or fixture coverage for boundary regressions where practical.
- [ ] Reconcile package-level docs and examples with the new runtime model.