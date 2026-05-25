---
id: build-the-bundle-at-release-script
level: task
title: "Build the bundle-at-release script that produces a self-contained committed plugin dist from workspace deps"
short_code: "DGOS-T-0047"
created_at: 2026-05-25T16:30:42.842037+00:00
updated_at: 2026-05-25T17:20:48.033345+00:00
parent: DGOS-I-0004
blocked_by: []
archived: false

tags:
  - "#task"
  - "#phase/completed"


exit_criteria_met: true
strategy_id: NULL
initiative_id: DGOS-I-0004
---

# Build the bundle-at-release script that produces a self-contained committed plugin dist from workspace deps

## Parent Initiative

[[DGOS-I-0004]] — Platform Packaging & Installer. This task realizes design
point 3 ("plugins bundle-at-release"). It provides the deliberate, repeatable
release step that turns a workspace plugin + its `workspace:*` deps into a
single committed self-contained `dist/` and bumps the plugin version per the
repo `CLAUDE.md` marketplace rule. It is the mechanism that makes "shared libs
have no committed dist" (DGOS-T-0046) viable while plugins remain
launch-with-no-install. It is the prerequisite for daimyo registration
(DGOS-T-0049), which is this script's first real consumer.

## Objective

Create a release/bundle script (e.g. `scripts/bundle-plugin.mjs` at the repo
root, or a workspace `package.json` `release` script) that, given a marketplace
plugin name, (1) builds that plugin's workspace dependency closure from source,
(2) produces a single self-contained bundle in the plugin's `dist/` with all
`workspace:*` library code inlined (so the published plugin has no unresolved
internal imports and needs no install of workspace siblings), (3) handles the
plugin's non-bundled native/runtime externals consistently with the launcher
pattern (DGOS-T-0048), and (4) bumps the plugin version in BOTH
`<plugin>/.claude-plugin/plugin.json` and `<plugin>/package.json`. The script is
the ONLY blessed way a plugin `dist/` is regenerated, making re-bundles a
deliberate release act rather than a side effect of an upstream lib commit.

## Acceptance Criteria

## Acceptance Criteria

## Acceptance Criteria

