import { describe, expect, it } from "vitest";

import type { DecisionRequestPayload, JsonObject } from "protocol";
import type { PolicyGovernanceConfig } from "../src/decision-policy/index.js";
import {
  DEFAULT_AUTONOMY_PROFILE,
  DEFAULT_DOMAIN_CLASSIFICATION_RULES,
  DEFAULT_SCOPE_CLASSIFICATION_RULES,
  classifyDecision,
} from "../src/decision-policy/index.js";

const config: PolicyGovernanceConfig = {
  autonomy_profile: DEFAULT_AUTONOMY_PROFILE,
  product_baseline_approved: true,
  static_rules: {},
};

describe("classifyDecision", () => {
  it("exports inspectable seed domain and scope rule tables", () => {
    expect(DEFAULT_DOMAIN_CLASSIFICATION_RULES.map((rule) => rule.id)).toContain("domain:design:exact-actions");
    expect(DEFAULT_DOMAIN_CLASSIFICATION_RULES.map((rule) => rule.id)).toContain("domain:product:action-prefixes");
    expect(DEFAULT_DOMAIN_CLASSIFICATION_RULES.map((rule) => rule.id)).toContain("domain:engineering:exact-actions");
    expect(DEFAULT_SCOPE_CLASSIFICATION_RULES.map((rule) => rule.id)).toEqual([
      "scope:major:initiative-plus-altitude",
      "scope:major:governance-or-config-wildcard",
      "scope:moderate:shared-contract-task-altitude",
      "scope:moderate:story-altitude",
      "scope:local:task-owned-surfaces",
    ]);
  });

  it("classifies the admin-settings copy example as design/local", () => {
    const classification = classifyDecision(input({
      source_loop_id: "task-admin-settings-copy",
      action_type: "ui_text_update",
      altitude: "task",
      ownership_scope: ["workflow:admin-settings:copy"],
      touched_surfaces: ["file:src/features/admin/settings/copy.ts"],
    }));

    expect(classification).toMatchObject({
      domain: "design",
      scope: "local",
      risk: 5,
    });
    expect(classification.rationale).toContain("domain:design:exact-actions");
    expect(classification.rationale).toContain("scope:local:task-owned-surfaces");
  });

  it("classifies the admin-settings save example as engineering/moderate", () => {
    const classification = classifyDecision(input({
      source_loop_id: "task-admin-settings-save",
      action_type: "api_response_change",
      altitude: "task",
      ownership_scope: ["interface:PUT /api/admin/settings"],
      touched_surfaces: [
        "interface:PUT /api/admin/settings",
        "workflow:admin-settings:save",
      ],
      matched_dependencies: ["story-admin-settings-shell"],
    }));

    expect(classification).toMatchObject({
      domain: "engineering",
      scope: "moderate",
      risk: 5,
    });
    expect(classification.rationale).toContain("domain:engineering:exact-actions");
    expect(classification.rationale).toContain("scope:moderate:shared-contract-task-altitude");
  });

  it("classifies the admin-settings audit example as product/major", () => {
    const classification = classifyDecision(input({
      source_loop_id: "story-admin-settings-audit",
      action_type: "policy_change",
      altitude: "initiative",
      ownership_scope: [
        "workflow:admin-settings:audit",
        "config:admin.audit.*",
      ],
      risk_level: "high",
    }));

    expect(classification).toMatchObject({
      domain: "product",
      scope: "major",
      risk: 8,
    });
    expect(classification.rationale).toContain("domain:product:exact-actions");
    expect(classification.rationale).toContain("scope:major:initiative-plus-altitude");
    expect(classification.rationale).toContain("risk_level high");
  });

  it("honors explicit domain and scope supplied by the caller", () => {
    const classification = classifyDecision(input({
      action_type: "architecture_refactor",
      decision_domain: "design",
      scope: "local",
      altitude: "initiative",
      declared_risk: 3,
      touched_surfaces: ["schema:admin_settings"],
    }));

    expect(classification).toEqual({
      domain: "design",
      scope: "local",
      risk: 3,
      rationale: "Domain design was caller-supplied in request context. Scope local was caller-supplied in request context. Risk 3 was caller-supplied in request context.",
    });
  });

  it("defaults empty inputs to daimyo-compatible engineering/moderate/risk-5", () => {
    const classification = classifyDecision(input({}));

    expect(classification).toMatchObject({
      domain: "engineering",
      scope: "moderate",
      risk: 5,
    });
    expect(classification.rationale).toContain("Domain defaulted to engineering");
    expect(classification.rationale).toContain("Scope defaulted to moderate");
    expect(classification.rationale).toContain("Risk defaulted to 5");
  });

  it("handles conflicting domain and scope signals deterministically", () => {
    const classification = classifyDecision(input({
      action_type: "visual_layout_update",
      altitude: "task",
      ownership_scope: ["workflow:billing-settings:layout"],
      touched_surfaces: ["schema:billing_settings"],
    }));

    expect(classification).toMatchObject({
      domain: "design",
      scope: "moderate",
    });
    expect(classification.rationale).toContain("domain:design:action-prefixes");
    expect(classification.rationale).toContain("scope:moderate:shared-contract-task-altitude");
  });

  it("classifies unknown action types as engineering while still applying scope rules", () => {
    const classification = classifyDecision(input({
      action_type: "unregistered_future_action",
      altitude: "task",
      ownership_scope: ["workflow:admin-settings:unknown"],
      touched_surfaces: ["file:src/features/admin/settings/unknown.ts"],
    }));

    expect(classification).toMatchObject({
      domain: "engineering",
      scope: "local",
      risk: 5,
    });
    expect(classification.rationale).toContain("Domain defaulted to engineering");
  });

  it("keeps task-altitude requests without ownership signals at moderate scope", () => {
    const classification = classifyDecision(input({
      action_type: "code_cleanup",
      altitude: "task",
    }));

    expect(classification).toMatchObject({
      domain: "engineering",
      scope: "moderate",
    });
    expect(classification.rationale).toContain("Scope defaulted to moderate");
  });

  it("is synchronous and side-effect-free for repeated calls", () => {
    const decisionInput = input({
      action_type: "workflow_step_reorder",
      altitude: "story",
      ownership_scope: ["workflow:admin-settings:save"],
    });
    const before = JSON.stringify(decisionInput);

    const first = classifyDecision(decisionInput);
    const second = classifyDecision(decisionInput);

    expect(first).toEqual(second);
    expect(JSON.stringify(decisionInput)).toBe(before);
  });
});

function input(context: JsonObject): Parameters<typeof classifyDecision>[0] {
  return {
    request: routingRequest(context),
    config,
  };
}

function routingRequest(context: JsonObject): DecisionRequestPayload {
  return {
    decision_id: "decision-classifier-test",
    node_id: "node-classifier-test",
    task_id: "task-classifier-test",
    surface: "routing",
    prompt: "Classify this structured request.",
    context,
  };
}
