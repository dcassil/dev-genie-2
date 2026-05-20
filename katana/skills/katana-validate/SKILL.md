---
name: katana-validate
description: Validate a Katana document against its gates when the user asks to check, validate, or fix a Katana document.
---

# Katana Validate

Call `mcp__katana__validate_document` with the target short code.

Report each diagnostic with:

- Rule code
- Severity
- Section pointer
- Minimal fix suggestion

If the document passes, say so explicitly. If it fails, propose minimal edits using `mcp__katana__edit_document`, but ask before applying changes unless the user already asked you to fix the document.
