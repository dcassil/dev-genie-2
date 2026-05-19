# Katana Frontmatter Schema

## Overview

Every Katana document uses YAML frontmatter to encode its metadata. Field names are kebab-case, and each document receives a unique short code in the format defined by KAT-T-0002 (e.g., `KAT-PD-0001`, `KAT-E-0042`). The frontmatter declares the document's level, phase, hierarchy, status, and semantic shape (subtype) so that the workflow engine and validation gates can enforce consistency without manual intervention.

## Common Fields

| field | type | required | applies_to | description |
|-------|------|----------|------------|-------------|
| `id` | kebab-case string | YES | all | Unique identifier within the workspace; derived from title or assigned manually. |
| `level` | enum | YES | all | Document type: `product-doc`, `epic`, `user-story`, `task-high-pass`, `task-low-pass`, `task-ui`. |
| `title` | string | YES | all | Human-readable title of the document. |
| `short_code` | string | YES | all | Unique short code (e.g., `KAT-PD-0001`); format defined by KAT-T-0002. |
| `subtype` | enum \| null | YES | all | Semantic shape of the document: `architecture`, `system-design`, `ui`, `major-feature`, `interface-contract`, or `null`. Constrained per level (see Validation Rules). |
| `created_at` | ISO-8601 datetime | YES | all | Timestamp when document was created. |
| `updated_at` | ISO-8601 datetime | YES | all | Timestamp when document was last updated. |
| `archived` | boolean | YES | all | Whether the document is archived and no longer active. |
| `tags` | array of strings | YES | all | Labels for filtering and organization. MUST include `#<level>` and `#phase/<phase>`. |
| `exit_criteria_met` | boolean | YES | all | Whether all exit criteria have been satisfied. |
| `phase` | enum | YES | all | Current phase in the document's lifecycle; valid values depend on level. |
| `parent` | short_code | CONDITIONAL | epic, user-story, task-* | Short code of the parent document. REQUIRED for all but product-doc. |
| `blocked_by` | array of short_codes | OPTIONAL | all | List of short codes that are blocking this document's progress. Defaults to `[]`. |
| `pass` | enum | CONDITIONAL | task-high-pass, task-low-pass | Either `high` or `low`. REQUIRED on task-high-pass and task-low-pass; absent on other levels. (Redundant with `level` but retained for query convenience.) |
| `model_tier` | enum | CONDITIONAL | task-* | Tier of model recommended: `strong`, `cheap`, or `ui`. REQUIRED on all task levels; advisory on others. |
| `scaffold_task` | short_code | CONDITIONAL | task-low-pass | Short code of the task-high-pass whose scaffold this low-pass task fills. REQUIRED on task-low-pass only. |
| `story_id` | short_code | CONDITIONAL | task-* | Short code of the user-story parent. REQUIRED on all task levels; mirrors `parent` when parent is a user-story. |
| `strategy_id` | string \| null | OPTIONAL | all | Reference to parent strategy (if applicable). |
| `initiative_id` | string | OPTIONAL | all | Reference to parent initiative. |

## Per-Type Field Sets

### product-doc

Product-doc is the root level and accepts subtypes `architecture`, `system-design`, `ui`, or `null`. It has no parent.

**Extra fields:** None beyond common fields.

**Phase lifecycle:** `draft → review → published`

### epic

Epic is one level below product-doc and accepts subtypes `architecture`, `major-feature`, `ui`, or `null`.

**Extra fields:** 
- `parent` (REQUIRED, short_code of product-doc)
- `blocked_by` (OPTIONAL)

**Phase lifecycle:** `discovery → design → ready → active → completed`

### user-story

User-story is one level below epic and accepts subtypes `architecture`, `interface-contract`, `ui`, or `null`.

**Extra fields:**
- `parent` (REQUIRED, short_code of epic)
- `blocked_by` (OPTIONAL)

**Phase lifecycle:** `discovery → design → ready → active → completed`

### task-high-pass

Task-high-pass is one level below user-story; subtype is always `null`. Strong model scaffolds types and writes contract comments.

**Extra fields:**
- `parent` (REQUIRED, short_code of user-story)
- `pass` (REQUIRED, value: `high`)
- `model_tier` (REQUIRED, value: `strong`)
- `story_id` (REQUIRED, mirrors parent)
- `blocked_by` (OPTIONAL)

**Phase lifecycle:** `todo → active → completed`

### task-low-pass

Task-low-pass is one level below user-story; subtype is always `null`. Cheap model implements against scaffold.

**Extra fields:**
- `parent` (REQUIRED, short_code of user-story)
- `pass` (REQUIRED, value: `low`)
- `model_tier` (REQUIRED, value: `cheap`)
- `scaffold_task` (REQUIRED, short_code of corresponding task-high-pass)
- `story_id` (REQUIRED, mirrors parent)
- `blocked_by` (OPTIONAL)

**Phase lifecycle:** `todo → active → completed`

