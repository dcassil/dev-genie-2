import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type {
  DevGenieWriterDependencies,
  InstallPlanMutation,
  KatanaPlatformDependencies,
} from "../src/index.js";
import {
  DevGenieManagedWriterAdapter,
  KatanaPlatformWriterAdapter,
} from "../src/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  const dirs = tempDirs.splice(0);
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("DevGenieManagedWriterAdapter", () => {
  it("delegates managed-region writes to dev-genie's fenced agent-config writer", async () => {
    const calls: string[] = [];
    const adapter = new DevGenieManagedWriterAdapter({
      dependencies: devGenieDeps({
        writeAgentBlock(filePath, body) {
          calls.push(`${filePath}:${body}`);
          return { ok: true, changed: true, action: "created" };
        },
      }),
    });
    const root = await tempRoot();
    const mutation = mutationFor("managed_region", "dev-genie:agent-config", "CLAUDE.md");

    const outcome = await adapter.writeManagedRegion({
      workspaceRoot: root,
      mutation,
      body: "Run guardrails before edits.",
    });

    expect(calls).toEqual([`${join(root, "CLAUDE.md")}:Run guardrails before edits.`]);
    expect(outcome).toMatchObject({
      mutation_id: mutation.mutation_id,
      status: "applied",
      reason_code: "written",
    });
  });

  it("maps dev-genie locks to blocked and does not call the writer", async () => {
    let writes = 0;
    const adapter = new DevGenieManagedWriterAdapter({
      dependencies: devGenieDeps({
        findLockForFinding() {
          return {
            pattern: "CLAUDE.md",
            reason: "do not edit CLAUDE.md",
            sourceLine: 7,
            agentFile: "AGENTS.md",
          };
        },
        writeAgentBlock() {
          writes += 1;
          return { ok: true, changed: true, action: "replaced" };
        },
      }),
    });
    const mutation = mutationFor("managed_region", "dev-genie:agent-config", "CLAUDE.md");

    const outcome = await adapter.writeManagedRegion({
      workspaceRoot: await tempRoot(),
      mutation,
      body: "new content",
    });

    expect(writes).toBe(0);
    expect(outcome).toMatchObject({
      status: "blocked",
      reason_code: "lock_blocked",
      detail: {
        pattern: "CLAUDE.md",
        agent_file: "AGENTS.md",
        source_line: 7,
      },
    });
  });

  it("exposes the current on-disk managed region for applier conflict checks", async () => {
    const root = await tempRoot();
    await writeFile(
      join(root, "CLAUDE.md"),
      "user text\n<!-- dev-genie:guardrails:begin -->\nchanged by user\n<!-- dev-genie:guardrails:end -->\n",
    );
    const adapter = new DevGenieManagedWriterAdapter({
      dependencies: devGenieDeps(),
    });

    const snapshot = await adapter.readManagedRegion({
      workspaceRoot: root,
      mutation: mutationFor("managed_region", "dev-genie:agent-config", "CLAUDE.md"),
    });

    expect(snapshot).toMatchObject({
      present: true,
      content: "changed by user",
      begin_marker: "<!-- dev-genie:guardrails:begin -->",
      end_marker: "<!-- dev-genie:guardrails:end -->",
    });
  });

  it("uses dev-genie dry-run apply mode instead of writing", async () => {
    const dryRunModes: string[] = [];
    let writes = 0;
    const adapter = new DevGenieManagedWriterAdapter({
      dependencies: devGenieDeps({
        applyFindings(opts) {
          dryRunModes.push(opts.mode);
          return { applied: [], skipped: ["mutation:agent"], errors: [] };
        },
        writeAgentBlock() {
          writes += 1;
          return { ok: true, changed: true, action: "created" };
        },
      }),
    });

    const outcome = await adapter.writeManagedRegion({
      workspaceRoot: await tempRoot(),
      mutation: mutationFor("managed_region", "dev-genie:agent-config", "CLAUDE.md"),
      body: "content",
      dryRun: true,
    });

    expect(writes).toBe(0);
    expect(dryRunModes).toEqual(["dry-run"]);
    expect(outcome).toMatchObject({
      status: "skipped",
      reason_code: "delegated_skip",
      detail: {
        dry_run: true,
      },
    });
  });

  it("delegates layered, JSON merge, audit, and plan-store writes to dev-genie modules", async () => {
    const calls: string[] = [];
    const adapter = new DevGenieManagedWriterAdapter({
      dependencies: devGenieDeps({
        writeLayeredEslintConfig(_repoPath, rules) {
          calls.push(`eslint:${Object.keys(rules).join(",")}`);
          return { ok: true, mode: "flat", path: "eslint.config.guardrails.mjs" };
        },
        mergeEditLintHook(opts) {
          calls.push(`settings:${opts.settingsPath}`);
          return { action: "added", changed: true, path: opts.settingsPath };
        },
        installAudit(_repoPath, opts) {
          calls.push(`audit:${opts?.components?.join(",") ?? "missing"}`);
          return { changed: ["configDir"], skipped: [], errors: [] };
        },
        ensureGitignore() {
          calls.push("gitignore");
          return true;
        },
        saveLastRun() {
          calls.push("last-run");
          return { schemaVersion: 1 };
        },
      }),
    });
    const root = await tempRoot();

    const layered = await adapter.writeLayered({
      workspaceRoot: root,
      mutation: mutationFor("layered", "dev-genie:eslint-layered", "eslint.config.guardrails.mjs"),
      rules: { semi: ["error", "always"] },
    });
    const merged = await adapter.mergeJson({
      workspaceRoot: root,
      mutation: mutationFor("json_merge", "dev-genie:claude-settings", ".claude/settings.json"),
    });
    const audit = await adapter.writeFullFile({
      workspaceRoot: root,
      mutation: mutationFor("full_file", "dev-genie:audit", ".audit/audit.config.json"),
      components: ["configDir"],
    });
    const lastRun = await adapter.recordLastRun({
      workspaceRoot: root,
      mutation: mutationFor("full_file", "dev-genie:audit", ".dev-genie/init.last-run.json"),
      plan: [],
    });

    expect(calls).toEqual([
      "eslint:semi",
      `settings:${join(root, ".claude/settings.json")}`,
      "audit:configDir",
      "gitignore",
      "last-run",
    ]);
    expect([layered.status, merged.status, audit.status, lastRun.status]).toEqual([
      "applied",
      "applied",
      "applied",
      "applied",
    ]);
  });
});

