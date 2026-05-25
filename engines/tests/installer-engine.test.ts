import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import type {
  DesiredState,
  FsReadPort,
  InstallPlan,
  ManagedWriter,
  ReconciliationOutcome,
  RepoState,
} from "../src/index.js";
import {
  INSTALLER_ENGINE_VERSION,
  InstallerEngine,
  isInstallPlan,
  isReconciliationReport,
} from "../src/index.js";

describe("InstallerEngine", () => {
  it("detects repository state through an injected read-only port", async () => {
    const readPort: FsReadPort = {
      async exists(path) {
        return path === "/repo";
      },
      async readFile(_path) {
        throw new Error("file not found");
      },
      async readDir(path) {
        if (path === "/repo") {
          return [];
        }
        throw new Error("dir not found");
      },
    };

    const state = await new InstallerEngine().detect(readPort, { workspaceRoot: "/repo" });

    expect(state.repo_classification).toBe("greenfield");
    expect(state.plugins.map((plugin) => plugin.plugin_id)).toEqual([
      "dev-genie",
      "guardrails",
      "audit",
      "katana",
      "daimyo",
    ]);
    expect(state.plugins.every((plugin) => !plugin.present)).toBe(true);
    expect(state.locks).toEqual([]);
    expect(state.last_run).toBeNull();
  });

  it("can still use the detector with the default workspace root", async () => {
    const readPort: FsReadPort = {
      async exists(path) {
        return path === ".";
      },
      async readFile(_path) {
        throw new Error("file not found");
      },
      async readDir(path) {
        if (path === ".") {
          return [];
        }
        throw new Error("dir not found");
      },
    };

    const state = await new InstallerEngine().detect(readPort);

    expect(state.repo_classification).toBe("greenfield");
  });

  it("exposes a node read adapter with read-only filesystem methods", async () => {
    const { NodeFsReadPort } = await import("../src/index.js");
    const port = new NodeFsReadPort();

    expect(await port.exists(new URL("../src/installer/detector.ts", import.meta.url).pathname)).toBe(true);
    await expect(port.readFile(new URL("../src/installer/detector.ts", import.meta.url).pathname))
      .resolves
      .toContain("export async function detect");
  });

  it("detects repository state through an injected read-only port", async () => {
    const readPort: FsReadPort = {
      async exists(_path) {
        return true;
      },
      async readFile(_path) {
        return "";
      },
      async readDir(_path) {
        return [];
      },
    };

    const state = await new InstallerEngine().detect(readPort, { workspaceRoot: "/repo" });

    expect(state.repo_classification).toBe("existing");
  });

  it("keeps plan(state, desired) synchronous, pure, and protocol-valid", async () => {
    const engine = new InstallerEngine();
    const state = repoState();
    const desired = desiredState();

    const firstPlan = engine.plan(state, desired);
    const secondPlan = engine.plan(state, desired);

    expect(isPromise(firstPlan)).toBe(false);
    expect(firstPlan).toEqual(secondPlan);
    expect(firstPlan).toEqual({
      plan_version: "1.0.0",
      engine_version: INSTALLER_ENGINE_VERSION,
      repo_classification: "greenfield",
      mutations: [],
    });
    expect(isInstallPlan(firstPlan)).toBe(true);

    const plannerSource = await readFile(new URL("../src/installer/planner.ts", import.meta.url), "utf8");
    expect(plannerSource).not.toMatch(/node:(fs|path)|FsReadPort|ManagedWriter|\bexists\b|\breadFile\b|\breadDir\b/);
  });

  it("emits a protocol-valid all-skipped ReconciliationReport from apply()", async () => {
    const engine = new InstallerEngine();
    const writer = noopManagedWriter();
    const plan: InstallPlan = {
      plan_version: "1.0.0",
      engine_version: INSTALLER_ENGINE_VERSION,
      repo_classification: "existing",
      mutations: [
        {
          mutation_id: "mutation:scaffold",
          target: "claude-settings-hook",
          target_path: ".claude/settings.json",
          action: "skip",
          write_strategy: "json_merge",
          managed_marker: null,
          reason_code: "already_satisfied",
          rationale: "Scaffold mutation used to prove report shape.",
          source_writer: "dev-genie:claude-settings",
        },
      ],
    };

    expect(isInstallPlan(plan)).toBe(true);

    const report = await engine.apply(plan, writer);

    expect(report).toEqual({
      report_version: "1.0.0",
      engine_version: INSTALLER_ENGINE_VERSION,
      repo_classification: "existing",
      had_conflict: false,
      counts: {
        applied: 0,
        skipped: 1,
        blocked: 0,
        conflict: 0,
      },
      outcomes: [
        {
          mutation_id: "mutation:scaffold",
          status: "skipped",
          reason_code: "already_satisfied",
          rationale: "claude-settings-hook at .claude/settings.json already satisfies the install plan; no write was attempted.",
        },
      ],
    });
    expect(isReconciliationReport(report)).toBe(true);
  });
});

