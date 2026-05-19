---
id: config-report-cli
level: product-doc
title: "Config Report CLI"
short_code: "KAT-PD-9001"
subtype: system-design
created_at: 2026-05-09T16:30:00.000000+00:00
updated_at: 2026-05-09T16:30:00.000000+00:00
archived: false
tags:
  - "#product-doc"
  - "#phase/draft"
exit_criteria_met: false
phase: draft
blocked_by: []
strategy_id: null
initiative_id: null
---

## Purpose

The Config Report CLI is a command-line tool that reads structured JSON configuration files and produces formatted, human-readable reports. It allows users to view configuration data in a clear, organized manner and filter results by key fields.

## Audience

Platform engineers and DevOps teams who manage application configurations and need quick inspection and reporting tools without writing custom scripts.

## Problem & Current State

Teams currently lack a simple, standard way to inspect and filter JSON configuration files. Manual inspection is tedious and error-prone; custom scripts are fragmented across projects. A unified CLI tool with filtering capabilities would improve visibility and reduce friction.

## Goals / Non-Goals

**Goals:**
- Read JSON config files from disk.
- Pretty-print config data in tabular or nested format.
- Filter config records by field values.
- Return exit status 0 on success, non-zero on error.

**Non-Goals:**
- Support for formats other than JSON.
- Interactive shell or REPL mode.
- Persistence or mutation of config files.
- Network-based config sources.

## Architecture Overview

The CLI is a single Node.js application with clear input/output boundaries:

```
┌─────────────────┐
│  User invokes   │
│  CLI with args  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Config Report CLI              │
│  ┌───────────────────────────┐  │
│  │ 1. Parse arguments        │  │
│  │ 2. Read JSON file         │  │
│  │ 3. Apply filter (if any)  │  │
│  │ 4. Format output          │  │
│  └───────────────────────────┘  │
└────────┬────────────────────────┘
         │
         ▼
┌──────────────────┐
│ Formatted report │
│ printed to stdout│
└──────────────────┘
```

## System Components & Boundaries

### Input Boundary
- CLI receives arguments: file path and optional `--filter` flag with a key=value pair.
- File path must point to a valid JSON file.
- Filter is optional; if provided, it narrows results before formatting.

### Core Processing Engine
- **ConfigReader**: Reads and parses JSON files; raises error on parse failure.
- **FilterEngine**: Applies field-value predicates to records; returns filtered set.
- **Formatter**: Converts records to human-readable output (table or nested format).

### Output Boundary
- Formatted report printed to stdout.
- Error messages printed to stderr.
- Exit code reflects success or failure.

## Data Model Sketch

**Input shape (JSON file):**
```json
{
  "records": [
    {
      "id": "app-001",
      "name": "Application One",
      "environment": "prod",
      "version": "1.2.3",
      "enabled": true
    },
    {
      "id": "app-002",
      "name": "Application Two",
      "environment": "staging",
      "version": "1.1.0",
      "enabled": false
    }
  ]
}
```

**Filtered result (after applying filter):**
```json
{
  "records": [
    {
      "id": "app-001",
      "name": "Application One",
      "environment": "prod",
      "version": "1.2.3",
      "enabled": true
    }
  ]
}
```

**Output format (stdout):**
Plain-text table or JSON, depending on formatter.

## Constraints

- Must parse valid JSON only; invalid JSON halts execution with error.
- Filter applies to records only, not nested structures.
- Single-file input only; no batch or glob patterns.
- Node.js 18+ as runtime.

## Success Criteria

- CLI accepts file path and optional filter argument.
- CLI reads and parses JSON config without crashing on valid input.
- CLI applies filters and returns filtered records.
- CLI formats and prints output to stdout without errors.
- Exit code is 0 on success, non-zero on file/parse/filter errors.

## Child Epics

- KAT-E-9001 — Add `--filter` flag to Config Report CLI
