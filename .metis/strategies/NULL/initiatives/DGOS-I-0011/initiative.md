---
id: human-review-and-decision
level: initiative
title: "Human Review and Decision Governance"
short_code: "DGOS-I-0011"
created_at: 2026-05-19T16:57:36.820989+00:00
updated_at: 2026-05-19T16:57:36.820989+00:00
parent: DGOS-V-0001
blocked_by: []
archived: false

tags:
  - "#initiative"
  - "#phase/discovery"


exit_criteria_met: false
estimated_complexity: M
strategy_id: NULL
initiative_id: human-review-and-decision
---

# Human Review and Decision Governance Initiative

## Context

The system should automate routine planning and implementation support, but humans must remain in control of strategic direction, architecture trade-offs, high-risk migrations, protected branches, deployment, and unresolved model disagreement.

## Goals & Non-Goals

**Goals:**
- Define which decisions require human review.
- Define which decisions can be answered by role plugins.
- Record every non-trivial decision as a DecisionRecord.
- Make review requirements visible in artifacts and gates.
- Keep runtime micro-workflows fast without hiding important choices.

**Non-Goals:**
- Ask humans for every small implementation clarification.
- Let models override explicit project rules.
- Treat human approval as a vague chat message with no artifact trail.

## Detailed Design

Decision governance uses risk tiers. Low-risk role decisions can patch the current task. Medium-risk decisions require a DecisionRecord and may require review before completion. High-risk decisions block phase transition or task continuation until human approval is recorded.

Examples requiring human review: product scope changes, public API contracts, architecture pattern changes, schema migrations with data risk, lint/type rule weakening, protected branch or deployment actions, and model-review deadlock.

## Alternatives Considered

- Human always in the loop: rejected because it destroys throughput.
- Human never in the loop: rejected because product and architecture accountability cannot be delegated blindly.
- Approval only in chat: rejected because future agents need durable context.

## Implementation Plan

- [ ] Define risk tiers and human-review-required fields.
- [ ] Add approval artifacts or frontmatter fields for high-risk decisions.
- [ ] Add gates that block completion or active transition without required approval.
- [ ] Integrate governance with the micro-workflow protocol.
- [ ] Document examples for planner, architect, designer, developer, and quality-governor plugins.
