#!/usr/bin/env node
// Launcher for the Daimyo MCP server. The Claude Agent SDK ships a
// platform-specific native CLI executable, so the marketplace cache must lazily
// install and verify that runtime dependency before starting the bundled MCP
// entry.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, "..");
const entry = resolve(pluginRoot, "dist/daimyo-mcp.mjs");
const requiredRuntimeDeps = ["@anthropic-ai/claude-agent-sdk"];

function depMissing() {
  return requiredRuntimeDeps.filter(
    (dep) => !existsSync(resolve(pluginRoot, "node_modules", dep, "package.json")),
  );
}

function sdkPlatformPackageName() {
  const arch = process.arch === "x64" || process.arch === "arm64" ? process.arch : "";
  const platform =
    process.platform === "darwin" ||
    process.platform === "linux" ||
    process.platform === "win32"
      ? process.platform
      : "";
  if (platform === "" || arch === "") return undefined;
  return `@anthropic-ai/claude-agent-sdk-${platform}-${arch}/claude`;
}

function depsLoadable() {
  const platformPackage = sdkPlatformPackageName();
  const probe = `
    const { createRequire } = require("node:module");
    (async () => {
      const requireFromPlugin = createRequire(process.cwd() + "/bin/daimyo-mcp.js");
      const sdkMain = requireFromPlugin.resolve("@anthropic-ai/claude-agent-sdk");
      await import("@anthropic-ai/claude-agent-sdk");
      if (${JSON.stringify(platformPackage)} === undefined) return;
      const requireFromSdk = createRequire(sdkMain);
      requireFromSdk.resolve(${JSON.stringify(platformPackage)});
    })().catch(() => process.exit(1));
  `;
  const result = spawnSync(process.execPath, ["-e", probe], {
    cwd: pluginRoot,
    stdio: ["ignore", "ignore", "pipe"],
  });
  return result.status === 0;
}

function installDeps(reason) {
  process.stderr.write(`[daimyo-mcp] ${reason}\n`);
  const packageJsonPath = resolve(pluginRoot, "package.json");
  const originalPackageJson = readFileSync(packageJsonPath, "utf8");
  const packageJson = JSON.parse(originalPackageJson);
  const runtimeDependencies = Object.fromEntries(
    requiredRuntimeDeps.map((dep) => [dep, packageJson.dependencies?.[dep]]),
  );
  const installPackageJson = {
    name: packageJson.name,
    version: packageJson.version,
    type: packageJson.type,
    dependencies: runtimeDependencies,
  };
  let result;
  try {
    writeFileSync(packageJsonPath, `${JSON.stringify(installPackageJson, null, 2)}\n`);
    result = spawnSync(
      "npm",
      ["install", "--omit=dev", "--no-audit", "--no-fund", "--loglevel=error"],
      {
        cwd: pluginRoot,
        stdio: ["ignore", "ignore", "inherit"],
        env: {
          ...process.env,
          npm_config_cache: resolve(pluginRoot, ".npm-cache"),
        },
      },
    );
  } finally {
    writeFileSync(packageJsonPath, originalPackageJson);
  }
  if (result.status !== 0) {
    process.stderr.write(
      `[daimyo-mcp] npm install failed with exit code ${result.status}\n`,
    );
    process.exit(result.status ?? 1);
  }
}

const missing = depMissing();
if (missing.length > 0) {
  installDeps(`installing missing runtime deps: ${missing.join(", ")}`);
} else if (!depsLoadable()) {
  rmSync(resolve(pluginRoot, "node_modules"), { recursive: true, force: true });
  installDeps("Claude Agent SDK executable package failed to resolve; reinstalling");
}

const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], {
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
