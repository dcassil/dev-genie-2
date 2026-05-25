---
id: register-daimyo-as-a-marketplace
level: task
title: "Register daimyo as a marketplace plugin with a self-contained bundled dist and launcher"
short_code: "DGOS-T-0049"
created_at: 2026-05-25T16:30:45.783394+00:00
updated_at: 2026-05-25T17:28:20.227822+00:00
parent: DGOS-I-0004
blocked_by: []
archived: false

tags:
  - "#task"
  - "#phase/completed"


exit_criteria_met: false
strategy_id: NULL
initiative_id: DGOS-I-0004
---

# Register daimyo as a marketplace plugin with a self-contained bundled dist and launcher

## Parent Initiative

[[DGOS-I-0004]] — Platform Packaging & Installer. This task realizes design
point 4 ("register daimyo as a marketplace plugin"). It is the first real
consumer of the bundle-at-release script (DGOS-T-0047) and the launcher pattern
(DGOS-T-0048), and it depends on daimyo being Roles-agnostic and free of the
`roles` dependency (DGOS-T-0044). It brings daimyo — the Loop primitive's package
per ADR-5 — onto the marketplace as a self-contained, launch-with-no-install
plugin alongside katana/dev-genie/guardrails/audit.

## Objective

Make `daimyo` a registered marketplace plugin: add its entry to the root
`.claude-plugin/marketplace.json`, produce its self-contained committed `dist/`
via the bundle-at-release script (with its `workspace:*` deps — `protocol` and,
post-cycle-break, nothing from `roles` — inlined), give it the correct
**bundle-only** launcher (daimyo is pure-TS, no native dep), re-add its
committed-`dist/` un-ignore lines to `.gitignore`, and bump its version. The
result: a teammate who installs/updates the daimyo plugin from `main` gets a
working MCP server with no install step.

## Acceptance Criteria

## Acceptance Criteria

## Acceptance Criteria

- [ ] `.claude-plugin/marketplace.json` gains a `daimyo` entry (`name: "daimyo"`, `source: "./daimyo"`, a description matching `daimyo/.claude-plugin/plugin.json`). The other four entries (dev-genie/guardrails/audit/katana) are unchanged.
- [ ] daimyo's `dist/` is produced by the DGOS-T-0047 bundle script (not by an ad-hoc `npm run build`), and the committed bundle is self-contained: it inlines `protocol` (and contains NO bare `import "roles"` — guaranteed by DGOS-T-0044) so a clean marketplace pull launches with no workspace present. Verified by the self-contained-launch check (copy `daimyo/` to a scratch dir with no repo `node_modules`, launch `bin/daimyo-mcp.js`, assert it starts).
- [ ] daimyo uses the **bundle-only** launcher from DGOS-T-0048 — `bin/daimyo-mcp.js` (and `bin/daimyo.js` for the CLI) launch the bundled entry directly with NO native-dep install probe. The `@anthropic-ai/claude-agent-sdk` and `@modelcontextprotocol/sdk` deps are pure-JS and bundled inline (or, if either proves to pull a native/binary postinstall, it is treated as an external and the launcher/bundle handle it per DGOS-T-0048 — verify and document which).
- [ ] The root `.gitignore` re-adds daimyo's un-ignore lines (`!daimyo/dist/`, `!daimyo/dist/**`) so the committed bundle ships to the marketplace cache — consistent with katana and with DGOS-T-0046's rule that committed dist exists ONLY for real marketplace plugins. (These lines exist today; confirm they survive DGOS-T-0046, which only removes the library lines.)
- [ ] daimyo's version is bumped in BOTH `daimyo/.claude-plugin/plugin.json` and `daimyo/package.json` (minor bump — new marketplace functionality) by the bundle script.
- [ ] daimyo's full suite stays green (`typecheck`/`lint`/`test`/`build`), and the MCP server's tool surface is unchanged from a behavior standpoint (registration is packaging, not a feature change). No escape hatches.
- [ ] `/plugin` install/update of daimyo is called out in the end-of-turn summary for the human, per the repo `CLAUDE.md` step-5 rule.
- [ ] The four existing plugins are unaffected: `marketplace.json` still resolves them; a smoke check confirms katana still launches.

