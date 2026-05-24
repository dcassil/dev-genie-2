# roles

Dev-Genie Roles is both a library consumed in-process and the ADR-2 subprocess runner contract.

## ADR-2 Role Invocation CLI

The package ships the `roles` binary:

```bash
roles invoke <role-id> --input <RoleInvocation.json> --output <RoleResult.json> [--context <Context.json>]
```

`roles role invoke ...` is also accepted as a compatibility alias for callers that mirror ADR-2's `dev-genie role invoke` command shape. `--input -` and `--output -` read from stdin and write the JSON artifact to stdout.

The CLI is the cross-platform ADR-2 subprocess alternative. Daimyo's T-0035 adapter may still lean in-process through `RoleRunner`, but host-platform wrappers can rely on this file-based command.

The CLI validates the input against `role-invocation.schema.json` before resolving a Role or calling a model. Schema-invalid input, malformed JSON, context parsing errors, and CLI-level hard failures write a `RoleInvokeError` JSON envelope to `--output`; valid invocations write a schema-valid `RoleResult`.

Exit codes:

| Code | Meaning |
| --- | --- |
| `0` | `RoleResult.payload.status` is `produced` or `skipped` |
| `2` | Invalid JSON, schema-invalid `RoleInvocation`, role-id mismatch, or invalid context bundle |
| `10` | `RoleResult.payload.status` is `blocked` |
| `11` | `RoleResult.payload.status` is `needs_human` |
| `12` | Unclassified CLI hard failure; a `RoleInvokeError` envelope is written when `--output` is available |
| `64` | CLI usage error; no output artifact is written because `--output` may be unknown |
| `66` | Input/output filesystem failure |

Human-readable diagnostics go to stderr. The caller should only parse the JSON written to `--output` or stdout when `--output -` is used.
