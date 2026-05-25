#!/usr/bin/env node
/**
 * Bundle a marketplace plugin for release.
 *
 * DGOS-T-0047 / DGOS-T-0048 contract:
 * - Workspace libraries are source-built first and then inlined into the plugin
 *   bundle. Shared library dist/ output is local build artifact only.
 * - Runtime package externals are allowed only for native addons, platform
 *   binary packages, or intentionally launcher-managed runtime files that
 *   cannot be safely inlined by esbuild.
 * - The esbuild runtime external set must equal the launcher's
 *   `requiredRuntimeDeps` list exactly. Bundle-only launchers therefore have an
 *   empty external set. Native-dep launchers install/probe exactly those deps.
 * - A plugin package's runtime `dependencies` must also equal that external
 *   set. Pure-JS deps that are bundled belong in devDependencies for plugin
 *   release purposes, not runtime dependencies.
 *
 * Re-bundling is a deliberate release action. This script is invoked explicitly
 * (for example, `pnpm release:plugin -- daimyo`) and is not wired to library
 * package builds, preventing unrelated upstream library commits from churning
 * committed plugin dist/.
 */

import { createHash } from "node:crypto";
import {
  constants as fsConstants,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { access, cp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  basename,
  dirname,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const pluginConfigs = new Map([
  [
    "daimyo",
    {
      workspace: true,
      entries: [
        ["src/index.ts", "dist/index.mjs"],
        ["src/mcp/server-entry.ts", "dist/daimyo-mcp.mjs"],
        ["src/cli/main.ts", "dist/daimyo-cli.mjs"],
      ],
      launcher: "bin/daimyo-mcp.js",
      verifyCommand: ["bin/daimyo-mcp.js"],
      afterBundleCommands: [["pnpm", ["exec", "tsc", "-p", "tsconfig.build.json"]]],
    },
  ],
  [
    "katana",
    {
      workspace: false,
      entries: [["src/mcp/server-entry.ts", "dist/katana-mcp.mjs"]],
      launcher: "bin/katana-mcp.js",
      verifyCommand: ["bin/katana-mcp.js"],
      afterBundle: copyKatanaMigrations,
      preBuild: [["npm", ["run", "build"], "katana"]],
    },
  ],
]);

const workspacePackages = new Set([
  "protocol",
  "daimyo",
  "roles",
  "engines",
  "protocol-proof",
]);

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const config = pluginConfigs.get(options.plugin);
  if (config === undefined) {
    fail(
      `Unsupported plugin "${options.plugin}". Supported plugins: ${[
        ...pluginConfigs.keys(),
      ].join(", ")}`,
    );
  }

  const pluginDir = resolve(repoRoot, options.plugin);
  const packageJsonPath = join(pluginDir, "package.json");
  const manifestPath = join(pluginDir, ".claude-plugin", "plugin.json");
  const packageJson = readJson(packageJsonPath);
  const manifest = readJson(manifestPath);
  const launcherPath = join(pluginDir, config.launcher);
  const requiredRuntimeDeps = readRequiredRuntimeDeps(launcherPath);
  const externals = [...requiredRuntimeDeps].sort();

  assertVersionsAligned(packageJson.version, manifest.version);
  assertRuntimeDependencies(packageJson, externals, packageJsonPath);

  const nextVersion = bumpVersion(packageJson.version, options.bump);
  const plan = {
    plugin: options.plugin,
    currentVersion: packageJson.version,
    nextVersion,
    externals,
    launcher: relative(repoRoot, launcherPath),
    distEntries: config.entries.map(([, output]) => `${options.plugin}/${output}`),
  };

  if (options.dryRun) {
    printPlan(plan, "dry-run");
    return;
  }

  printPlan(plan, "release");
  await buildPlugin(options.plugin, pluginDir, config, externals);
  await verifyNoWorkspaceBareImports(pluginDir, config.entries);
  await verifyDeterministicBundle(options.plugin, pluginDir, config, externals);
  await verifySelfContainedLaunch(options.plugin, pluginDir, config);
  bumpVersionFiles(packageJsonPath, manifestPath, nextVersion);
  console.log(`[bundle-plugin] bumped ${options.plugin} to ${nextVersion}`);
}

function parseArgs(argv) {
  if (argv[0] === "--") argv = argv.slice(1);
  const [plugin, ...rest] = argv;
  if (plugin === undefined || plugin.startsWith("-")) usage();

  let bump = "patch";
  let dryRun = false;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--dry-run" || arg === "--check") {
      dryRun = true;
      continue;
    }
    if (arg === "--bump") {
      const value = rest[index + 1];
      if (value !== "patch" && value !== "minor") {
        fail("--bump must be patch or minor");
      }
      bump = value;
      index += 1;
      continue;
    }
    if (arg?.startsWith("--bump=")) {
      const value = arg.slice("--bump=".length);
      if (value !== "patch" && value !== "minor") {
        fail("--bump must be patch or minor");
      }
      bump = value;
      continue;
    }
    usage();
  }

  return { plugin, bump, dryRun };
}

