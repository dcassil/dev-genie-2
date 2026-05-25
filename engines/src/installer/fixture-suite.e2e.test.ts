import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ValidateFunction } from "ajv";
import { afterEach, describe, expect, it } from "vitest";

import type {
  DesiredConfigTarget,
  DesiredState,
  FsReadPort,
  InstallPlan,
  ManagedWriter,
  ReconciliationReport,
  RepoState,
} from "../index.js";
import {
  DevGenieManagedWriterAdapter,
  INSTALLER_ENGINE_VERSION,
  InstallerEngine,
  KatanaPlatformWriterAdapter,
  NodeFsReadPort,
  NodeManagedWriterAdapter,
  validatorFor,
} from "../index.js";

const tempDirs: string[] = [];
const BEGIN = "<!-- dev-genie:guardrails:begin -->";
const END = "<!-- dev-genie:guardrails:end -->";
const DEFAULT_MANAGED_REGION_BODY = [
  "Dev-genie managed guardrails configuration.",
  "Re-run the Installer Engine to reconcile this block.",
].join("\n");

const validateInstallPlan = validatorFor("InstallPlan");
const validateReconciliationReport = validatorFor("ReconciliationReport");

afterEach(async () => {
  const dirs = tempDirs.splice(0);
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("installer end-to-end fixture suite", () => {
  it("greenfield install produces a schema-valid create plan and applied report", async () => {
    const root = await tempRoot("greenfield");
    const result = await runInstall(root, managedDesired());

    expect(result.state.repo_classification).toBe("greenfield");
    expect(result.plan).toMatchObject({
      repo_classification: "greenfield",
      mutations: [
        {
          target: "agent-config-guardrails",
          target_path: "CLAUDE.md",
          action: "create",
          reason_code: "missing",
          source_writer: "dev-genie:agent-config",
        },
      ],
    });
    expect(result.report).toMatchObject({
      repo_classification: "greenfield",
      had_conflict: false,
      counts: {
        applied: 1,
        skipped: 0,
        blocked: 0,
        conflict: 0,
      },
      outcomes: [
        {
          status: "applied",
          reason_code: "written",
        },
      ],
    });
    await expect(readFile(join(root, "CLAUDE.md"), "utf8")).resolves.toContain(BEGIN);
  });

  it("existing-repo adoption appends the managed region without removing user prose", async () => {
    const root = await tempRoot("existing");
    await writeFile(join(root, "package.json"), `${JSON.stringify({ scripts: { test: "node --test" } }, null, 2)}\n`);
    await writeFile(join(root, "CLAUDE.md"), "# Project\n\nKeep this local guidance.\n");

    const result = await runInstall(root, managedDesired());
    const claudeMd = await readFile(join(root, "CLAUDE.md"), "utf8");

    expect(result.state.repo_classification).toBe("existing");
    expect(result.plan.repo_classification).toBe("existing");
    expect(result.plan.mutations).toMatchObject([
      {
        action: "create",
        reason_code: "missing",
      },
    ]);
    expect(result.report.counts).toEqual({
      applied: 1,
      skipped: 0,
      blocked: 0,
      conflict: 0,
    });
    expect(claudeMd).toContain("Keep this local guidance.");
    expect(claudeMd).toContain(DEFAULT_MANAGED_REGION_BODY);
  });

  it("idempotent rerun is a no-op with all skipped outcomes and byte-identical files", async () => {
    const root = await tempRoot("idempotent");
    const first = await runInstall(root, managedDesired());
    const firstSnapshot = await snapshotFiles(root);
    const second = await runInstall(root, managedDesired());
    const secondSnapshot = await snapshotFiles(root);

    expect(first.report.counts.applied).toBe(1);
    expect(second.plan.mutations.every((mutation) => mutation.action === "skip")).toBe(true);
    expect(second.report.outcomes.every((outcome) => outcome.status === "skipped")).toBe(true);
    expect(second.report.counts).toEqual({
      applied: 0,
      skipped: second.report.outcomes.length,
      blocked: 0,
      conflict: 0,
    });
    expect(secondSnapshot).toEqual(firstSnapshot);
  });

  it("managed-region conflict is reported and the hand-mutated file is not clobbered", async () => {
    const root = await tempRoot("conflict");
    await writeFile(join(root, "CLAUDE.md"), managedFile("recorded baseline"));

    const engine = new InstallerEngine();
    const readPort = new NodeFsReadPort();
    const writer = new NodeManagedWriterAdapter();
    const state = await engine.detect(readPort, { workspaceRoot: root });
    const plan = engine.plan(state, managedDesired({ status: "conflicting" }));
    expectInstallPlanValid(plan);

    const handMutated = managedFile("hand-mutated by consumer before apply");
    await writeFile(join(root, "CLAUDE.md"), handMutated);

    const report = await engine.apply(plan, writer, { workspaceRoot: root });
    expectReconciliationReportValid(report);
    const after = await readFile(join(root, "CLAUDE.md"), "utf8");

    expect(plan.mutations).toMatchObject([
      {
        action: "update",
        reason_code: "conflicting",
      },
    ]);
    expect(report).toMatchObject({
      had_conflict: true,
      counts: {
        applied: 0,
        skipped: 0,
        blocked: 0,
        conflict: 1,
      },
      outcomes: [
        {
          status: "conflict",
          reason_code: "managed_region_drift",
        },
      ],
    });
    expect(after).toBe(handMutated);
  });

  it("already-satisfied managed-region mutation is skipped", async () => {
    const root = await tempRoot("satisfied");
    const original = managedFile(DEFAULT_MANAGED_REGION_BODY);
    await writeFile(join(root, "CLAUDE.md"), original);

    const result = await runInstall(root, managedDesired());
    const after = await readFile(join(root, "CLAUDE.md"), "utf8");

    expect(result.plan.mutations).toMatchObject([
      {
        action: "skip",
        reason_code: "already_satisfied",
      },
    ]);
    expect(result.report).toMatchObject({
      had_conflict: false,
      counts: {
        applied: 0,
        skipped: 1,
        blocked: 0,
        conflict: 0,
      },
      outcomes: [
        {
          status: "skipped",
          reason_code: "already_satisfied",
        },
      ],
    });
    expect(after).toBe(original);
  });
});

describe("installer public consumer seam", () => {
  it("re-exports the stable installer surface from the package entry", () => {
    const readPort: FsReadPort = new NodeFsReadPort();
    const writer: ManagedWriter = new NodeManagedWriterAdapter();
    const desired: DesiredState = managedDesired();
    const repoState: Pick<RepoState, "repo_classification"> = { repo_classification: "greenfield" };

    expect(typeof InstallerEngine).toBe("function");
    expect(typeof NodeFsReadPort).toBe("function");
    expect(typeof NodeManagedWriterAdapter).toBe("function");
    expect(typeof DevGenieManagedWriterAdapter).toBe("function");
    expect(typeof KatanaPlatformWriterAdapter).toBe("function");
    expect(INSTALLER_ENGINE_VERSION).toBe("0.8.0");
    expect(readPort).toBeInstanceOf(NodeFsReadPort);
    expect(writer).toBeInstanceOf(NodeManagedWriterAdapter);
    expect(desired.configs[0]?.target).toBe("agent-config-guardrails");
    expect(repoState.repo_classification).toBe("greenfield");
  });

  it("lets bootstrap branch on typed report fields without prose parsing", async () => {
    const root = await tempRoot("bootstrap-seam");
    const engine = new InstallerEngine();
    const readPort = new NodeFsReadPort();
    const writer = new NodeManagedWriterAdapter();
    const desired: DesiredState = managedDesired();

    const state = await engine.detect(readPort, { workspaceRoot: root });
    const plan = engine.plan(state, desired);
    expectInstallPlanValid(plan);
    const report = await engine.apply(plan, writer, { workspaceRoot: root });
    expectReconciliationReportValid(report);

    const nextBranch = report.had_conflict
      ? "review-conflict"
      : report.counts.applied > 0
        ? "continue-after-install"
        : "nothing-to-apply";

    expect(report.had_conflict).toBe(false);
    expect(report.counts.applied).toBe(1);
    expect(nextBranch).toBe("continue-after-install");
  });
});

interface InstallResult {
  readonly state: RepoState;
  readonly plan: InstallPlan;
  readonly report: ReconciliationReport;
}

async function runInstall(root: string, desired: DesiredState): Promise<InstallResult> {
  const engine = new InstallerEngine();
  const readPort = new NodeFsReadPort();
  const writer = new NodeManagedWriterAdapter();
  const state = await engine.detect(readPort, { workspaceRoot: root });
  const plan = engine.plan(state, desired);
  expectInstallPlanValid(plan);
  const report = await engine.apply(plan, writer, { workspaceRoot: root });
  expectReconciliationReportValid(report);
  return { state, plan, report };
}

interface ManagedDesiredOptions {
  readonly targetPath?: string;
  readonly status?: DesiredConfigTarget["status"];
}

function managedDesired(options: ManagedDesiredOptions = {}): DesiredState {
  const status = options.status;
  const targetPath = options.targetPath ?? "CLAUDE.md";
  const config: DesiredConfigTarget = {
    target: "agent-config-guardrails",
    target_path: targetPath,
    required: true,
    ...(status === undefined ? {} : { status }),
  };
  return {
    plugins: [],
    configs: [config],
  };
}

async function tempRoot(label: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `installer-${label}-`));
  tempDirs.push(dir);
  return dir;
}

