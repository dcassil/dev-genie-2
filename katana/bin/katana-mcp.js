#!/usr/bin/env node
// Launcher for the katana MCP server. When the plugin is installed from the
// marketplace, the cache directory contains source + built dist/ but no
// node_modules — `better-sqlite3` is intentionally external to the esbuild
// bundle (native module). We lazily install runtime deps on first launch so
// the MCP server can resolve them.
import { spawnSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, "..");
const entry = resolve(pluginRoot, "dist/katana-mcp.mjs");

// Runtime deps that the dist bundle imports at load time. Keep in sync with
// the `dependencies` block in package.json that is NOT bundled by esbuild
// (i.e. anything marked `--external:` in the build script).
const requiredRuntimeDeps = ["better-sqlite3"];

const missing = requiredRuntimeDeps.filter(
  (dep) => !existsSync(resolve(pluginRoot, "node_modules", dep, "package.json")),
);

if (missing.length > 0) {
  // Log to stderr — stdout is the MCP transport and must stay clean.
  process.stderr.write(
    `[katana-mcp] installing missing runtime deps: ${missing.join(", ")}\n`,
  );
  const result = spawnSync(
    "npm",
    ["install", "--omit=dev", "--no-audit", "--no-fund", "--loglevel=error"],
    { cwd: pluginRoot, stdio: ["ignore", "inherit", "inherit"] },
  );
  if (result.status !== 0) {
    process.stderr.write(
      `[katana-mcp] npm install failed with exit code ${result.status}\n`,
    );
    process.exit(result.status ?? 1);
  }
}

const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], {
  stdio: "inherit",
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
