# Worked Example: Filter Flag

This directory contains a complete, self-consistent tree of Katana document fixtures spanning all five document types (Product Doc → Epic → User Story → Task[high-pass] + Task[low-pass]).

## Tree

```
KAT-PD-9001 (Product Doc, system-design)
└── KAT-E-9001 (Epic, major-feature)
    └── KAT-US-9001 (User Story, interface-contract)
        ├── KAT-TH-9001 (Task[high-pass])
        └── KAT-TL-9001 (Task[low-pass])
```

## Files

- **product-doc.md** — Config Report CLI: a system design document describing a CLI tool that reads JSON config and prints formatted reports.
- **epic.md** — Add `--filter` Flag: a major-feature epic that extends the CLI with a filtering capability.
- **user-story.md** — Define applyFilter() Interface Contract: an interface-contract user story that specifies a typed filtering function.
- **task-high-pass.md** — Scaffold src/filter.ts: a high-pass task that creates the filter module with typed exports and placeholder bodies.
- **task-low-pass.md** — Implement applyFilter() Body: a low-pass task that implements the function against the scaffold.

## Use

These fixtures are inputs to **KAT-I-0002 (Validation Gates)** test suite. They demonstrate:
- Valid frontmatter conforming to KAT-T-0001 schema.
- Correct section structure matching KAT-T-0003 through KAT-T-0007 templates.
- Valid short codes per KAT-T-0002.
- Consistent cross-references (parent links, scaffold_task reference).
- Coordinated high-pass and low-pass task pair (same file path, export name, signature).

**Do not edit these fixtures without updating the validation test suite.** They are reference exemplars and test inputs.
