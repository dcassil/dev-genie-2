---
name: katana-decompose
description: Decompose a Katana parent document into child documents when the user asks to break down a product doc, epic, user story, or task.
---

# Katana Decompose

Use the Katana MCP tools to decompose a parent document.

Workflow:

1. Use `mcp__katana__list_documents` to locate relevant documents when the user provides a title or partial reference.
2. Use `mcp__katana__read_document` on the parent short code to understand scope and declared child sections.
3. Propose the child documents to the user with level, title, subtype, and task pass where relevant.
4. After confirmation, call `mcp__katana__decompose_document` with the parent short code and children array.
5. Show the resulting short codes.

Constraints:

- Two-pass tasks must be created as a high-pass and low-pass pair.
- `task-high-pass` uses `pass=high` and `model_tier=strong`.
- `task-low-pass` uses `pass=low` and `model_tier=cheap`.
- The low-pass task should reference the high-pass task with `scaffold_task`.
