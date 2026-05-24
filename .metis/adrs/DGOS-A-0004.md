---
id: 001-human-involvement-autonomy-profile
level: adr
title: "Human Involvement Autonomy Profile"
number: 1
short_code: "DGOS-A-0004"
created_at: 2026-05-21T19:25:02.601318+00:00
updated_at: 2026-05-24T19:00:05.671384+00:00
decision_date: 
decision_maker: Dev-Genie maintainers
parent: 
archived: false

tags:
  - "#adr"
  - "#phase/decided"


exit_criteria_met: false
strategy_id: NULL
initiative_id: NULL
---

# ADR-4: Human Involvement Autonomy Profile

## Context

Dev-Genie currently has governance rules for when work must escalate, but it does not yet have a project-level declaration of how involved the human wants to be by decision domain. That creates two problems:

- the system cannot distinguish a user who wants frequent engineering confirmation from one who wants near-full delegation
- policy, bootstrap, and runtime decision routing have no stable baseline for when to ask, route, or proceed autonomously

This needs to be decided early in project initialization so later policy decisions are grounded in explicit user preference rather than per-session guesswork.

## Decision

Dev-Genie will capture a persistent autonomy profile during project initialization before normal execution begins.

### Autonomy profile shape

The profile contains three domains:

- engineering
- product
- design

Each domain is set independently to one of three involvement levels:

- `always_in_loop`
- `big_questions_only`
- `delegate`

### Initialization questions

Bootstrap should ask these three questions first:

- how much do you want to be involved with engineering decisions?
- how much do you want to be involved with product decisions?
- how much do you want to be involved with design decisions?

Each question uses the same three answers:

- `always_in_loop`
- `big_questions_only`
- `delegate`

### Mode semantics

`always_in_loop` means the system asks the user for domain decisions that are not purely local execution details. For engineering this includes architecture, schemas, tech stack, and moderate code-structure choices. For product this includes capability framing, use-case framing, and product-behavior choices. For design this includes UX structure, interaction patterns, visual direction, and notable interface decisions.

`big_questions_only` means the system asks only on major or cross-cutting decisions in that domain. For engineering this includes major architecture changes, major schema or persistence changes, and major technology choices. For product this includes vision shifts, major capabilities, major workflow changes, and important scope tradeoffs. For design this includes major workflow or navigation changes, visual-system changes, and high-impact UX decisions.

`delegate` means the system may make decisions within that domain without asking the user, subject to existing governance boundaries. For the product domain, `delegate` only becomes fully active after the product vision or equivalent baseline is approved. Before that point, bootstrap still requires explicit user alignment on the initial vision.

### Runtime use

The autonomy profile is persistent project governance configuration. The Decision Policy Engine must use it when deciding whether to:

- permit work to proceed autonomously
- route a question to a parent or Role without human review
- stop for explicit human review

The profile is domain-aware. A project may delegate engineering while keeping product always in the loop, or any other combination.

## Alternatives Analysis

| Option | Pros | Cons | Risk Level | Implementation Cost |
|--------|------|------|------------|-------------------|
| One global autonomy setting | Simple to explain and store | Too coarse; product, design, and engineering have different review needs | High | Low |
| Per-domain autonomy profile | Matches how real teams delegate, supports precise policy behavior | Requires clearer domain classification and thresholds | Low | Medium |
| No persistent profile, decide ad hoc each session | Flexible in the moment | Inconsistent behavior, repeated questioning, and weak governance replayability | High | Low |

## Rationale

Per-domain autonomy is the smallest model that captures real user intent without overfitting.

Humans commonly want different levels of involvement across engineering, product, and design. A single global switch forces bad tradeoffs, while fully ad hoc behavior makes the system unpredictable and hard to audit. Capturing the profile at bootstrap makes the preference explicit, durable, and reusable by policy and runtime systems.

The `delegate` guardrail for product is important because full autonomy only makes sense once there is an approved product baseline. Before that, the system still needs the human to establish direction.

## Consequences

### Positive
- Bootstrap gets a clear first-step governance handshake with the user.
- Decision policy can make deterministic ask-versus-proceed choices by domain.
- Different involvement levels across engineering, product, and design are supported cleanly.
- Runtime behavior becomes more inspectable and replayable because review decisions have a declared policy basis.

### Negative
- Policy and bootstrap now need domain classification logic and threshold definitions.
- Some borderline questions will still require tuning to decide whether they are local or major within a domain.
- Initialization becomes slightly longer because the project must capture three governance answers up front.

### Neutral
- This decision does not by itself define the exact storage format for the autonomy profile.
- The exact UI or prompt wording can evolve as long as the three-domain, three-level contract stays intact.
- Existing human approval gates at strategic bootstrap steps still apply even when a domain is delegated.