function usage() {
  fail(
    "Usage: node scripts/bundle-plugin.mjs <plugin> [--bump patch|minor] [--dry-run|--check]",
  );
}

async function buildPlugin(plugin, pluginDir, config, externals) {
  rmSync(join(pluginDir, "dist"), { recursive: true, force: true });
  mkdirSync(join(pluginDir, "dist"), { recursive: true });

  if (config.workspace) {
    run("pnpm", ["--filter", `${plugin}...`, "build"], repoRoot);
  } else {
    for (const [command, args, cwd] of config.preBuild ?? []) {
      run(command, args, resolve(repoRoot, cwd));
    }
  }

  rmSync(join(pluginDir, "dist"), { recursive: true, force: true });
  mkdirSync(join(pluginDir, "dist"), { recursive: true });

  for (const [entry, outfile] of config.entries) {
    const args = [
      "exec",
      "esbuild",
      entry,
      "--bundle",
      "--platform=node",
      "--format=esm",
      "--target=node18",
      `--outfile=${outfile}`,
      "--log-level=warning",
      ...externals.map((external) => `--external:${external}`),
    ];
    if (externals.length > 0) {
      args.push(
        "--banner:js=import{createRequire as __cr}from \"node:module\";const require=__cr(import.meta.url);",
      );
    }
    run("pnpm", args, pluginDir);
  }

  if (config.afterBundle !== undefined) {
    await config.afterBundle(pluginDir);
  }
  for (const [command, args] of config.afterBundleCommands ?? []) {
    run(command, args, pluginDir);
  }
}

async function copyKatanaMigrations(pluginDir) {
  const sourceDir = join(pluginDir, "src", "storage", "sqlite", "migrations");
  const destDir = join(pluginDir, "dist", "migrations");
  mkdirSync(destDir, { recursive: true });
  const entries = (await readdir(sourceDir))
    .filter((entry) => entry.endsWith(".sql"))
    .sort();
  for (const entry of entries) {
    cpSync(join(sourceDir, entry), join(destDir, entry));
  }
}

async function verifyNoWorkspaceBareImports(pluginDir, entries) {
  const importPattern = /(?:from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|require\s*\(\s*["']([^"']+)["']\s*\))/g;
  for (const [, outfile] of entries) {
    const bundlePath = join(pluginDir, outfile);
    const content = await readFile(bundlePath, "utf8");
    const unresolved = new Set();
    for (const match of content.matchAll(importPattern)) {
      const specifier = match[1] ?? match[2] ?? match[3];
      if (specifier !== undefined && workspacePackages.has(specifier)) {
        unresolved.add(specifier);
      }
    }
    if (unresolved.size > 0) {
      fail(
        `${relative(repoRoot, bundlePath)} has unresolved workspace imports: ${[
          ...unresolved,
        ].join(", ")}`,
      );
    }
  }
}

async function verifyDeterministicBundle(plugin, pluginDir, config, externals) {
  const before = hashDist(pluginDir);
  const scratch = mkdtempSync(join(tmpdir(), `bundle-plugin-${plugin}-det-`));
  try {
    const originalDist = join(pluginDir, "dist");
    const savedDist = join(scratch, "dist");
    cpSync(originalDist, savedDist, { recursive: true });
    await buildPlugin(plugin, pluginDir, config, externals);
    const after = hashDist(pluginDir);
    if (before !== after) {
      fail(`${plugin} bundle is not deterministic across two consecutive builds`);
    }
    rmSync(originalDist, { recursive: true, force: true });
    cpSync(savedDist, originalDist, { recursive: true });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

async function verifySelfContainedLaunch(plugin, pluginDir, config) {
  const scratch = mkdtempSync(join(tmpdir(), `bundle-plugin-${plugin}-launch-`));
  const scratchPluginDir = join(scratch, basename(pluginDir));
  try {
    await copyPluginWithoutNodeModules(pluginDir, scratchPluginDir);
    const [launcher, ...args] = config.verifyCommand;
    const launcherPath = join(scratchPluginDir, launcher);
    await access(launcherPath, fsConstants.X_OK).catch(async () => {
      await access(launcherPath, fsConstants.R_OK);
    });
    await verifyMcpInitialize(plugin, scratchPluginDir, launcherPath, args);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

async function copyPluginWithoutNodeModules(sourceDir, destDir) {
  await cp(sourceDir, destDir, {
    recursive: true,
    filter: (source) => {
      const rel = relative(sourceDir, source);
      if (rel === "") return true;
      const parts = rel.split(sep);
      return !parts.includes("node_modules") && !parts.includes(".katana");
    },
  });
}

function verifyMcpInitialize(plugin, cwd, launcherPath, args) {
  const child = spawn(process.execPath, [launcherPath, ...args], {
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const request =
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "bundle-plugin-check", version: "0.0.0" },
      },
    }) + "\n";

  let stdout = "";
  let stderr = "";
  child.stdin.end(request);
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  return new Promise((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      rejectPromise(
        Error(
          `[bundle-plugin] ${plugin} launch verification timed out\nstderr:\n${stderr}`,
        ),
      );
    }, 120_000);

    child.on("error", (error) => {
      clearTimeout(timeout);
      rejectPromise(error);
    });

    const interval = setInterval(() => {
      if (stdout.includes('"id":1') && stdout.includes('"result"')) {
        clearInterval(interval);
        clearTimeout(timeout);
        child.kill("SIGTERM");
        resolvePromise();
      }
    }, 100);

    child.on("exit", (code, signal) => {
      clearInterval(interval);
      clearTimeout(timeout);
      if (stdout.includes('"id":1') && stdout.includes('"result"')) {
        resolvePromise();
        return;
      }
      rejectPromise(
        Error(
          `[bundle-plugin] ${plugin} launch exited before initialize response (code ${String(
            code,
          )}, signal ${String(signal)})\nstdout:\n${stdout}\nstderr:\n${stderr}`,
        ),
      );
    });
  });
}

