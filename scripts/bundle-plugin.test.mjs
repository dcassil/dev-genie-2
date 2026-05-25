import { mkdtempSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

import {
  bumpVersion,
  readRequiredRuntimeDeps,
} from "./bundle-plugin.mjs";

const repoRoot = resolve(import.meta.dirname, "..");

test("bumps plugin versions predictably", () => {
  assert.equal(bumpVersion("1.2.3", "patch"), "1.2.4");
  assert.equal(bumpVersion("1.2.3", "minor"), "1.3.0");
});

test("reads launcher requiredRuntimeDeps", () => {
  assert.deepEqual(
    readRequiredRuntimeDeps(join(repoRoot, "katana/bin/katana-mcp.js")),
    ["better-sqlite3"],
  );
  assert.deepEqual(
    readRequiredRuntimeDeps(join(repoRoot, "daimyo/bin/daimyo-mcp.js")),
    ["@anthropic-ai/claude-agent-sdk"],
  );
});

test("bundle dry-run enforces externals alignment without writing", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/bundle-plugin.mjs", "daimyo", "--dry-run"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /mode=dry-run/);
  assert.match(result.stdout, /runtime externals=@anthropic-ai\/claude-agent-sdk/);
});

test("readRequiredRuntimeDeps rejects malformed launcher lists", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bundle-plugin-test-"));
  try {
    const launcher = join(dir, "bad.js");
    writeFileSync(launcher, "const requiredRuntimeDeps = [not-json];\n");
    assert.throws(
      () => readRequiredRuntimeDeps(launcher),
      /Could not parse requiredRuntimeDeps/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
