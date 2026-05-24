import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { PolicyConfig, PolicyStaticRule } from "../src/index.js";
import {
  DEFAULT_AUTONOMY_PROFILE,
  DEFAULT_POLICY_CONFIG,
  GOVERNANCE_CONFIG_DIR,
  PolicyConfigError,
  defaultPolicyConfig,
  evaluateStaticRules,
  fromDaimyoStaticRules,
  loadPolicyConfig,
  resolvePolicyConfig,
} from "../src/index.js";

const createdProjects: string[] = [];
const daimyoDefaultReadOnlyTools = ["Read", "Grep", "Glob", "LS", "TodoRead"] as const;

describe("governance policy config loader", () => {
  afterEach(() => {
    for (const projectDir of createdProjects.splice(0)) {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("loads and validates a full governance file", () => {
    const config: PolicyConfig = {
      autonomy_profile: {
        engineering: "delegate",
        product: "big_questions_only",
        design: "always_in_loop",
      },
      product_baseline_approved: true,
      static_rules: [
        rule("allow-read", "allow", "Read"),
        rule("deny-bash", "deny", "Bash"),
      ],
    };
    const projectDir = projectWithGovernance(config);

    expect(loadPolicyConfig({ projectDir })).toEqual(config);
  });

  it("returns the documented safe default when the governance file is absent", () => {
    const projectDir = projectWithoutGovernance();
    const loaded = loadPolicyConfig({ projectDir });

    expect(loaded).toEqual(defaultPolicyConfig());
    expect(loaded).toEqual(DEFAULT_POLICY_CONFIG);
    expect(loaded.autonomy_profile).toBe(DEFAULT_AUTONOMY_PROFILE);
    expect(loaded.product_baseline_approved).toBe(false);
    expect(loaded.static_rules).toEqual(fromDaimyoStaticRules(daimyoDefaultReadOnlyTools, []));

    for (const toolName of daimyoDefaultReadOnlyTools) {
      expect(evaluateStaticRules(inputForTool(toolName, loaded), loaded.static_rules).effect).toBe("allow");
    }
    expect(evaluateStaticRules(inputForTool("Bash", loaded), loaded.static_rules).effect).toBe("no_match");
  });

  it("merges partial files with defaults per key before schema validation", () => {
    const projectDir = projectWithGovernance({
      autonomy_profile: {
        product: "delegate",
      },
    });

    expect(loadPolicyConfig({ projectDir })).toEqual({
      autonomy_profile: {
        engineering: DEFAULT_AUTONOMY_PROFILE.engineering,
        product: "delegate",
        design: DEFAULT_AUTONOMY_PROFILE.design,
      },
      product_baseline_approved: false,
      static_rules: defaultPolicyConfig().static_rules,
    });
  });

  it("throws a typed PolicyConfigError for an invalid autonomy level", () => {
    const projectDir = projectWithGovernance({
      autonomy_profile: {
        engineering: "ask_first",
      },
    });

    expectPolicyConfigError(
      () => loadPolicyConfig({ projectDir }),
      "schema_invalid",
      "/autonomy_profile/engineering must be equal to one of the allowed values",
    );
  });

  it("throws a typed PolicyConfigError for an invalid autonomy domain key", () => {
    const projectDir = projectWithGovernance({
      autonomy_profile: {
        qa: "delegate",
      },
    });

    expectPolicyConfigError(
      () => loadPolicyConfig({ projectDir }),
      "schema_invalid",
      "/autonomy_profile must NOT have additional properties",
    );
  });

  it("throws a typed PolicyConfigError for malformed JSON", () => {
    const projectDir = projectWithoutGovernance();
    writeGovernanceText(projectDir, "{");

    expectPolicyConfigError(
      () => loadPolicyConfig({ projectDir }),
      "malformed_json",
      "JSON",
    );
  });

  it("throws a typed PolicyConfigError for schema-invalid config", () => {
    const projectDir = projectWithGovernance({
      product_baseline_approved: "yes",
    });

    expectPolicyConfigError(
      () => loadPolicyConfig({ projectDir }),
      "schema_invalid",
      "/product_baseline_approved must be boolean",
    );
  });

  it("resolves in-memory config without filesystem access", () => {
    expect(resolvePolicyConfig({
      static_rules: [
        rule("allow-glob", "allow", "Glob"),
      ],
    })).toEqual({
      autonomy_profile: DEFAULT_AUTONOMY_PROFILE,
      product_baseline_approved: false,
      static_rules: [
        rule("allow-glob", "allow", "Glob"),
      ],
    });
  });
});

function projectWithGovernance(value: unknown): string {
  const projectDir = projectWithoutGovernance();
  writeGovernanceText(projectDir, JSON.stringify(value));
  return projectDir;
}

function projectWithoutGovernance(): string {
  const projectDir = mkdtempSync(join(tmpdir(), "policy-config-loader-"));
  createdProjects.push(projectDir);
  return projectDir;
}

function writeGovernanceText(projectDir: string, text: string): void {
  const configDir = join(projectDir, GOVERNANCE_CONFIG_DIR);
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, "governance.json"), text);
}

function expectPolicyConfigError(
  action: () => void,
  code: PolicyConfigError["code"],
  detail: string,
): void {
  try {
    action();
    throw new Error("Expected PolicyConfigError");
  } catch (error) {
    expect(error).toBeInstanceOf(PolicyConfigError);
    if (error instanceof PolicyConfigError) {
      expect(error.code).toBe(code);
      expect(error.details.some((message) => message.includes(detail))).toBe(true);
    }
  }
}

function rule(id: string, effect: "allow" | "deny", toolName: string): PolicyStaticRule {
  return {
    id,
    effect,
    match: {
      tool_name: toolName,
    },
  };
}

function inputForTool(toolName: string, config: PolicyConfig): Parameters<typeof evaluateStaticRules>[0] {
  return {
    request: {
      decision_id: `decision-${toolName}`,
      node_id: "node-policy-config-loader",
      task_id: "task-policy-config-loader",
      surface: "permission",
      prompt: `May the agent run ${toolName}?`,
      tool_name: toolName,
      arguments: {},
    },
    config,
  };
}
