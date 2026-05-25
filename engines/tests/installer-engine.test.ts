import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import type {
  DesiredState,
  FsReadPort,
  InstallPlan,
  ManagedWriter,
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
    const reads: string[] = [];
    const readPort: FsReadPort = {
      async exists(path) {
        reads.push(path);
        return true;
      },
      async readFile(path) {
        reads.push(path);
        return "";
      },
      async readDir(path) {
        reads.push(path);
        return [];
      },
    };

    const state = await new InstallerEngine().detect(readPort);

    expect(reads).toEqual(["."]);
    expect(state).toEqual({
      repo_classification: "existing",
      plugins: [],
      managed_regions: [],
      locks: [],
      last_run: null,
    });
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
    const writer: ManagedWriter = {
      async applyMutation(mutation) {
        return {
          mutation_id: mutation.mutation_id,
          status: "applied",
          reason_code: "written",
          rationale: "Test writer was called.",
        };
      },
    };
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
          reason_code: "delegated_skip",
          rationale: "Installer Engine scaffold does not apply managed writes until the applier implementation lands.",
        },
      ],
    });
    expect(isReconciliationReport(report)).toBe(true);
  });
});

function repoState(): RepoState {
  return {
    repo_classification: "greenfield",
    plugins: [],
    managed_regions: [],
    locks: [],
    last_run: null,
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
