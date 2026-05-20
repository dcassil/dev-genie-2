# dev-genie repo rules

This repo hosts a Claude Code marketplace of plugins under development:
`katana/`, `audit/`, `guardrails/`, `dev-genie/`, plus test workspaces like
`katana-tests/`. Plugins ship to the marketplace by being pulled from this
repo's `main` branch, so iteration speed depends on landing fixes on `main`
directly.

## Plugin fixes go through formal commits to `main`

When fixing a bug in any plugin in this repo (`katana`, `audit`, `guardrails`,
`dev-genie`, or any future sibling plugin):

- Make the fix in the plugin source — no inline workarounds, no monkey-patching
  in a test workspace.
- If the plugin has a build step (e.g. `katana`'s `npm run build`), rebuild and
  commit the resulting `dist/` so the marketplace cache picks it up. `dist/` is
  globally gitignored; per-plugin un-ignore lines live in the root `.gitignore`.
- Commit and push to `main`. Plugin consumers re-pull from `main`, so unmerged
  fixes don't help anyone.
- This standing authorization OVERRIDES the global "never push to main" rule
  for this repo only, and only for plugin source/build fixes. Other categories
  of change (releases, schema migrations against shared databases, anything
  touching `staging`) still require explicit per-action confirmation.

## After a plugin code change

1. Rebuild if the plugin has a build step.
2. **Bump the plugin version** in BOTH `<plugin>/.claude-plugin/plugin.json`
   and `<plugin>/package.json`. Claude Code's marketplace updater compares
   versions and treats an unchanged version as "already at latest", so an
   unbumped change will never reach the cache even after `/plugin update`.
   Patch-bump for bug fixes, minor-bump for new functionality.
3. Commit source + built `dist/` + version bump together so the marketplace
   install is coherent.
4. Push to `main`.
5. The user will need to `/plugin update <name>` (or restart Claude Code) to
   pick up the new version — call this out in your end-of-turn summary.

This rule applies to ANY change to a plugin's code, commands, MCP server,
hooks, agents, or manifest. If you touch a plugin, bump the plugin.