### task-ui

Task-ui is optional work below user-story for UI-specific concerns; subtype is always `null`. Typically uses `ui` model tier.

**Extra fields:**
- `parent` (REQUIRED, short_code of user-story)
- `model_tier` (REQUIRED, value: `ui`)
- `story_id` (REQUIRED, mirrors parent)
- `blocked_by` (OPTIONAL)

**Phase lifecycle:** `todo → active → completed`

## Validation Rules

- **Subtype enumeration per level:** `product-doc` and `epic` accept `{architecture, system-design, ui, null}`; `user-story` accepts `{architecture, interface-contract, ui, null}`; all task types require `subtype: null`.
- **Phase tag requirement:** `tags` MUST include the literal string `#phase/<phase>`, where `<phase>` matches the `phase` field value.
- **Level tag requirement:** `tags` MUST include the literal string `#<level>`, where `<level>` matches the `level` field value.
- **Short code format:** `short_code` MUST match the regex pattern defined in KAT-T-0002.
- **Parent hierarchy:** `parent.level` MUST be exactly one tier above the current document's `level` in the hierarchy (product-doc has no parent; epic's parent is product-doc; user-story's parent is epic; tasks' parent is user-story).
- **Low-pass scaffold resolution:** On `task-low-pass` documents, `scaffold_task` MUST resolve to a `task-high-pass` document whose `parent` equals this low-pass task's `parent` (same user-story).

## Examples

### product-doc

```yaml
id: architecture-vision-2026
level: product-doc
title: "Katana Architecture Vision 2026"
short_code: "KAT-PD-0001"
subtype: architecture
created_at: 2026-05-09T10:00:00.000000+00:00
updated_at: 2026-05-09T10:00:00.000000+00:00
archived: false
tags:
  - "#product-doc"
  - "#phase/draft"
exit_criteria_met: false
phase: draft
blocked_by: []
strategy_id: null
initiative_id: null
```

### epic

```yaml
id: document-schema-epic
level: epic
title: "Document Schema and Templates"
short_code: "KAT-E-0001"
subtype: architecture
parent: "KAT-PD-0001"
created_at: 2026-05-09T11:00:00.000000+00:00
updated_at: 2026-05-09T11:00:00.000000+00:00
archived: false
tags:
  - "#epic"
  - "#phase/discovery"
exit_criteria_met: false
phase: discovery
blocked_by: []
strategy_id: null
initiative_id: document-templates-and-schema
```

### user-story

```yaml
id: frontmatter-schema-story
level: user-story
title: "Define Frontmatter Schema"
short_code: "KAT-US-0001"
subtype: architecture
parent: "KAT-E-0001"
created_at: 2026-05-09T12:00:00.000000+00:00
updated_at: 2026-05-09T12:00:00.000000+00:00
archived: false
tags:
  - "#user-story"
  - "#phase/design"
exit_criteria_met: false
phase: design
blocked_by: []
strategy_id: null
initiative_id: document-templates-and-schema
```

### task-high-pass

```yaml
id: frontmatter-schema-spec-high
level: task-high-pass
title: "Frontmatter Schema Spec (High Pass)"
short_code: "KAT-TH-0001"
subtype: null
parent: "KAT-US-0001"
story_id: "KAT-US-0001"
pass: high
model_tier: strong
created_at: 2026-05-09T13:00:00.000000+00:00
updated_at: 2026-05-09T13:00:00.000000+00:00
archived: false
tags:
  - "#task-high-pass"
  - "#phase/todo"
exit_criteria_met: false
phase: todo
blocked_by: []
strategy_id: null
initiative_id: document-templates-and-schema
```

### task-low-pass

```yaml
id: frontmatter-schema-impl-low
level: task-low-pass
title: "Frontmatter Schema Spec (Low Pass)"
short_code: "KAT-TL-0001"
subtype: null
parent: "KAT-US-0001"
story_id: "KAT-US-0001"
pass: low
model_tier: cheap
scaffold_task: "KAT-TH-0001"
created_at: 2026-05-09T14:00:00.000000+00:00
updated_at: 2026-05-09T14:00:00.000000+00:00
archived: false
tags:
  - "#task-low-pass"
  - "#phase/todo"
exit_criteria_met: false
phase: todo
blocked_by: []
strategy_id: null
initiative_id: document-templates-and-schema
```

### task-ui

```yaml
id: schema-doc-ui-task
level: task-ui
title: "Schema Documentation UI (UI Task)"
short_code: "KAT-TU-0001"
subtype: null
parent: "KAT-US-0001"
story_id: "KAT-US-0001"
model_tier: ui
created_at: 2026-05-09T15:00:00.000000+00:00
updated_at: 2026-05-09T15:00:00.000000+00:00
archived: false
tags:
  - "#task-ui"
  - "#phase/todo"
exit_criteria_met: false
phase: todo
blocked_by: []
strategy_id: null
initiative_id: document-templates-and-schema
```
