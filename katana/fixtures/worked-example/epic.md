---
id: filter-flag-epic
level: epic
title: "Add --filter Flag to Config Report CLI"
short_code: "KAT-E-9001"
subtype: major-feature
parent: "KAT-PD-9001"
created_at: 2026-05-09T16:31:00.000000+00:00
updated_at: 2026-05-09T16:31:00.000000+00:00
archived: false
tags:
  - "#epic"
  - "#phase/discovery"
exit_criteria_met: false
phase: discovery
blocked_by: []
strategy_id: null
initiative_id: null
---

## Parent Product Doc

[KAT-PD-9001](./product-doc.md) — Config Report CLI

## Summary

This epic extends the Config Report CLI with a filtering capability. Users can now invoke the CLI with `--filter environment=prod` to narrow results to matching records before formatting and output. This reduces noise and improves the usability of the tool for users managing large configuration sets.

## Scope

- Add `--filter` flag to CLI argument parsing.
- Implement filtering logic that applies a key=value predicate to config records.
- Ensure filtered results are returned and formatted correctly.
- Update CLI help text to document the new flag.

## Out of Scope

- Filter syntax beyond simple key=value (no regex, wildcards, or compound predicates).
- Multiple simultaneous filters.
- Filter on nested fields (top-level keys only).
- Performance optimization for large datasets.

## Feature Behavior

Users invoke the CLI with an optional `--filter` argument:

```bash
config-report --file config.json --filter environment=prod
```

The filter is parsed as a key=value pair. The CLI loads the config, applies the filter (retaining only records where the specified key matches the specified value), and then formats and prints the filtered results.

If no `--filter` is provided, all records are processed as before.

## Affected Modules / Surfaces

- **CLI entry point**: Argument parser updated to accept `--filter` flag.
- **FilterEngine module**: New module that encapsulates filtering logic.
- **Formatter**: No changes required; operates on pre-filtered records.

## Exit Criteria

- [ ] `--filter` flag is parsed from CLI arguments.
- [ ] Filter is applied to config records before formatting.
- [ ] Help text documents the new flag and its usage.
- [ ] Filtered results are output correctly.
- [ ] Exit codes remain 0 on success, non-zero on error.

## Child User Stories

- KAT-US-9001 — Define applyFilter() interface contract
