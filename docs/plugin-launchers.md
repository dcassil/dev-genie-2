# Marketplace Plugin Launchers

Marketplace plugins are pulled as plugin folders and launched directly from the
cache. There is no package-manager install step before Claude Code invokes the
plugin, so each plugin must ship a `bin/` launcher that works with only the files
inside that plugin folder.

Use this decision rule for every plugin:

**native runtime dep present → ensure-and-recover launcher; pure-TS (all deps bundled/pure-JS) → bundle-only launcher.**

In this context, a native runtime dep includes Node native addons, platform
binary packages, and other runtime files that esbuild cannot safely inline into a
self-contained JavaScript bundle.

## Native-Dep Launcher

Use this mode when the plugin depends on a native addon or platform-specific
binary at runtime. Katana is the current living example because it uses
`better-sqlite3`.

Native modules cannot be safely bundled by esbuild. They are ABI-specific, so a
`node_modules` tree installed under one Node version can fail under another with
`ERR_DLOPEN_FAILED` or a `NODE_MODULE_VERSION` mismatch. For marketplace plugins,
the launcher owns first-run installation and ABI recovery.

The required algorithm is:

1. Keep a `requiredRuntimeDeps` list in `bin/<plugin>-mcp.js`.
2. `depMissing`: check whether each listed package exists under
   `<pluginRoot>/node_modules/<dep>/package.json`.
3. If any dep is missing, run `npm install --omit=dev --no-audit --no-fund` in
   the plugin root.
4. `depsLoadable`: probe the native dep in a child process using
   `process.execPath`, not a hard-coded `node`, so the probe uses the same Node
   binary that will run the MCP server.
5. If the probe fails, remove `<pluginRoot>/node_modules` and reinstall with
   `npm install --omit=dev --no-audit --no-fund`.
6. Spawn the bundled MCP entry with `process.execPath`, inherit stdio, and
   propagate exit codes and signals.

Katana matches this pattern:

- Launcher: `katana/bin/katana-mcp.js`
- Runtime deps: `requiredRuntimeDeps = ["better-sqlite3"]`
- Build external: `katana/package.json` uses `--external:better-sqlite3`
- Marketplace command: `katana/.claude-plugin/plugin.json` runs
  `node ${CLAUDE_PLUGIN_ROOT}/bin/katana-mcp.js`

The `requiredRuntimeDeps` list and the build externals intentionally match:
Katana externalizes only `better-sqlite3`, and the launcher installs/probes only
`better-sqlite3`.

## Bundle-Only Launcher

Use this mode when the plugin and all runtime dependencies are pure JavaScript or
TypeScript that esbuild can inline into the committed bundle. The launcher does
not run `npm install`, does not inspect `node_modules`, and does not probe native
bindings.

Template:

```js
#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, "..");
const entry = resolve(pluginRoot, "dist/<plugin>-mcp.mjs");

const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], {
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
```

This is the correct launcher for a plugin whose build has no native/binary
runtime externals and whose dependency tree is fully bundled. A marketplace
manifest may either invoke this launcher or call `node dist/<entry>.mjs`
directly, but a `bin/` launcher is preferred because it keeps exit and signal
behavior consistent with native-dep plugins.

## Bundle-Script Contract

DGOS-T-0047's bundle-at-release script must enforce the same boundary the
launcher assumes:

- Native-dep plugin: every `--external:<dep>` runtime dependency must be listed
  in the launcher's `requiredRuntimeDeps`, and every `requiredRuntimeDeps` entry
  must have a matching build external.
- Bundle-only plugin: runtime `--external:` entries must be empty (or
  pure-JS-only). Node built-ins and intentionally provided host APIs may be
  listed separately from runtime package externals. Any native addon, platform
  binary package, or file that must exist in `node_modules` moves the plugin to
  the ensure-and-recover launcher.
- Release checklist: compare the build command's runtime externals against the
  launcher before committing a marketplace plugin bundle. The release is blocked
  if the sets differ.

Development-only externals and type-only imports do not belong in
`requiredRuntimeDeps`; only modules imported by the committed runtime bundle do.

## Self-Contained `bin/` Rule

Launchers must use Node built-ins only. A plugin's `bin/` runs from the
marketplace cache where only that plugin folder is present, so it cannot import a
workspace package or a shared launcher library from the repository root.

Do not extract a shared runtime helper unless the release process physically
copies or inlines it into each plugin's `bin/` script. For now, keep the launcher
scripts self-contained and allow small intentional duplication.

## Daimyo Classification For DGOS-T-0049

Daimyo already has a bundle-only-shaped launcher at `daimyo/bin/daimyo-mcp.js`,
but its current dependency tree is not pure-TS.

Verification on 2026-05-25 found that `daimyo/package.json` declares
`@anthropic-ai/claude-agent-sdk` as `^0.3.148`, the workspace lock resolves it to
`0.3.150`, and that package declares platform-specific optional dependencies such
as `@anthropic-ai/claude-agent-sdk-darwin-arm64`. The installed Darwin arm64
package contains a `claude` Mach-O executable, and the SDK bundle throws
`Native CLI binary for ${process.platform}-${process.arch} not found` unless it
can resolve that binary or receives `pathToClaudeCodeExecutable`.

Therefore DGOS-T-0049 must not assume Daimyo is pure-TS while it relies on the
SDK's packaged executable. It has two valid packaging paths:

1. Keep using the SDK-managed executable and classify Daimyo as a native/binary
   runtime-dep plugin with an ensure-and-recover launcher adapted for the SDK's
   platform packages.
2. Provide `pathToClaudeCodeExecutable` from the host environment and verify the
   bundled Daimyo runtime no longer requires the SDK optional binary packages;
   only then may Daimyo use the bundle-only launcher.

If Daimyo takes the native/binary path, it must not copy Katana's
`better-sqlite3` probe verbatim. Its `requiredRuntimeDeps`, probe, and build
externals must describe the SDK executable packages it actually needs.
