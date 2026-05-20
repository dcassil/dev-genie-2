---
name: katana-board
description: Render the current Katana board when the user asks to show the board, inspect Katana workflow state, or view documents grouped by phase.
---

# Katana Board

Use `mcp__katana__list_documents` to fetch every document in the workspace, then group them by `level` and phase.

Render a markdown table per level:

- Product docs
- Epics
- User stories
- Tasks

For tasks, show high-pass and low-pass tasks side by side when their pairing is visible from the document metadata.

If `mcp__katana__list_documents` returns an empty list, say that the workspace has no Katana documents and suggest decomposing or creating a product document to seed the tree.
