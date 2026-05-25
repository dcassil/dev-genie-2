import { describe, expect, it } from "vitest";

import type {
  DesiredState,
  DetectedManagedRegionPresence,
  DetectedPluginPresence,
  ExistingConfigDetectionReport,
  LockDeclaration,
  ManagedRegionBounds,
  RepoState,
} from "../src/index.js";
import {
  INSTALLER_ENGINE_VERSION,
  isInstallPlan,
  plan,
} from "../src/index.js";

describe("installer planner", () => {
  it("is deterministic across repeated calls and independently constructed identical inputs", () => {
    const first = plan(existingPlannerState(), existingPlannerDesired());
    const second = plan(existingPlannerState(), existingPlannerDesired());
    const repeated = plan(existingPlannerState(), existingPlannerDesired());

    expect(first).toEqual(second);
    expect(first).toEqual(repeated);
    expect(first.engine_version).toBe(INSTALLER_ENGINE_VERSION);
    expect(first.mutations.map((mutation) => mutation.mutation_id)).toEqual([
      "mutation:agent-config-guardrails",
      "mutation:eslint-managed-layer",
      "mutation:claude-settings-hooks",
      "mutation:audit-baseline",
    ]);
  });

  it("maps existing-repo reconciliation statuses, locks, and managed-region drift onto plan reasons", () => {
    const installPlan = plan(existingPlannerState(), existingPlannerDesired());

    expect(installPlan.repo_classification).toBe("existing");
    expect(installPlan.mutations).toEqual([
      {
        mutation_id: "mutation:agent-config-guardrails",
        target: "agent-config-guardrails",
        target_path: "AGENTS.md",
        action: "update",
        write_strategy: "managed_region",
        managed_marker: "<!-- dev-genie:guardrails:begin/end -->",
        reason_code: "conflicting",
        rationale: "agent-config-guardrails at AGENTS.md has a managed region that diverged from the recorded baseline, so the installer plans an update for conflict-aware apply.",
        source_writer: "dev-genie:agent-config",
      },
      {
        mutation_id: "mutation:eslint-managed-layer",
        target: "eslint-managed-layer",
        target_path: "eslint.config.mjs",
        action: "update",
        write_strategy: "layered",
        managed_marker: null,
        reason_code: "stale",
        rationale: "eslint-managed-layer at eslint.config.mjs is present but does not match the desired managed content, so the installer plans an update mutation.",
        source_writer: "dev-genie:eslint-layered",
      },
      {
        mutation_id: "mutation:claude-settings-hooks",
        target: "claude-settings-hooks",
        target_path: ".claude/settings.json",
        action: "create",
        write_strategy: "json_merge",
        managed_marker: null,
        reason_code: "locked",
        rationale: "claude-settings-hooks at .claude/settings.json is locked by the detected repo state, so the installer emits the mutation for a blocked apply outcome.",
        source_writer: "dev-genie:claude-settings",
      },
      {
        mutation_id: "mutation:audit-baseline",
        target: "audit-baseline",
        target_path: ".audit/audit.config.json",
        action: "skip",
        write_strategy: "full_file",
        managed_marker: null,
        reason_code: "already_satisfied",
        rationale: "audit-baseline at .audit/audit.config.json already satisfies the desired installer state, so the installer plans a skip mutation.",
        source_writer: "dev-genie:audit",
      },
    ]);
    expect(isInstallPlan(installPlan)).toBe(true);
  });

  it("orders greenfield plugin installation as guardrails and audit before optional platform installs", () => {
    const installPlan = plan(
      repoState({ repoClassification: "greenfield" }),
      {
        plugins: [
          { plugin_id: "katana", enabled: true },
          { plugin_id: "audit", enabled: true },
          { plugin_id: "daimyo", enabled: false },
          { plugin_id: "guardrails", enabled: true },
        ],
        configs: [],
      },
    );

    expect(installPlan.repo_classification).toBe("greenfield");
    expect(installPlan.mutations.map((mutation) => mutation.target)).toEqual([
      "agent-config-guardrails",
      "audit-baseline",
      "katana:claude-code",
    ]);
    expect(installPlan.mutations.map((mutation) => [mutation.action, mutation.reason_code])).toEqual([
      ["create", "missing"],
      ["create", "missing"],
      ["create", "missing"],
    ]);
    expect(isInstallPlan(installPlan)).toBe(true);
  });

  it("emits only skip/already_satisfied mutations when the repo state satisfies desired", () => {
    const installPlan = plan(idempotentState(), idempotentDesired());

    expect(installPlan.mutations.length).toBeGreaterThan(0);
    expect(installPlan.mutations.every((mutation) => mutation.action === "skip")).toBe(true);
    expect(installPlan.mutations.every((mutation) => mutation.reason_code === "already_satisfied")).toBe(true);
    expect(isInstallPlan(installPlan)).toBe(true);
  });
});

function existingPlannerState(): RepoState {
  return repoState({
    plugins: [
      plugin("guardrails", false),
      plugin("audit", true),
      plugin("katana", false),
      plugin("daimyo", false),
      plugin("dev-genie", false),
    ],
    managedRegions: [
      guardrailsRegion("user edited body", "AGENTS.md"),
    ],
    locks: [
      {
        pattern: ".claude/settings.json",
        reason: "- Do not modify `.claude/settings.json`.",
        sourceLine: 4,
        agentConfigPath: "AGENTS.md",
      },
    ],
    auditFound: true,
    auditBaseline: true,
  });
}

