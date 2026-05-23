# Protocol

`protocol` is a plain npm library package, not a Claude/Codex plugin. It is consumed by `daimyo` and future Dev-Genie runtime packages as a shared contract layer, so the dependency arrow points into this package and this package has no dependency on sibling plugins.

JSON Schema is the source of truth. TypeScript bindings under `src/generated/` are generated from schemas and must not be edited by hand.

## Schema Draft

Schemas use JSON Schema draft 2020-12 and live in `schemas/` as `*.schema.json` files. Validate schema files with:

```sh
npm run validate:schemas
```

## Adding An Artifact Type

1. Add `schemas/<artifact-name>.schema.json` with `$schema` set to `https://json-schema.org/draft/2020-12/schema`.
2. Add fixtures under `fixtures/<artifact-name>/valid/` and `fixtures/<artifact-name>/invalid/`.
3. Run `npm run codegen`.
4. Run `npm run test`, `npm run typecheck`, `npm run lint`, and `npm run build`.

The current `sample-artifact` schema and fixtures are throwaway scaffold samples. Delete them when the first real protocol artifact schema lands.

## Codegen

Regenerate the TypeScript binding with:

```sh
npm run codegen
```

Check for stale generated output with:

```sh
npm run check:codegen
```

`npm run test` also runs the schema validator and codegen drift check before the fixture tests.

## Fixture Harness

Each schema file maps to a fixture directory with the same base name:

```text
schemas/example.schema.json
fixtures/example/valid/*.json
fixtures/example/invalid/*.json
```

The Vitest harness compiles every schema with Ajv and asserts every valid fixture passes and every invalid fixture fails. Adding a new artifact type should only require dropping in the schema plus its valid and invalid fixtures.
