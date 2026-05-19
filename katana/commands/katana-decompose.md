---
name: katana-decompose
description: Decompose a parent document into child documents using the katana MCP server
argument-hint: <parent-short-code>
---

Use the `mcp__katana__list_documents` tool to find documents in the workspace, then use `mcp__katana__decompose_document` to create children of the specified parent ($ARGUMENTS).

Workflow:
1. Read the parent document with `mcp__katana__read_document` to understand its scope and the child sections it declares (Child Epics / Child User Stories / Child Tasks).
2. Propose a decomposition to the user as a list of children (level + title + subtype + pass for tasks).
3. After confirmation, call `mcp__katana__decompose_document` with the parent short code and the children array.
4. Show the resulting short codes.

Constraints:
- Two-pass tasks (`task-high-pass` + `task-low-pass`) must be created as a pair. The low-pass task references the high-pass via `scaffold_task`.
- `task-high-pass` requires `pass=high`, `model_tier=strong`. `task-low-pass` requires `pass=low`, `model_tier=cheap`.
