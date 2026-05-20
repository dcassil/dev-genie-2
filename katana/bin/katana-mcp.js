#!/usr/bin/env node
// Launcher for the katana MCP server. When the plugin is installed from the
// marketplace, the cache directory contains source + built dist/ but no
// node_modules — `better-sqlite3` is intentionally external to the esbuild
// bundle (native module). We lazily install runtime deps on first launch so
// the MCP server can resolve them, and verify they actually load against the
// current Node ABI (re-installing if a previous install was built against a
// different Node version).
import { spawnSync, spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, "..");
const entry = resolve(pluginRoot, "dist/katana-mcp.mjs");

// Runtime deps that the dist bundle imports at load time. Keep in sync with
// the `dependencies` block in package.json that is NOT bundled by esbuild
// (i.e. anything marked `--external:` in the build script).
const requiredRuntimeDeps = ["better-sqlite3"];

function depMissing() {
  return requiredRuntimeDeps.filter(
    (dep) => !existsSync(resolve(pluginRoot, "node_modules", dep, "package.json")),
  );
}

function depsLoadable() {
  // Probe each native dep in a child process using the same Node binary that
  // will run the MCP server. A mismatched NODE_MODULE_VERSION (e.g. installed
  // under Node 20, now running under Node 18) throws ERR_DLOPEN_FAILED here.
  const probe = requiredRuntimeDeps
    .map((d) => `require(${JSON.stringify(d)});`)
    .join("");
  const result = spawnSync(process.execPath, ["-e", probe], {
    cwd: pluginRoot,
    stdio: ["ignore", "ignore", "pipe"],
  });
  return result.status === 0;
}

function installDeps(reason) {
  process.stderr.write(`[katana-mcp] ${reason}\n`);
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

const missing = depMissing();
if (missing.length > 0) {
  installDeps(`installing missing runtime deps: ${missing.join(", ")}`);
} else if (!depsLoadable()) {
  // Existing node_modules but the native binding can't load — most commonly
  // an ABI mismatch from a prior install under a different Node version.
  // Wipe and reinstall so prebuilds for the current ABI get fetched.
  rmSync(resolve(pluginRoot, "node_modules"), { recursive: true, force: true });
  installDeps(
    "native dep failed to load (likely Node ABI mismatch); reinstalling",
  );
}

const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], {
  stdio: "inherit",
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