## Implementation Notes

### Technical Approach

- daimyo already mirrors katana's structure (npm package + `bin/` + MCP server + committed `dist/`) per ADR-5, and `bin/daimyo-mcp.js` exists. The work is: confirm the launcher is bundle-only (strip any install probe if present), wire daimyo into the bundle script, add the marketplace entry, and bump.
- Confirm daimyo's bundle has no `roles` import (depends on DGOS-T-0044 having landed). If T-0044 is not yet done, this task is blocked — daimyo cannot be a clean self-contained bundle while it drags in `roles` (which drags in `daimyo` again).
- Check whether `@anthropic-ai/claude-agent-sdk` ships any native/binary component or a postinstall that the bundle can't inline; if so, treat it as an external runtime dep and apply the native-dep launcher branch instead — but verify first, since the design assumes daimyo is pure-TS.
- Use the DGOS-T-0047 self-contained-launch verification harness as the acceptance evidence.

### Dependencies

- **Upstream:** DGOS-T-0044 (daimyo free of `roles`), DGOS-T-0045 (workspace), DGOS-T-0047 (bundle script), DGOS-T-0048 (launcher pattern). This task is the convergence point of the whole initiative's packaging half.
- **Downstream:** DGOS-T-0050 (installer alignment) may reference daimyo as an installable plugin.

### Risk Considerations

- **claude-agent-sdk hidden native/binary dep.** If the SDK is not purely JS, the bundle-only assumption is wrong. Mitigation: inspect the SDK package before assuming; fall back to the native-dep launcher branch and document.
- **Cycle not actually broken.** If DGOS-T-0044 left a stray `roles` import, the daimyo bundle inlines roles (and transitively daimyo) producing bloat or a broken bundle. Mitigation: the "no bare `import 'roles'`" acceptance check.
- **Marketplace updater no-op.** Forgetting the dual version bump means the new daimyo never reaches the cache. Mitigation: the bundle script enforces the lockstep bump (DGOS-T-0047).
- **dist churn confusion.** daimyo re-commits `dist/` here (it is now a marketplace plugin). This is the intended, deliberate release commit — contrast with the eliminated library churn (DGOS-T-0046).

### Execution Profile

**Recommended Agent: opus + medium.** Integration work that ties together three upstream tasks and a real marketplace registration with a self-contained-launch proof. It follows the patterns those tasks establish rather than inventing new ones, but spans marketplace metadata, the bundle script, the launcher, gitignore, and version bumps across multiple files — non-trivial integration on a known pattern.

## Status Updates

- 2026-05-25: Registered `daimyo` in the root marketplace, preserving the
  existing dev-genie/guardrails/audit/katana entries. Treated Daimyo as a
  native/binary runtime-dep plugin per the corrected launcher guidance:
  `bin/daimyo-mcp.js` manages `@anthropic-ai/claude-agent-sdk` and the release
  bundle externalizes that dependency. Ran `pnpm release:plugin -- daimyo
  --bump minor`, bumping `daimyo` from `0.14.1` to `0.15.0`; tracked `dist/`
  was already deterministic. Verification passed: JSON manifest checks,
  no bare workspace/roles imports in runtime bundles, Daimyo scratch MCP
  initialize with first-run SDK install, Katana scratch MCP initialize, Daimyo
  suite, five-package workspace typecheck/lint/test/build, and release-script
  tests.
- 2026-05-25 (orchestrator verification): marketplace.json valid, lists 5 plugins (dev-genie/guardrails/audit/katana + new daimyo, source ./daimyo); 4 legacy entries intact. daimyo package.json + plugin.json both **0.15.0 (lockstep confirmed)**; package.json diff is the version line only. daimyo registered as a native-dep plugin (claude-agent-sdk externalized + launcher-installed). Scratch self-contained MCP launch verified. No escape hatches. **exit_criteria_met: true.** Completed. (Consumer note: `/plugin install daimyo` or `/plugin update daimyo` after push.)