function existingPlannerDesired(): DesiredState {
  return {
    plugins: [],
    configs: [
      {
        target: "agent-config-guardrails",
        target_path: "AGENTS.md",
        required: true,
        desired_content: "managed v2",
        baseline_content: "managed v1",
      },
      {
        target: "eslint-managed-layer",
        target_path: "eslint.config.mjs",
        required: true,
        status: "weaker",
      },
      {
        target: "claude-settings-hooks",
        target_path: ".claude/settings.json",
        required: true,
        status: "missing",
      },
      {
        target: "audit-baseline",
        target_path: ".audit/audit.config.json",
        required: true,
        status: "present",
      },
    ],
  };
}

function idempotentState(): RepoState {
  return repoState({
    plugins: [
      plugin("guardrails", true, [
        { kind: "managed_config", path: "eslint.config.guardrails.mjs" },
        { kind: "managed_config", path: ".claude/settings.json", detail: "guardrails/scripts/lint-edited-file.sh" },
      ]),
      plugin("audit", true),
      plugin("katana", true),
      plugin("daimyo", false),
      plugin("dev-genie", false),
    ],
    managedRegions: [
      guardrailsRegion("managed guardrails", "CLAUDE.md"),
    ],
    auditFound: true,
    auditBaseline: true,
  });
}

function idempotentDesired(): DesiredState {
  return {
    plugins: [
      { plugin_id: "guardrails", enabled: true },
      { plugin_id: "audit", enabled: true },
      { plugin_id: "katana", enabled: true },
    ],
    configs: [
      {
        target: "agent-config-guardrails",
        target_path: "CLAUDE.md",
        required: true,
        desired_content: "managed guardrails",
        baseline_content: "managed guardrails",
      },
      {
        target: "eslint-managed-layer",
        target_path: "eslint.config.mjs",
        required: true,
        status: "present",
      },
      {
        target: "claude-settings-hooks",
        target_path: ".claude/settings.json",
        required: true,
        status: "present",
      },
      {
        target: "audit-baseline",
        target_path: ".audit/audit.config.json",
        required: true,
        status: "present",
      },
    ],
  };
}

interface RepoStateOptions {
  readonly repoClassification?: "greenfield" | "existing";
  readonly plugins?: readonly DetectedPluginPresence[];
  readonly managedRegions?: readonly DetectedManagedRegionPresence[];
  readonly locks?: readonly LockDeclaration[];
  readonly auditFound?: boolean;
  readonly auditBaseline?: boolean;
}

function repoState(options: RepoStateOptions = {}): RepoState {
  const auditFound = options.auditFound ?? false;
  const auditBaseline = options.auditBaseline ?? false;
  return {
    repo_classification: options.repoClassification ?? "existing",
    plugins: options.plugins ?? [
      plugin("dev-genie", false),
      plugin("guardrails", false),
      plugin("audit", false),
      plugin("katana", false),
      plugin("daimyo", false),
    ],
    managed_regions: options.managedRegions ?? [],
    locks: options.locks ?? [],
    last_run: null,
    detection_report: detectionReport(auditFound, auditBaseline),
  };
}

function plugin(
  pluginId: string,
  present: boolean,
  signals: DetectedPluginPresence["signals"] = [],
): DetectedPluginPresence {
  return {
    plugin_id: pluginId,
    present,
    signals,
  };
}

function guardrailsRegion(content: string, targetPath: string): DetectedManagedRegionPresence {
  return {
    target: "dev-genie:guardrails",
    target_path: targetPath,
    managed_marker: "<!-- dev-genie:guardrails:begin -->",
    marker_kind: "dev-genie",
    feature: "guardrails",
    present: true,
    region: regionBounds(content),
  };
}

function regionBounds(content: string): ManagedRegionBounds {
  return {
    begin_offset: 0,
    begin_line: 1,
    content_start_offset: 0,
    content_start_line: 1,
    content_end_offset: content.length,
    content_end_line: 1,
    end_offset: content.length,
    end_line: 1,
    content,
  };
}

function detectionReport(auditFound: boolean, auditBaseline: boolean): ExistingConfigDetectionReport {
  return {
    repoPath: "/repo",
    hasPackageJson: true,
    eslint: {
      found: true,
      files: ["eslint.config.mjs"],
      flat: true,
      legacy: false,
      notes: "flat config",
    },
    typescript: {
      found: true,
      files: ["tsconfig.json"],
      notes: "1 tsconfig file(s)",
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
      found: true,
      files: ["package.json#scripts.lint"],
      notes: "scripts present: lint; missing: typecheck, format, test, build, audit",
    },
    packageScripts: {
      lint: "eslint .",
    },
    audit: {
      found: auditFound,
      hasDir: auditFound,
      hasBaseline: auditBaseline,
      hasHook: false,
      files: auditFound ? [".audit/audit.config.json"] : [],
      notes: auditFound ? ".audit/ present (1 file(s)); baseline=true hook=false" : "no .audit/ directory",
    },
    packageManager: {
      found: false,
      files: [],
      notes: "no lockfile found",
    },
    agentConfigs: [],
  };
}
