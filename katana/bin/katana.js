#!/usr/bin/env node
// Use the tsx CLI binary directly so TS sources resolve no matter the cwd.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const tsxBin = resolve(here, "../node_modules/tsx/dist/cli.mjs");
const entry = resolve(here, "../src/cli/main.ts");

const child = spawn(
  process.execPath,
  [tsxBin, entry, ...process.argv.slice(2)],
  { stdio: "inherit" },
);
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
