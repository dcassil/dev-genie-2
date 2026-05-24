import { describe, expect, it } from "vitest";

import type { AutonomyProfile, DecisionRequestPayload, PolicyGovernanceConfig } from "../src/index.js";
import {
  DECISION_POLICY_ENGINE_VERSION,
  DEFAULT_AUTONOMY_PROFILE,
  DecisionPolicyEngine,
  evaluateAutonomyThreshold,
} from "../src/index.js";
import type { DecisionVerdict } from "protocol";

describe("DecisionPolicyEngine", () => {
  it("exposes a synchronous deterministic evaluate(input) contract", () => {
    const request: DecisionRequestPayload = {
      decision_id: "decision-scaffold-001",
      node_id: "node-scaffold-001",
      task_id: "task-scaffold-001",
      surface: "routing",
      prompt: "Choose whether this scaffold decision can proceed.",
      context: {
        decision_domain: "engineering",
      },
    };
    const config: PolicyGovernanceConfig = {
      autonomy_profile: DEFAULT_AUTONOMY_PROFILE,
      product_baseline_approved: true,
      static_rules: {},
    };

    const verdict = new DecisionPolicyEngine().evaluate({ request, config });

    expect(verdict).toEqual({
      outcome: "route",
      conflict_class: "soft_conflict",
      review_required: false,
      route_to: "parent_loop",
      classified_domain: "engineering",
      classified_scope: "moderate",
      rationale: "Scaffold fallback routed routing policy decision to the parent loop pending concrete evaluators.",
      matched_rule_refs: [],
      engine_version: DECISION_POLICY_ENGINE_VERSION,
    });
  });

  it("uses daimyo's autonomy profile and threshold primitives directly", () => {
    const autonomyProfile: AutonomyProfile = {
      ...DEFAULT_AUTONOMY_PROFILE,
      engineering: "delegate",
    };
    const config: PolicyGovernanceConfig = {
      autonomy_profile: autonomyProfile,
      product_baseline_approved: true,
      static_rules: {},
    };
    const request: DecisionRequestPayload = {
      decision_id: "decision-autonomy-001",
      node_id: "node-autonomy-001",
      task_id: "task-autonomy-001",
      surface: "permission",
      prompt: "May the agent run a local test?",
      tool_name: "exec_command",
      arguments: {
        cmd: "npm test",
      },
      context: {
        domain: "engineering",
        scope: "local",
      },
    };
    const verdict: DecisionVerdict = {
      type: "access",
      suggested_choice: "allow",
      suggested_response: "Allow local verification.",
      confidence: 9,
      risk: 1,
      block_trigger: false,
    };

    expect(config.autonomy_profile).toBe(autonomyProfile);
    expect(evaluateAutonomyThreshold(request, verdict, config.autonomy_profile)).toEqual({
      action: "proceed",
      reason: "decision is within delegated bounds",
    });
  });
});
