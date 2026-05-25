import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type {
  InstallPlan,
  InstallPlanMutation,
  ManagedTargetLock,
  ManagedWriter,
  ReconciliationOutcome,
} from "../src/index.js";
import {
  INSTALLER_ENGINE_VERSION,
  applyInstallPlan,
  isReconciliationReport,
} from "../src/index.js";

const tempDirs: string[] = [];
const BEGIN = "<!-- dev-genie:guardrails:begin -->";
const END = "<!-- dev-genie:guardrails:end -->";

afterEach(async () => {
  const dirs = tempDirs.splice(0);
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("installer applier", () => {
  it("emits a schema-valid report in plan order with correct status rollups", async () => {
    const root = await tempRoot();
    const writer = new TrackingManagedWriter(root, {
      locks: [".claude/settings.json"],
      regions: {
        "AGENTS.md": "user edited body",
      },
    });
    const plan = planFor([
      mutation("managed:apply", "agent-config-guardrails", "CLAUDE.md", "managed_region", "dev-genie:agent-config", "missing"),
      mutation("audit:skip", "audit-baseline", ".audit/audit.config.json", "full_file", "dev-genie:audit", "already_satisfied", "skip"),
      mutation("settings:locked", "claude-settings-hooks", ".claude/settings.json", "json_merge", "dev-genie:claude-settings", "locked"),
      mutation("managed:conflict", "agent-config-guardrails", "AGENTS.md", "managed_region", "dev-genie:agent-config", "conflicting"),
    ]);

    const report = await applyInstallPlan(plan, writer, {
      workspaceRoot: root,
      engineVersion: INSTALLER_ENGINE_VERSION,
    });

    expect(report.outcomes.map((outcome) => outcome.mutation_id)).toEqual([
      "managed:apply",
      "audit:skip",
      "settings:locked",
      "managed:conflict",
    ]);
    expect(report.outcomes.map((outcome) => outcome.status)).toEqual([
      "applied",
      "skipped",
      "blocked",
      "conflict",
    ]);
    expect(report.counts).toEqual({
      applied: 1,
      skipped: 1,
      blocked: 1,
      conflict: 1,
    });
    expect(report.had_conflict).toBe(true);
    expect(isReconciliationReport(report)).toBe(true);
    expect(writer.writeCalls).toEqual(["managed:apply"]);
    expect(writer.lastRunWrites).toBe(1);
  });

  it("does not write when a managed region drifted from its recorded baseline", async () => {
    const root = await tempRoot();
    const target = join(root, "AGENTS.md");
    const original = `user prose\n${BEGIN}\nuser edited body\n${END}\n`;
    await writeFile(target, original, "utf8");
    const writer = new TrackingManagedWriter(root);
    const plan = planFor([
      mutation("managed:conflict", "agent-config-guardrails", "AGENTS.md", "managed_region", "dev-genie:agent-config", "conflicting"),
    ]);

    const report = await applyInstallPlan(plan, writer, { workspaceRoot: root });
    const after = await readFile(target, "utf8");

    expect(report.outcomes).toMatchObject([
      {
        status: "conflict",
        reason_code: "managed_region_drift",
        detail: {
          current_region: "user edited body",
        },
      },
    ]);
    expect(after).toBe(original);
    expect(writer.writeCalls).toEqual([]);
    expect(writer.lastRunWrites).toBe(0);
  });

  it("is idempotent when applying the same managed-region plan twice", async () => {
    const root = await tempRoot();
    const target = join(root, "CLAUDE.md");
    const writer = new TrackingManagedWriter(root);
    const plan = planFor([
      mutation("managed:apply", "agent-config-guardrails", "CLAUDE.md", "managed_region", "dev-genie:agent-config", "missing"),
    ]);

    const first = await applyInstallPlan(plan, writer, { workspaceRoot: root });
    const firstBytes = await readFile(target, "utf8");
    const second = await applyInstallPlan(plan, writer, { workspaceRoot: root });
    const secondBytes = await readFile(target, "utf8");

    expect(first.outcomes.map((outcome) => outcome.status)).toEqual(["applied"]);
    expect(second.outcomes).toMatchObject([
      {
        status: "skipped",
        reason_code: "already_satisfied",
      },
    ]);
    expect(secondBytes).toBe(firstBytes);
    expect(writer.writeCalls).toEqual(["managed:apply"]);
    expect(writer.lastRunWrites).toBe(1);
  });

  it("blocks locked targets before invoking any write method", async () => {
    const root = await tempRoot();
    const writer = new TrackingManagedWriter(root, {
      locks: ["CLAUDE.md"],
    });
    const plan = planFor([
      mutation("managed:locked", "agent-config-guardrails", "CLAUDE.md", "managed_region", "dev-genie:agent-config", "locked"),
    ]);

    const report = await applyInstallPlan(plan, writer, { workspaceRoot: root });

    expect(report.outcomes).toMatchObject([
      {
        status: "blocked",
        reason_code: "lock_blocked",
        detail: {
          pattern: "CLAUDE.md",
          target_path: "CLAUDE.md",
        },
      },
    ]);
    expect(writer.writeCalls).toEqual([]);
    expect(writer.lockQueries).toEqual(["managed:locked"]);
    expect(writer.lastRunWrites).toBe(0);
  });

  it("returns predicted dry-run outcomes without writing files or last-run state", async () => {
    const root = await tempRoot();
    const writer = new TrackingManagedWriter(root);
    const plan = planFor([
      mutation("managed:dry-run", "agent-config-guardrails", "CLAUDE.md", "managed_region", "dev-genie:agent-config", "missing"),
      mutation("settings:dry-run", "claude-settings-hooks", ".claude/settings.json", "json_merge", "dev-genie:claude-settings", "missing"),
    ]);

    const report = await applyInstallPlan(plan, writer, {
      workspaceRoot: root,
      dryRun: true,
    });

    expect(report.outcomes).toMatchObject([
      {
        status: "skipped",
        reason_code: "delegated_skip",
        detail: {
          dry_run: true,
          planned_action: "create",
        },
      },
      {
        status: "skipped",
        reason_code: "delegated_skip",
        detail: {
          dry_run: true,
          planned_action: "create",
        },
      },
    ]);
    await expect(readFile(join(root, "CLAUDE.md"), "utf8")).rejects.toThrow();
    await expect(readFile(join(root, ".dev-genie", "init.last-run.json"), "utf8")).rejects.toThrow();
    expect(writer.writeCalls).toEqual([]);
    expect(writer.lastRunWrites).toBe(0);
    expect(isReconciliationReport(report)).toBe(true);
  });

  it("does not invoke mutation writes for already_satisfied plans", async () => {
    const root = await tempRoot();
    const writer = new TrackingManagedWriter(root);
    const plan = planFor([
      mutation("managed:skip", "agent-config-guardrails", "CLAUDE.md", "managed_region", "dev-genie:agent-config", "already_satisfied", "skip"),
      mutation("audit:skip", "audit-baseline", ".audit/audit.config.json", "full_file", "dev-genie:audit", "already_satisfied", "skip"),
    ]);

    const report = await applyInstallPlan(plan, writer, { workspaceRoot: root });

    expect(report.outcomes.every((outcome) => outcome.status === "skipped")).toBe(true);
    expect(report.outcomes.every((outcome) => outcome.reason_code === "already_satisfied")).toBe(true);
    expect(writer.writeCalls).toEqual([]);
    expect(writer.lastRunWrites).toBe(0);
  });
});

class TrackingManagedWriter implements ManagedWriter {
  readonly writeCalls: string[] = [];
  readonly lockQueries: string[] = [];
  lastRunWrites = 0;

  private readonly locks: readonly string[];
  private readonly regions: Readonly<Record<string, string>>;

  constructor(
    private readonly workspaceRoot: string,
    options: Readonly<{
      readonly locks?: readonly string[];
      readonly regions?: Readonly<Record<string, string>>;
    }> = {},
  ) {
    this.locks = options.locks ?? [];
    this.regions = options.regions ?? {};
  }

  async readManagedRegion(request: Parameters<ManagedWriter["readManagedRegion"]>[0]) {
    const filePath = join(this.workspaceRoot, request.mutation.target_path);
    const content = await readRegion(filePath);
    return {
      target_path: request.mutation.target_path,
      managed_marker: request.mutation.managed_marker ?? "<!-- dev-genie:guardrails:begin/end -->",
      begin_marker: BEGIN,
      end_marker: END,
      present: content !== null || this.regions[request.mutation.target_path] !== undefined,
      content: content ?? this.regions[request.mutation.target_path] ?? null,
    };
  }

  async findLock(request: Parameters<ManagedWriter["findLock"]>[0]): Promise<ManagedTargetLock | null> {
    this.lockQueries.push(request.mutation.mutation_id);
    if (!this.locks.includes(request.mutation.target_path) && request.mutation.reason_code !== "locked") {
      return null;
    }
    return {
      pattern: request.mutation.target_path,
      reason: "locked for test",
      target_path: request.mutation.target_path,
      agent_file: "AGENTS.md",
      source_line: 7,
    };
  }

  async writeManagedRegion(request: Parameters<ManagedWriter["writeManagedRegion"]>[0]): Promise<ReconciliationOutcome> {
    this.writeCalls.push(request.mutation.mutation_id);
    const filePath = join(this.workspaceRoot, request.mutation.target_path);
    await mkdir(dirname(filePath), { recursive: true });
    const previous = await readOptional(filePath);
    const block = `${BEGIN}\n${request.body}\n${END}\n`;
    const next = previous === null
      ? block
      : replaceOrAppend(previous, block);
    if (next !== previous) {
      await writeFile(filePath, next, "utf8");
      return appliedOutcome(request.mutation.mutation_id);
    }
    return skippedOutcome(request.mutation.mutation_id);
  }

  async writeLayered(request: Parameters<ManagedWriter["writeLayered"]>[0]): Promise<ReconciliationOutcome> {
    this.writeCalls.push(request.mutation.mutation_id);
    return appliedOutcome(request.mutation.mutation_id);
  }

  async mergeJson(request: Parameters<ManagedWriter["mergeJson"]>[0]): Promise<ReconciliationOutcome> {
    this.writeCalls.push(request.mutation.mutation_id);
    return appliedOutcome(request.mutation.mutation_id);
  }

  async writeFullFile(request: Parameters<ManagedWriter["writeFullFile"]>[0]): Promise<ReconciliationOutcome> {
    this.writeCalls.push(request.mutation.mutation_id);
    return appliedOutcome(request.mutation.mutation_id);
  }

  async recordLastRun(request: Parameters<ManagedWriter["recordLastRun"]>[0]): Promise<ReconciliationOutcome> {
    this.lastRunWrites += 1;
    const filePath = join(this.workspaceRoot, ".dev-genie", "init.last-run.json");
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify({ plan: request.plan }, null, 2)}\n`, "utf8");
    return appliedOutcome(request.mutation.mutation_id);
  }

  async delegatePlatformInstall(request: Parameters<ManagedWriter["delegatePlatformInstall"]>[0]): Promise<ReconciliationOutcome> {
    this.writeCalls.push(request.mutation.mutation_id);
    return appliedOutcome(request.mutation.mutation_id);
  }
}

async function tempRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "installer-applier-"));
  tempDirs.push(dir);
  return dir;
}

function planFor(mutations: readonly InstallPlanMutation[]): InstallPlan {
  return {
    plan_version: "1.0.0",
    engine_version: INSTALLER_ENGINE_VERSION,
    repo_classification: "existing",
    mutations: [...mutations],
  };
}

function mutation(
  mutationId: string,
  target: string,
  targetPath: string,
  writeStrategy: InstallPlanMutation["write_strategy"],
  sourceWriter: InstallPlanMutation["source_writer"],
  reasonCode: InstallPlanMutation["reason_code"],
  action: InstallPlanMutation["action"] = reasonCode === "missing" ? "create" : "update",
): InstallPlanMutation {
  return {
    mutation_id: mutationId,
    target,
    target_path: targetPath,
    action,
    write_strategy: writeStrategy,
    managed_marker: writeStrategy === "managed_region" ? "<!-- dev-genie:guardrails:begin/end -->" : null,
    reason_code: reasonCode,
    rationale: "test mutation",
    source_writer: sourceWriter,
  };
}

async function readRegion(filePath: string): Promise<string | null> {
  const raw = await readOptional(filePath);
  if (raw === null) {
    return null;
  }
  const begin = raw.indexOf(BEGIN);
  if (begin === -1) {
    return null;
  }
  const contentStart = begin + BEGIN.length;
  const end = raw.indexOf(END, contentStart);
  if (end === -1) {
    return null;
  }
  return raw.slice(contentStart, end).replace(/^\r?\n/, "").replace(/\r?\n$/, "");
}

async function readOptional(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (_error) {
    return null;
  }
}

function replaceOrAppend(previous: string, block: string): string {
  const begin = previous.indexOf(BEGIN);
  if (begin === -1) {
    return `${previous}${previous.endsWith("\n") ? "\n" : "\n\n"}${block}`;
  }
  const end = previous.indexOf(END, begin + BEGIN.length);
  if (end === -1) {
    return `${previous}${previous.endsWith("\n") ? "\n" : "\n\n"}${block}`;
  }
  return `${previous.slice(0, begin)}${block.trimEnd()}${previous.slice(end + END.length)}`;
}

function appliedOutcome(mutationId: string): ReconciliationOutcome {
  return {
    mutation_id: mutationId,
    status: "applied",
    reason_code: "written",
    rationale: "test writer applied",
  };
}

function skippedOutcome(mutationId: string): ReconciliationOutcome {
  return {
    mutation_id: mutationId,
    status: "skipped",
    reason_code: "already_satisfied",
    rationale: "test writer skipped",
  };
}
