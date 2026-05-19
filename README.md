# Dev-Genie Engineering OS

This repository is organized as a composable AI engineering OS. The parent
Metis workspace (`.metis/`) is the current strategic source of truth.

## Top-Level Plugins

- `dev-genie/` - meta-plugin and installer. Detects project state, reconciles
  existing configuration, and wires the plugin suite together.
- `katana/` - workflow kernel. Owns repo-native work documents, phase machines,
  gates, MCP tools, platform adapters, board state, context/execution loops, and
  future orchestration.
- `guardrails/` - architecture catalog, scaffolds, lint/type constraints, and
  implementation guardrail instructions.
- `audit/` - deterministic quality scanning, composite scores, baselines, and
  regression-blocking hooks.

## Preserved Legacy State

- `katana/.metis.legacy-katana/` preserves the previous Katana vision.
- `legacy-guardrails-boilerplate/.metis.legacy-dev-genie/` preserves the
  previous Dev-Genie vision and backlog context.
- `legacy-guardrails-boilerplate/` keeps remaining wrapper-local state that was
  not promoted to a top-level plugin directory.

## Current Strategic Memory

Use the parent `.metis/` workspace for new planning. It contains the
consolidated vision and initiatives for the artifact protocol, strategy engine,
repo intelligence, runtime decision micro-workflows, context, validation,
existing-repo MVP flow, multi-agent orchestration, packaging, and governance.
