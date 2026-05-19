---
name: katana-validate
description: Validate a katana document against its gates
argument-hint: <short-code>
---

Call `mcp__katana__validate_document` on $ARGUMENTS. Report each diagnostic with its rule code, severity, and the section pointer.

If the document passes, say so explicitly. If it fails, propose minimal edits via `mcp__katana__edit_document` to fix the violations — ask before applying.
