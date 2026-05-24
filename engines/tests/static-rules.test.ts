import { describe, expect, it } from "vitest";

import type {
  DecisionRequestPayload,
  JsonObject,
  PolicyGovernanceConfig,
  PolicyStaticRule,
  PolicyStaticRules,
} from "../src/index.js";
import {
  DEFAULT_AUTONOMY_PROFILE,
  evaluateStaticRules,
  fromDaimyoStaticRules,
} from "../src/index.js";

const config: PolicyGovernanceConfig = {
  autonomy_profile: DEFAULT_AUTONOMY_PROFILE,
  product_baseline_approved: true,
  static_rules: [],
};

const daimyoDefaultAllowTools = ["Read", "Grep", "Glob", "LS", "TodoRead"] as const;
const daimyoDefaultDenyTools = [] as const;

describe("evaluateStaticRules", () => {
  it("allows an exact tool match", () => {
    const match = evaluateStaticRules(input(permissionRequest("Read")), [
      rule("allow-read", "allow", "Read"),
    ]);

    expect(match).toEqual({
      effect: "allow",
      matched_rule_ref: "allow-read",
      matched_rule_refs: ["allow-read"],
      rationale: "Static allow rule allow-read matched permission tool Read. Rules are first-match-wins.",
    });
  });

  it("denies an exact tool match", () => {
    const match = evaluateStaticRules(input(permissionRequest("Write")), [
      rule("deny-write", "deny", "Write"),
    ]);

    expect(match.effect).toBe("deny");
    expect(match.matched_rule_refs).toEqual(["deny-write"]);
  });

  it("matches bounded star globs without treating glob text as a regex", () => {
    const match = evaluateStaticRules(input(permissionRequest("mcp__linear__listIssues")), [
      rule("allow-mcp", "allow", "mcp__*"),
    ]);

    expect(match.effect).toBe("allow");
    expect(match.matched_rule_ref).toBe("allow-mcp");
    expect(evaluateStaticRules(input(permissionRequest("mcpXlinear")), [
      rule("allow-mcp", "allow", "mcp__*"),
    ]).effect).toBe("no_match");
  });

  it("matches argument contains predicates only against typed JSON arguments", () => {
    const match = evaluateStaticRules(input(permissionRequest("Bash", {
      command: "rm -rf dist",
    })), [
      {
        id: "deny-dangerous-rm",
        effect: "deny",
        match: {
          tool_name: "Bash",
          arguments_contains: {
            command: "rm -rf",
          },
        },
      },
    ]);

    expect(match.effect).toBe("deny");
    expect(match.matched_rule_refs).toEqual(["deny-dangerous-rm"]);
  });

  it("does not match argument predicates against missing or non-string arguments", () => {
    const rules: PolicyStaticRules = [
      {
        id: "deny-numeric-command",
        effect: "deny",
        match: {
          tool_name: "Bash",
          arguments_contains: {
            command: "rm -rf",
          },
        },
      },
    ];

    expect(evaluateStaticRules(input(permissionRequest("Bash", { count: 1 })), rules).effect).toBe("no_match");
    expect(evaluateStaticRules(input(permissionRequest("Bash", { command: ["rm -rf"] })), rules).effect).toBe("no_match");
  });

  it("matches ownership-scope prefixes from request context", () => {
    const match = evaluateStaticRules(input(permissionRequest("Write", {}, {
      ownership_scope: ["workflow:admin-settings:copy"],
    })), [
      {
        id: "allow-owned-workflow-write",
        effect: "allow",
        match: {
          tool_name: "Write",
          ownership_scope_prefix: "workflow:admin-settings:",
        },
      },
    ]);

    expect(match.effect).toBe("allow");
    expect(match.matched_rule_ref).toBe("allow-owned-workflow-write");
  });

  it("matches altitude-scoped rules from request context", () => {
    const rules: PolicyStaticRules = [
      {
        id: "deny-root-bash",
        effect: "deny",
        match: {
          tool_name: "Bash",
          altitude: "root",
        },
      },
    ];

    expect(evaluateStaticRules(input(permissionRequest("Bash", {}, { altitude: "root" })), rules).effect).toBe("deny");
    expect(evaluateStaticRules(input(permissionRequest("Bash", {}, { altitude: "task" })), rules).effect).toBe("no_match");
  });

  it("uses declared order as explicit precedence for deny-before-allow and allow-before-deny", () => {
    const denyBeforeAllow: PolicyStaticRules = [
      rule("deny-bash-first", "deny", "Bash"),
      rule("allow-bash-second", "allow", "Bash"),
    ];
    const allowBeforeDeny: PolicyStaticRules = [
      rule("allow-bash-first", "allow", "Bash"),
      rule("deny-bash-second", "deny", "Bash"),
    ];

    expect(evaluateStaticRules(input(permissionRequest("Bash")), denyBeforeAllow)).toMatchObject({
      effect: "deny",
      matched_rule_ref: "deny-bash-first",
    });
    expect(evaluateStaticRules(input(permissionRequest("Bash")), allowBeforeDeny)).toMatchObject({
      effect: "allow",
      matched_rule_ref: "allow-bash-first",
    });
  });

  it("falls through with no_match when no static rule matches", () => {
    const match = evaluateStaticRules(input(permissionRequest("Bash")), [
      rule("allow-read", "allow", "Read"),
    ]);

    expect(match).toEqual({
      effect: "no_match",
      matched_rule_ref: null,
      matched_rule_refs: [],
      rationale: "No static permission rule matched tool Bash.",
    });
  });

  it("converts daimyo flat static rules with parity to daimyo's toolRule order", () => {
    const converted = fromDaimyoStaticRules(daimyoDefaultAllowTools, daimyoDefaultDenyTools);
    const toolNames = ["Read", "Grep", "Glob", "LS", "TodoRead", "Bash"] as const;

    for (const toolName of toolNames) {
      expect(toDaimyoToolRule(evaluateStaticRules(input(permissionRequest(toolName)), converted).effect)).toBe(
        daimyoToolRule(toolName, daimyoDefaultAllowTools, daimyoDefaultDenyTools),
      );
    }

    const denyWins = fromDaimyoStaticRules(["Bash"], ["Bash"]);
    expect(evaluateStaticRules(input(permissionRequest("Bash")), denyWins)).toMatchObject({
      effect: "deny",
      matched_rule_ref: "daimyo:deny:0:Bash",
    });
  });
});

function input(request: DecisionRequestPayload): Parameters<typeof evaluateStaticRules>[0] {
  return {
    request,
    config,
  };
}

function permissionRequest(
  toolName: string,
  args: JsonObject = {},
  context: JsonObject = {},
): DecisionRequestPayload {
  return {
    decision_id: "decision-static-rule-test",
    node_id: "node-static-rule-test",
    task_id: "task-static-rule-test",
    surface: "permission",
    prompt: `May the agent run ${toolName}?`,
    tool_name: toolName,
    arguments: args,
    context,
  };
}

function rule(
  id: string,
  effect: "allow" | "deny",
  toolName: string,
): PolicyStaticRule {
  return {
    id,
    effect,
    match: {
      tool_name: toolName,
    },
  };
}

function daimyoToolRule(
  toolName: string,
  allowTools: readonly string[],
  denyTools: readonly string[],
): "allow" | "deny" | "none" {
  if (denyTools.includes(toolName)) return "deny";
  if (allowTools.includes(toolName)) return "allow";
  return "none";
}

function toDaimyoToolRule(effect: "allow" | "deny" | "no_match"): "allow" | "deny" | "none" {
  if (effect === "no_match") {
    return "none";
  }
  return effect;
}
