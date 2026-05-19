# Katana Short Codes

## Format

All Katana documents use a hierarchical short-code format: `<PROJECT>-<TYPE>-<NNNN>`

- **PROJECT**: Workspace prefix (default `KAT`), all uppercase
- **TYPE**: Document type code (see Type Codes section), all uppercase
- **NNNN**: Zero-padded 4-digit numeric tail (0001–9999)

Example: `KAT-PD-0001`

## Type Codes

| Doc type        | Code | Example       |
| --------------- | ---- | ------------- |
| product-doc     | PD   | KAT-PD-0001   |
| epic            | E    | KAT-E-0001    |
| user-story      | US   | KAT-US-0001   |
| task-high-pass  | TH   | KAT-TH-0001   |
| task-low-pass   | TL   | KAT-TL-0001   |
| task-ui         | TU   | KAT-TU-0001   |
| adr (optional)  | A    | KAT-A-0001    |

## Regex

Canonical regex for validating short codes:

```
^[A-Z][A-Z0-9]{1,9}-(PD|E|US|TH|TL|TU|A)-\d{4}$
```

This pattern enforces:
- Project prefix: 2–10 uppercase alphanumeric characters
- Separator: single hyphen
- Type code: one of the valid type codes listed above
- Separator: single hyphen
- Numeric tail: exactly 4 digits (0000–9999)

## Allocation Rules

- **Monotonically increasing**: Within each document type, numeric tails increment sequentially (0001, 0002, 0003, …).
- **Never reused**: Once a numeric tail is assigned to a type, it is never reassigned, even if that document is deleted or archived.
- **Archived documents retain codes**: Documents that are archived keep their original short codes and continue to hold their numeric position.
- **Project prefix configurable**: The project prefix (default `KAT`) is configurable per workspace. All other rules remain invariant across workspaces.

## Uniqueness

- **Workspace-wide uniqueness**: Short codes (prefix + type code + numeric tail) are unique across the entire workspace, regardless of document type.
- **Type-scoped numeric tails**: Numeric tails are unique only within their document type. For example, `KAT-PD-0001` and `KAT-E-0001` can coexist because they have different type codes.

## Examples

### Valid Examples

**KAT-PD-0001** — Product Doc (architecture variant)
```
Format: <PROJECT>-<TYPE>-<NNNN>
- PROJECT: KAT (default workspace prefix)
- TYPE: PD (product-doc)
- NNNN: 0001 (first product doc)
```

**KAT-E-0003** — Epic
```
Format: <PROJECT>-<TYPE>-<NNNN>
- PROJECT: KAT
- TYPE: E (epic)
- NNNN: 0003 (third epic)
```

**KAT-US-0042** — User Story
```
Format: <PROJECT>-<TYPE>-<NNNN>
- PROJECT: KAT
- TYPE: US (user-story)
- NNNN: 0042 (forty-second user story)
```

**KAT-TH-0010** — Task High-Pass
```
Format: <PROJECT>-<TYPE>-<NNNN>
- PROJECT: KAT
- TYPE: TH (task-high-pass)
- NNNN: 0010 (tenth high-pass task)
```

**KAT-TL-0007** — Task Low-Pass
```
Format: <PROJECT>-<TYPE>-<NNNN>
- PROJECT: KAT
- TYPE: TL (task-low-pass)
- NNNN: 0007 (seventh low-pass task)
```

**KAT-TU-0015** — Task UI
```
Format: <PROJECT>-<TYPE>-<NNNN>
- PROJECT: KAT
- TYPE: TU (task-ui)
- NNNN: 0015 (fifteenth UI task)
```

**KAT-A-0001** — ADR (Architecture Decision Record)
```
Format: <PROJECT>-<TYPE>-<NNNN>
- PROJECT: KAT
- TYPE: A (adr)
- NNNN: 0001 (first ADR)
```

### Invalid Examples

**KAT-E-0001-UI** — ❌ Variant suffix not allowed

**Reason**: Short codes must not include variant suffixes. Variants (e.g., "UI", "architecture", "contract") are encoded in the `subtype` frontmatter field within the document itself, not appended to the short code. This keeps codes stable and machine-parseable.

**KAT-E-42** — ❌ Numeric tail not zero-padded

**Reason**: Numeric tails must always be exactly 4 digits, zero-padded. Use `KAT-E-0042` instead.

**KATANA-E-0001** — ❌ Project prefix exceeds 10 characters

**Reason**: Project prefixes must be 2–10 characters. Use a shorter prefix (e.g., `KAT`, `KATANA` is valid but this example has too many characters in context).

**kat-e-0001** — ❌ Lowercase characters not allowed

**Reason**: All parts of the short code (prefix, type, tail) must be uppercase.

**KAT_E_0001** — ❌ Underscores instead of hyphens

**Reason**: Separators must be hyphens (`-`), not underscores.