function managedFile(body: string): string {
  return [
    "# Project",
    "",
    BEGIN,
    body,
    END,
    "",
  ].join("\n");
}

async function snapshotFiles(root: string): Promise<Readonly<Record<string, string>>> {
  const entries: Record<string, string> = {};
  await collectSnapshotEntries(root, "", entries);
  return Object.fromEntries(Object.entries(entries).sort());
}

async function collectSnapshotEntries(
  root: string,
  relativeDir: string,
  entries: Record<string, string>,
): Promise<void> {
  const absoluteDir = relativeDir.length === 0 ? root : join(root, relativeDir);
  const dirents = await readdir(absoluteDir, { withFileTypes: true });
  for (const dirent of dirents.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = relativeDir.length === 0 ? dirent.name : `${relativeDir}/${dirent.name}`;
    const absolutePath = join(root, relativePath);
    if (dirent.isDirectory()) {
      await collectSnapshotEntries(root, relativePath, entries);
    } else if (dirent.isFile()) {
      entries[relativePath] = (await readFile(absolutePath)).toString("base64");
    }
  }
}

function expectInstallPlanValid(plan: InstallPlan): void {
  expectSchemaValid(validateInstallPlan, plan);
}

function expectReconciliationReportValid(report: ReconciliationReport): void {
  expectSchemaValid(validateReconciliationReport, report);
}

function expectSchemaValid(validator: ValidateFunction, value: InstallPlan | ReconciliationReport): void {
  const valid = validator(value);
  expect(validator.errors ?? []).toEqual([]);
  expect(valid).toBe(true);
}
