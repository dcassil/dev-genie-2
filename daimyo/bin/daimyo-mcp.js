#!/usr/bin/env node
// Launcher for the Daimyo MCP server. The marketplace cache contains source
// plus built dist/, so this bin stays tiny and delegates to the bundled entry.
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, "..");
const entry = resolve(pluginRoot, "dist/daimyo-mcp.mjs");

const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], {
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
