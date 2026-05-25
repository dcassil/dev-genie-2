---
id: standardize-and-document-the
level: task
title: "Standardize and document the native-dep vs pure-TS plugin launcher pattern"
short_code: "DGOS-T-0048"
created_at: 2026-05-25T16:30:44.079607+00:00
updated_at: 2026-05-25T16:30:44.079607+00:00
parent: DGOS-I-0004
blocked_by: []
archived: false

tags:
  - "#task"
  - "#phase/todo"


exit_criteria_met: false
strategy_id: NULL
initiative_id: DGOS-I-0004
---

# Standardize and document the native-dep vs pure-TS plugin launcher pattern

## Parent Initiative

[[DGOS-I-0004]] — Platform Packaging & Installer. This task realizes design
point 5 ("native-dep launcher pattern"). It extracts the proven katana
"ensure-native-module / auto-recover from Node ABI mismatch" launcher into a
documented, reusable pattern and defines the decision rule for when a plugin
needs it (native dep) versus when a plugin just launches its bundle directly
(pure TS). It feeds the externalization contract the bundle script
(DGOS-T-0047) encodes and is consumed by daimyo registration (DGOS-T-0049),
which is a pure-TS plugin and therefore must NOT inherit katana's native-dep
launcher.

## Objective

Codify the two launcher variants and the rule that selects between them, so each
marketplace plugin's `bin/` launcher is principled rather than copy-pasted:

1. **Native-dep launcher** (katana today): a thin `bin/<plugin>-mcp.js` that, on
   first launch, ensures the declared native runtime deps are installed and
   loadable against the current Node ABI (probe → reinstall on `ERR_DLOPEN_FAILED`
   / NODE_MODULE_VERSION mismatch), then spawns the bundled entry. Used ONLY when
   the plugin ships a native dependency.
2. **Bundle-only launcher** (pure-TS plugins): a thin `bin/<plugin>-mcp.js` (or a
   direct `node dist/...` invocation) that just launches the self-contained
   bundle — no install probe, because everything is inlined and there is no
   native binding to rebuild.

Produce a single documented reference for each, the decision rule, and apply the
correct variant to katana (already correct — confirm) and prepare the pure-TS
variant for daimyo (consumed by DGOS-T-0049).

## Acceptance Criteria

- [ ] A packaging doc (e.g. `docs/plugin-launchers.md` or a section in the repo packaging doc) describes both launcher variants, including: the native-dep variant's probe-and-recover algorithm (mirroring `katana/bin/katana-mcp.js`: `depMissing` → install; `depsLoadable` probe via a child `process.execPath` → on failure `rm -rf node_modules` + reinstall `--omit=dev`), and the bundle-only variant. It states the decision rule verbatim: **native runtime dep present → ensure-and-recover launcher; pure-TS (all deps bundled/pure-JS) → bundle-only launcher.**
- [ ] The doc explains WHY: native modules (e.g. `better-sqlite3`) cannot be safely bundled by esbuild and are ABI-specific, so they are externalized and installed at first launch under the running Node; pure-JS deps are inlined into the bundle and need no install — consistent with the marketplace "no install step" contract.
- [ ] katana's launcher is reviewed and confirmed (or minimally refactored) to match the documented native-dep pattern; its `requiredRuntimeDeps` list (currently `["better-sqlite3"]`) is confirmed to match the `--external:` set in katana's build. No behavior regression to katana's launch.
- [ ] A reusable launcher template/snippet for the pure-TS variant is provided (the exact `bin/daimyo-mcp.js` content, or a documented template) ready for DGOS-T-0049 to adopt for daimyo, which has NO native dep (its deps `@anthropic-ai/claude-agent-sdk` and `@modelcontextprotocol/sdk` are pure JS and get bundled). The doc explicitly records that daimyo uses the bundle-only variant and must NOT copy katana's `better-sqlite3` probe.
- [ ] The doc defines the contract between the launcher and the bundle script (DGOS-T-0047): the set of `--external:` deps in the build MUST equal the launcher's `requiredRuntimeDeps` for native-dep plugins, and MUST be empty (or pure-JS-only) for bundle-only plugins. A check or checklist enforces this alignment at release time.
- [ ] Optional but documented: if a shared launcher helper is extracted (e.g. a tiny `scripts/launcher-lib`), it must itself be inlined/copied into each plugin's `bin/` so a marketplace-pulled plugin has no unresolved import — a plugin's `bin/` cannot depend on a `workspace:*` package at runtime. If no helper is extracted, document that each plugin keeps a self-contained `bin/` script.

## Implementation Notes

### Technical Approach

- Start from `katana/bin/katana-mcp.js` as the canonical native-dep implementation; lift its algorithm into prose + a reference snippet. Keep katana's actual file as the living example.
- The pure-TS launcher is much simpler: resolve `dist/<entry>.mjs` relative to `CLAUDE_PLUGIN_ROOT`/the script dir and `spawn(process.execPath, [entry, ...args], { stdio: "inherit" })` with the same exit/signal propagation katana uses — minus the dep-probe block.
- Crucial constraint: a plugin's `bin/` runs from the marketplace cache where only the plugin folder exists. So launchers must be dependency-free at the source level (Node built-ins only) — exactly as katana's is. Any shared helper must be physically copied into each plugin's `bin/`, never imported from a workspace package. Recommend NOT extracting a shared lib (the scripts are ~15–80 lines); document the duplication as intentional.
- Coordinate the externals/inlining contract with DGOS-T-0047 — these two tasks define two halves of the same boundary and may be executed together.

### Dependencies

- **Upstream:** DGOS-T-0045 (workspace context) is helpful but the launcher reasoning is largely independent; can proceed in parallel with DGOS-T-0046/0047. Pairs tightly with DGOS-T-0047 (shared externalization contract).
- **Downstream:** DGOS-T-0049 (daimyo adopts the pure-TS bundle-only launcher per this doc).

### Risk Considerations

- **Misclassifying a plugin.** Giving daimyo katana's native-dep launcher would make it try to `npm install` at launch despite having nothing native to install — slow and fragile. Mitigation: the explicit decision rule + the acceptance criterion that daimyo is bundle-only.
- **A future native dep sneaks into a pure-TS plugin.** Then the bundle-only launcher silently ships a broken bundle. Mitigation: the externals==requiredRuntimeDeps alignment check at release time (also in DGOS-T-0047) catches a newly-externalized native dep with no launcher support.
- **Launcher importing a workspace package.** Would break a marketplace pull. Mitigation: the "Node built-ins only, no workspace import" constraint is an explicit acceptance criterion.

### Execution Profile

**Recommended Agent: opus + medium.** Substantive cross-cutting documentation + a reusable pattern that gates daimyo's packaging and pairs with the bundle script's externalization contract, but the load-bearing algorithm already exists in katana and is being codified, not invented. Touches a doc, possibly katana's launcher, and produces the daimyo template — moderate context, known pattern.

## Status Updates

*To be added during implementation.*