- [x] A documented bundle script exists at the repo root (e.g. `scripts/bundle-plugin.mjs`) invoked like `node scripts/bundle-plugin.mjs <plugin> [--bump patch|minor]`, runnable via a root `package.json` script (e.g. `pnpm release:plugin -- <plugin>`).
- [x] Running it for a plugin builds that plugin's `workspace:*` dependency closure from source first (the libs have no committed `dist/` after DGOS-T-0046), then emits a self-contained bundle under `<plugin>/dist/` whose entry has NO unresolved `import` of a workspace package (verified by grepping the bundle for bare `protocol`/`daimyo`/`roles`/`engines` specifiers, or by launching the bundle in a temp dir with no workspace `node_modules` present).
- [x] The script distinguishes bundled-inline deps (workspace libs + pure-JS deps) from externalized runtime deps. For a native dep (e.g. katana's `better-sqlite3`) or an intentionally externalized runtime dep, it marks them `--external:` and ensures the plugin's `package.json` `dependencies` lists exactly those externals so the launcher (DGOS-T-0048) can install them at first launch. The rule "what gets inlined vs externalized" is documented in the script header and cross-referenced to DGOS-T-0048.
- [x] The script bumps the version in BOTH `<plugin>/.claude-plugin/plugin.json` and `<plugin>/package.json` to the same value (default patch; `--bump minor` supported), enforcing the repo `CLAUDE.md` rule that an unbumped change never reaches the marketplace cache. A dry-run/check mode reports the intended version without writing.
- [x] The script is idempotent and deterministic: running it twice on an unchanged tree produces a byte-identical bundle (modulo the version bump), so a re-bundle does not create spurious diffs.
- [x] A self-contained-launch verification is included: the produced bundle is copied to a scratch dir containing only the plugin folder (no repo `node_modules`, no workspace), and its MCP entry / CLI launches successfully (for a pure-TS plugin, directly; for a native-dep plugin, after the launcher's first-launch install). This proves the "pulled from main, launched with no install step" contract.
- [x] The script does NOT re-bundle on unrelated upstream lib commits — it is only invoked explicitly. Documentation states this and contrasts it with the old `file:`-inlined behavior that caused churn.
- [x] Applying the script to `katana` (the existing marketplace plugin) reproduces a working katana `dist/` equivalent to today's committed one (katana is the validation target even though it is outside the pnpm workspace — the script must support a non-workspace plugin path, OR the task documents that katana keeps its own existing `npm run build` and the new script targets only workspace plugins like daimyo; pick one and justify). Whichever path is chosen, katana must still launch self-contained.

## Implementation Notes

### Technical Approach

- Reuse esbuild (already every package's bundler). The script computes the target plugin's build, then for workspace deps relies on esbuild's bundling to inline them (since `workspace:*` symlinks resolve to real source/`dist`), marking only declared externals with `--external:`. Mirror katana's build invocation shape (`esbuild ... --bundle --platform=node --format=esm --target=node18 --external:better-sqlite3 ... --banner:js='...createRequire...'`).
- For workspace plugins, drive the dependency-closure build with `pnpm --filter <plugin>... build` (the `...` selector includes the plugin's deps), so libs are freshly built before bundling.
- Version bump: read/modify the two JSON files; keep them in lockstep. A small helper that fails loudly if the two files disagree before the bump.
- katana decision: katana is outside the workspace and already has a working self-contained `build`. Recommended: the new script supports a "workspace plugin" mode (daimyo) and a thin "delegate to plugin's own build" mode (katana) so there is one release entrypoint, but it does not forcibly re-architect katana's build. Document the choice in a Status Update.
- The self-contained-launch check can shell out: copy `<plugin>` to a tmpdir, run its `bin` MCP launcher with a trivial handshake or `--version`, assert exit 0.

### Dependencies

- **Upstream:** DGOS-T-0045 (workspace + `pnpm --filter ...build`), DGOS-T-0046 (libs build from source, no committed dist), DGOS-T-0048 (launcher pattern — the externalization rule the bundler encodes must match what the launcher expects; these two are tightly coupled and may be worked together).
- **Downstream:** DGOS-T-0049 (daimyo registration uses this script to produce daimyo's bundle + version bump).

### Risk Considerations

- **ESM + dynamic require of native deps.** The `createRequire` banner katana uses is required when a bundled ESM file must `require()` a native CJS module. The bundle script must apply the same banner whenever a native external is present. Mitigation: derive the banner from the externals list; test against katana's `better-sqlite3`.
- **Inlining a dep that must stay external.** If a native/dynamically-loaded dep is accidentally inlined, the bundle breaks at runtime. Mitigation: explicit externals list per plugin, plus the self-contained-launch test catches it.
- **Version-file drift.** Bumping only one of the two JSON files silently breaks the marketplace updater. Mitigation: lockstep helper + pre-bump equality check.
- **Non-determinism in bundles.** Source maps / timestamps could make re-bundles noisy. Mitigation: disable timestamped output; assert byte-identical re-bundle in the acceptance criteria.

### Execution Profile

**Recommended Agent: opus + high.** This is load-bearing release tooling whose externalization/inlining rules must align exactly with the launcher pattern and the marketplace's no-install contract; a wrong call produces plugins that fail to launch from a clean pull. It spans build tooling, version-bump invariants, and a real self-contained-launch verification, and daimyo registration depends on it being correct.

## Status Updates

- 2026-05-25: Implemented `scripts/bundle-plugin.mjs` and root
  `release:plugin` / `test:release` scripts. The script builds workspace plugin
  dependency closure first, bundles configured entries with esbuild, verifies no
  unresolved workspace imports remain in `.mjs` bundles, verifies deterministic
  output by rebuilding twice, launches a scratch plugin copy with no workspace
  `node_modules`, and bumps package + marketplace manifest versions in lockstep.
- 2026-05-25: Enforced the DGOS-T-0048 externalization contract by deriving the
  esbuild external set from each launcher's `requiredRuntimeDeps` and requiring
  package runtime `dependencies` to match. Daimyo is handled as a native/binary
  runtime-dep plugin because `@anthropic-ai/claude-agent-sdk` ships a platform
  executable; it externalizes exactly that package and installs/probes it from
  the native-dep launcher path. Katana remains a supported non-workspace plugin
  with `better-sqlite3` as its sole runtime external.
- 2026-05-25: Verified `pnpm release:plugin -- daimyo` builds `protocol` and
  Daimyo from source, produces the committed Daimyo `dist/`, completes the
  scratch MCP initialize launch after first-run SDK install, and bumps Daimyo to
  `0.14.1`.
- 2026-05-25 (orchestrator verification): `scripts/bundle-plugin.test.mjs` 4/4; all five workspace suites green (protocol 76, daimyo 68/5, protocol-proof 7, engines 58, roles 34); release script bundles daimyo from source + deterministic-rebuild + scratch-launch checks pass; externals==requiredRuntimeDeps enforced (daimyo→claude-agent-sdk native; katana→better-sqlite3). **katana regression-checked:** initial 33 test failures were a better-sqlite3 native-ABI mismatch in this shell (not T-0047) — after `npm rebuild better-sqlite3`, katana is 301/301 green + builds clean. Bumped **katana 0.1.6 → 0.1.7** (its package.json dep-split + launcher were touched — repo rule); minor cosmetic `args` reformat in katana plugin.json (valid JSON, harmless). No escape hatches. **exit_criteria_met: true.** Completed.