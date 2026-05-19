---
name: katana-board
description: Render the current katana board (documents grouped by phase) for this workspace
---

Use `mcp__katana__list_documents` to fetch every document in the workspace, then group them by `level` (product-doc → epic → user-story → tasks) and within each level by `phase`. Render a markdown table per level with one column per phase.

For tasks specifically, render high-pass and low-pass side by side so the two-pass pairing is visible.

If `mcp__katana__list_documents` returns an empty list, the workspace has no docs — suggest `/katana-decompose` against a freshly-created product-doc to seed the tree.