function hashDist(pluginDir) {
  const distDir = join(pluginDir, "dist");
  const hash = createHash("sha256");
  for (const file of listFiles(distDir)) {
    const rel = relative(distDir, file);
    hash.update(rel);
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function listFiles(dir) {
  const entries = readdirSyncSorted(dir);
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...listFiles(fullPath));
    } else if (stats.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function readdirSyncSorted(dir) {
  return existsSync(dir) ? readdirSync(dir).sort() : [];
}

function assertRuntimeDependencies(packageJson, externals, packageJsonPath) {
  const runtimeDeps = Object.keys(packageJson.dependencies ?? {}).sort();
  const externalSet = JSON.stringify(externals);
  const dependencySet = JSON.stringify(runtimeDeps);
  if (dependencySet !== externalSet) {
    fail(
      `${relative(
        repoRoot,
        packageJsonPath,
      )} dependencies must exactly match launcher requiredRuntimeDeps/build externals.\n` +
        `dependencies=${dependencySet}\nexternals=${externalSet}`,
    );
  }
}

export function readRequiredRuntimeDeps(launcherPath) {
  const content = readFileSync(launcherPath, "utf8");
  const match = content.match(
    /const\s+requiredRuntimeDeps\s*=\s*(\[[\s\S]*?\])\s*;/,
  );
  if (match === null) return [];
  const rawArray = match[1];
  const normalized = rawArray.replace(/'/g, '"');
  let parsed;
  try {
    parsed = JSON.parse(normalized);
  } catch (error) {
    throw Error(
      `Could not parse requiredRuntimeDeps in ${relative(
        repoRoot,
        launcherPath,
      )}: ${String(error)}`,
    );
  }
  if (
    !Array.isArray(parsed) ||
    parsed.some((item) => typeof item !== "string" || item.length === 0)
  ) {
    fail(`requiredRuntimeDeps must be an array of package-name strings`);
  }
  return [...new Set(parsed)].sort();
}

function assertVersionsAligned(packageVersion, manifestVersion) {
  if (packageVersion !== manifestVersion) {
    fail(
      `package.json version (${packageVersion}) and .claude-plugin/plugin.json version (${manifestVersion}) differ`,
    );
  }
}

export function bumpVersion(version, bump) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (match === null) {
    fail(`Unsupported semver version "${version}"`);
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function bumpVersionFiles(packageJsonPath, manifestPath, nextVersion) {
  const packageJson = readJson(packageJsonPath);
  const manifest = readJson(manifestPath);
  packageJson.version = nextVersion;
  manifest.version = nextVersion;
  writeJson(packageJsonPath, packageJson);
  writeJson(manifestPath, manifest);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function run(command, args, cwd) {
  console.log(
    `[bundle-plugin] ${relative(repoRoot, cwd) || "."}$ ${command} ${args.join(
      " ",
    )}`,
  );
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, npm_config_update_notifier: "false" },
  });
  if (result.status !== 0) {
    fail(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function printPlan(plan, mode) {
  console.log(`[bundle-plugin] mode=${mode}`);
  console.log(`[bundle-plugin] plugin=${plan.plugin}`);
  console.log(
    `[bundle-plugin] version=${plan.currentVersion} -> ${plan.nextVersion}`,
  );
  console.log(`[bundle-plugin] launcher=${plan.launcher}`);
  console.log(
    `[bundle-plugin] runtime externals=${
      plan.externals.length === 0 ? "(none)" : plan.externals.join(", ")
    }`,
  );
  console.log(`[bundle-plugin] dist entries=${plan.distEntries.join(", ")}`);
}

function fail(message) {
  throw Error(`[bundle-plugin] ${message}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
