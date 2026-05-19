# Workflow Config (`.katana/workflow.json`)

The katana workflow engine reads `<workspace>/.katana/workflow.json` at
loop startup. The file is OPTIONAL — when absent, the engine uses
defaults baked into `src/workflow/model-config.ts`.

## Schema

```json
{
  "version": 1,
  "models": [
    { "level": "<DocumentType>", "pass": "<high|low|absent>", "tier": "<strong|cheap|ui>" }
  ]
}
```

| field | type | required | notes |
|-------|------|----------|-------|
| version | integer (must be 1) | YES | Engine throws on mismatch. |
| models | array | YES | Order does not matter; (level, pass) is the key. |
| models[].level | DocumentType | YES | One of `product-doc`, `epic`, `user-story`, `task-high-pass`, `task-low-pass`, `task-ui`. |
| models[].pass | "high" \| "low" \| absent | OPTIONAL | Required to disambiguate task levels; ignored elsewhere. |
| models[].tier | "strong" \| "cheap" \| "ui" | YES | Dispatcher resolves the actual model. |

## Resolution

1. Exact match on `(level, pass)`.
2. Match on `level` with `pass` absent.
3. Otherwise: error `No model-config entry for ...`.

## Defaults (shipped)

| level | pass | tier |
|-------|------|------|
| product-doc | — | strong |
| epic | — | strong |
| user-story | — | strong |
| task-high-pass | high | strong |
| task-low-pass | low | cheap |
| task-ui | — | ui |

## Override examples

### Use `strong` for low-pass on a high-stakes project

```json
{
  "version": 1,
  "models": [
    { "level": "task-low-pass", "pass": "low", "tier": "strong" }
  ]
}
```

Defaults for every other (level, pass) remain in force.

### Add an entry for an explicit high-pass low override

```json
{
  "version": 1,
  "models": [
    { "level": "task-high-pass", "pass": "low", "tier": "cheap" }
  ]
}
```

Even though the schema does not normally produce this combination, the
override is honored if a doc with that (level, pass) is encountered.

## Errors

| condition | engine behavior |
|-----------|-----------------|
| `version` ≠ 1 | throw `workflow.json version must be 1; got <n>` |
| invalid JSON | `JSON.parse` exception bubbles up |
| no entry resolves for a doc | throw `No model-config entry for level="..." pass="..."` |

## See also

- `src/workflow/model-config.ts` — implementation.
- `docs/schema/frontmatter.md` — `level` / `pass` / `model_tier` field semantics.