function noopManagedWriter(): ManagedWriter {
  return {
    async readManagedRegion(request) {
      return {
        target_path: request.mutation.target_path,
        managed_marker: request.mutation.managed_marker ?? "",
        begin_marker: "",
        end_marker: "",
        present: false,
        content: null,
      };
    },
    async findLock() {
      return null;
    },
    async writeManagedRegion(request) {
      return appliedOutcome(request.mutation.mutation_id);
    },
    async writeLayered(request) {
      return appliedOutcome(request.mutation.mutation_id);
    },
    async mergeJson(request) {
      return appliedOutcome(request.mutation.mutation_id);
    },
    async writeFullFile(request) {
      return appliedOutcome(request.mutation.mutation_id);
    },
    async recordLastRun(request) {
      return appliedOutcome(request.mutation.mutation_id);
    },
    async delegatePlatformInstall(request) {
      return appliedOutcome(request.mutation.mutation_id);
    },
  };
}

function appliedOutcome(mutationId: string): ReconciliationOutcome {
  return {
    mutation_id: mutationId,
    status: "applied",
    reason_code: "written",
    rationale: "Test writer was called.",
  };
}

function repoState(): RepoState {
  return {
    repo_classification: "greenfield",
    plugins: [],
    managed_regions: [],
    locks: [],
    last_run: null,
    detection_report: {
      repoPath: "/repo",
      hasPackageJson: false,
      eslint: {
        found: false,
        files: [],
        flat: false,
        legacy: false,
        notes: "no eslint config found",
      },
      typescript: {
        found: false,
        files: [],
        notes: "no tsconfig found",
      },
      prettier: {
        found: false,
        files: [],
        notes: "no prettier config",
      },
      hooks: {
        found: false,
        husky: false,
        lefthook: false,
        nativePreCommit: false,
        preCommitFramework: false,
        files: [],
        notes: "no git hooks configured",
      },
      ci: {
        found: false,
        dir: ".github/workflows",
        workflows: [],
        anyRunsLint: false,
        anyRunsTypecheck: false,
        anyRunsAudit: false,
        anyRunsBuild: false,
        files: [],
        notes: "no CI config found",
      },
      scripts: {
        found: false,
        files: [],
        notes: "none of [lint, typecheck, format, test, build, audit] present",
      },
      packageScripts: {},
      audit: {
        found: false,
        hasDir: false,
        hasBaseline: false,
        hasHook: false,
        files: [],
        notes: "no .audit/ directory",
      },
      packageManager: {
        found: false,
        files: [],
        notes: "no lockfile found",
      },
      agentConfigs: [],
    },
  };
}

function desiredState(): DesiredState {
  return {
    plugins: [],
    configs: [],
  };
}

function isPromise(value: unknown): value is Promise<unknown> {
  return value instanceof Promise;
}
