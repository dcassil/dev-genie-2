---
id: validation-engine-completion
level: initiative
title: "Validation Engine & Completion Authority"
short_code: "DGOS-I-0008"
created_at: 2026-05-21T17:45:11.486781+00:00
updated_at: 2026-05-21T17:45:11.486781+00:00
parent: DGOS-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/discovery"


exit_criteria_met: false
estimated_complexity: L
strategy_id: NULL
initiative_id: validation-engine-completion
---

# Validation Engine & Completion Authority Initiative

## Context

The retro exposed a core weakness in the old model: completion was too easy to assert and too hard to verify. Structural document validation alone is not enough, and `exit_criteria_met` must represent an authoritative validation result rather than an agent claim.

This initiative rewrites the original validation work around one stronger rule: the Validation Engine owns the completion decision.

## Goals & Non-Goals

**Goals:**
- Run the same validation engine at leaf and parent scopes.
- Produce `ValidationReport` artifacts that drive completion decisions.
- Aggregate lint, tests, acceptance-criteria checks, build checks, audit signals, and architecture-rule checks where relevant.
- Make `exit_criteria_met` reflect authoritative validation output.

**Non-Goals:**
- Let executing agents self-certify completion.
- Own decomposition or decision routing logic.
- Replace the Audit or Guardrails packages as separate deterministic owners.

## Architecture

### Overview

Validation is one Engine with two invocation scopes:

- leaf scope: fast, narrow validation on the leaf's own changes
- parent scope: authoritative validation across the parent's owned work surface

### Sequence Diagrams

Leaf finishes local work -> runs narrow validation -> returns a claim -> parent runs authoritative validation -> emits `ValidationReport` -> completion or rework decision follows.

## Detailed Design

The Validation Engine should support adapters for:

- document gates
- lint and type checks
- tests and build checks
- acceptance-criteria verification hooks
- Guardrails rule checks
- Audit scan integration

It should record enough structured detail for retries, rework loops, and post-hoc inspection. Audit should start at the epic level and move lower only if experience shows that is necessary.

### Validation examples

The first concrete validation pass should define one report shape used at both leaf and parent scopes, with parent scope remaining authoritative for completion.

Example leaf-local validation report:

```json
{
  "validation_report_id": "validation-local-task-admin-settings-save-003",
  "scope": "leaf",
  "subject_loop_id": "task-admin-settings-save",
  "subject_surfaces": {
    "owns_files": [
      "src/features/admin/settings/data/save.ts",
      "src/routes/api/admin/settings.ts"
    ],
    "owns_interfaces": [
      "PUT /api/admin/settings"
    ]
  },
  "checks": [
    {
      "check_type": "lint",
      "status": "passed"
    },
    {
      "check_type": "targeted_tests",
      "status": "passed",
      "evidence_ref": "test-run-admin-settings-save-003"
    }
  ],
  "overall_status": "passed",
  "completion_authority": "non_authoritative",
  "recommended_next_action": "bubble_done_to_parent"
}
```

Example parent authoritative validation report:

```json
{
  "validation_report_id": "validation-parent-story-admin-settings-save-002",
  "scope": "parent",
  "subject_loop_id": "story-admin-settings-save",
  "subject_surfaces": {
    "owns_interfaces": [
      "PUT /api/admin/settings"
    ],
    "owns_workflow_steps": [
      "admin-settings:save"
    ]
  },
  "checks": [
    {
      "check_type": "integration_tests",
      "status": "passed",
      "evidence_ref": "integration-admin-settings-save-002"
    },
    {
      "check_type": "acceptance_criteria",
      "status": "passed"
    },
    {
      "check_type": "audit_scan",
      "status": "passed"
    }
  ],
  "overall_status": "passed",
  "completion_authority": "authoritative",
  "exit_criteria_met": true,
  "recommended_next_action": "mark_parent_complete"
}
```

Example authoritative rework result:

```json
{
  "validation_report_id": "validation-parent-story-admin-settings-save-003",
  "scope": "parent",
  "subject_loop_id": "story-admin-settings-save",
  "checks": [
    {
      "check_type": "integration_tests",
      "status": "failed",
      "diagnostic": "save succeeds but reload path still shows stale state"
    }
  ],
  "overall_status": "failed",
  "completion_authority": "authoritative",
  "exit_criteria_met": false,
  "recommended_next_action": "rework_child_scope",
  "rework_targets": [
    "task-admin-settings-save",
    "task-admin-settings-display"
  ]
}
```

These examples establish the required rule: leaf validation can support confidence and routing, but only parent-scope validation can set `exit_criteria_met` and authorize completion or rework.

## Alternatives Considered

- Keep validation structural-only: rejected because completion authority would remain weak.
- Build separate leaf and parent validation systems: rejected because the difference is scope, not engine ownership.
- Let Loops decide completion without a formal report: rejected because it breaks the claim-versus-verify invariant.

## Implementation Plan

- [ ] Define `ValidationReport` shape and completion-decision semantics.
- [ ] Implement leaf vs parent invocation scopes for the same engine.
- [ ] Add adapters for lint, tests, build, audit, and architecture checks.
- [ ] Define how `exit_criteria_met` is derived from validation output.
- [ ] Add fixture coverage for success, failure, retry, and escalation paths.