describe("KatanaPlatformWriterAdapter", () => {
  it("delegates platform installs through getAdapter(platformId).install(opts)", async () => {
    const calls: string[] = [];
    const adapter = new KatanaPlatformWriterAdapter({
      katanaRoot: "/katana",
      dependencies: katanaDeps(calls, {
        files: [
          { path: ".mcp.json", action: "created", bytes: 42 },
          { path: "CLAUDE.md", action: "skipped", bytes: 10 },
        ],
        warnings: ["shortcut skipped"],
      }),
    });
    const root = await tempRoot();
    const mutation = mutationFor("delegated", "katana:platform", ".mcp.json", "katana:cursor");

    const outcome = await adapter.delegatePlatformInstall({
      workspaceRoot: root,
      mutation,
      dryRun: true,
      force: true,
    });

    expect(calls).toEqual([`cursor:${root}:${join(root, ".katana")}:true:true`]);
    expect(outcome).toMatchObject({
      mutation_id: mutation.mutation_id,
      status: "applied",
      reason_code: "written",
      detail: {
        platform: "cursor",
        warnings: ["shortcut skipped"],
        dry_run: true,
      },
    });
  });

  it("maps skipped and removed katana file actions onto the installer taxonomy", async () => {
    const skipped = new KatanaPlatformWriterAdapter({
      katanaRoot: "/katana",
      dependencies: katanaDeps([], {
        files: [{ path: ".mcp.json", action: "skipped", bytes: 7 }],
      }),
    });
    const removed = new KatanaPlatformWriterAdapter({
      katanaRoot: "/katana",
      dependencies: katanaDeps([], {
        files: [{ path: ".old", action: "removed", bytes: 0 }],
      }),
    });

    const skippedOutcome = await skipped.delegatePlatformInstall({
      workspaceRoot: await tempRoot(),
      mutation: mutationFor("delegated", "katana:platform", ".mcp.json"),
    });
    const removedOutcome = await removed.delegatePlatformInstall({
      workspaceRoot: await tempRoot(),
      mutation: mutationFor("delegated", "katana:platform", ".mcp.json"),
    });

    expect(skippedOutcome).toMatchObject({
      status: "skipped",
      reason_code: "already_satisfied",
    });
    expect(removedOutcome).toMatchObject({
      status: "applied",
      reason_code: "written",
      detail: {
        files: [
          {
            action: "removed",
            removal: true,
          },
        ],
      },
    });
  });
});

async function tempRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "installer-writer-"));
  tempDirs.push(dir);
  return dir;
}

function mutationFor(
  writeStrategy: InstallPlanMutation["write_strategy"],
  sourceWriter: InstallPlanMutation["source_writer"],
  targetPath: string,
  target: string = "agent-config-guardrails",
): InstallPlanMutation {
  return {
    mutation_id: `mutation:${target.replace(/[^a-z0-9]+/g, "-")}`,
    target,
    target_path: targetPath,
    action: "update",
    write_strategy: writeStrategy,
    managed_marker: writeStrategy === "managed_region" ? "<!-- dev-genie:guardrails:begin/end -->" : null,
    reason_code: "stale",
    rationale: "test mutation",
    source_writer: sourceWriter,
  };
}

function devGenieDeps(overrides: Partial<DevGenieWriterDependencies> = {}): DevGenieWriterDependencies {
  return {
    writeAgentBlock() {
      return { ok: true, changed: false, action: "noop" };
    },
    writeLayeredEslintConfig() {
      return { ok: true, mode: "flat", path: "eslint.config.guardrails.mjs" };
    },
    mergeEditLintHook(opts) {
      return { action: "noop", changed: false, path: opts.settingsPath };
    },
    installAudit() {
      return { changed: [], skipped: ["configDir"], errors: [] };
    },
    applyFindings() {
      return { applied: [], skipped: [], errors: [] };
    },
    findLockForFinding() {
      return null;
    },
    saveLastRun() {
      return { schemaVersion: 1 };
    },
    ensureGitignore() {
      return false;
    },
    beginMarker: "<!-- dev-genie:guardrails:begin -->",
    endMarker: "<!-- dev-genie:guardrails:end -->",
    ...overrides,
  };
}

function katanaDeps(
  calls: string[],
  report: Readonly<{
    files?: readonly { readonly path: string; readonly action: "created" | "updated" | "skipped" | "removed"; readonly bytes: number }[];
    warnings?: readonly string[];
  }>,
): KatanaPlatformDependencies {
  return {
    getAdapter(platformId) {
      return {
        id: platformId,
        async install(opts) {
          calls.push(`${platformId}:${opts.workspaceRoot}:${opts.katanaRoot}:${opts.dryRun ?? false}:${opts.force ?? false}`);
          return {
            platform: platformId,
            files: report.files ?? [],
            mcpRegistered: true,
            commands: ["katana-board"],
            warnings: report.warnings ?? [],
          };
        },
      };
    },
  };
}
