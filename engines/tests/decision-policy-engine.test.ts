import { describe, expect, it } from "vitest";

import type {
  AutonomyDomain,
  AutonomyLevel,
  AutonomyProfile,
  DecisionRequestPayload,
  JsonObject,
  PolicyGovernanceConfig,
  PolicyStaticRule,
  SiblingOwnership,
} from "../src/index.js";
import type { DecisionVerdict } from "protocol";
import {
  DECISION_POLICY_ENGINE_VERSION,
  DEFAULT_AUTONOMY_PROFILE,
  DecisionPolicyEngine,
  evaluateAutonomyThreshold,
} from "../src/index.js";

const domains = ["engineering", "product", "design"] as const;
const levels = ["always_in_loop", "big_questions_only", "delegate"] as const;
const scopes = ["local", "moderate", "major"] as const;

describe("DecisionPolicyEngine", () => {
  it("exposes a synchronous deterministic evaluate(input) contract", () => {
    const request = routingRequest({
      decision_domain: "engineering",
      decision_scope: "local",
      declared_risk: 1,
    });
    const engine = new DecisionPolicyEngine();

    const verdict = engine.evaluate({ request, config: configFor(DEFAULT_AUTONOMY_PROFILE) });

    expect(verdict).toMatchObject({
      outcome: "permit",
      conflict_class: "no_conflict",
      review_required: false,
      route_to: null,
      classified_domain: "engineering",
      classified_scope: "local",
      matched_rule_refs: [],
      engine_version: DECISION_POLICY_ENGINE_VERSION,
    });
    expect(verdict.rationale).toContain("Daimyo autonomy threshold allowed proceed");
    expect(verdict.rationale.length).toBeGreaterThan(0);
    expect(isPromise(verdict)).toBe(false);
  });

  it("settles permission allow and deny decisions with static rules before routing policy", () => {
    const engine = new DecisionPolicyEngine();
    const staticRules: PolicyStaticRule[] = [
      rule("deny-dangerous-bash", "deny", "Bash"),
      rule("allow-read", "allow", "Read"),
    ];

    expect(engine.evaluate({
      request: permissionRequest("Read"),
      config: configFor(DEFAULT_AUTONOMY_PROFILE, true, staticRules),
    })).toMatchObject({
      outcome: "permit",
      conflict_class: "no_conflict",
      review_required: false,
      route_to: null,
      matched_rule_refs: ["allow-read"],
    });

    const denied = engine.evaluate({
      request: permissionRequest("Bash"),
      config: configFor(DEFAULT_AUTONOMY_PROFILE, true, staticRules),
    });
    expect(denied).toMatchObject({
      outcome: "stop",
      conflict_class: "no_conflict",
      review_required: true,
      route_to: "human",
      matched_rule_refs: ["deny-dangerous-bash"],
    });
    expect(denied.rationale).toContain("settled by static rules before routing policy");
  });

  it("routes unmatched permission requests to human review without inventing rule refs", () => {
    const verdict = new DecisionPolicyEngine().evaluate({
      request: permissionRequest("Write"),
      config: configFor(DEFAULT_AUTONOMY_PROFILE, true, [rule("allow-read", "allow", "Read")]),
    });

    expect(verdict).toMatchObject({
      outcome: "route",
      conflict_class: "no_conflict",
      review_required: true,
      route_to: "human",
      matched_rule_refs: [],
    });
    expect(verdict.rationale).toContain("did not match a deterministic static allow/deny rule");
  });

  it("matches daimyo evaluateAutonomyThreshold across the domain x level x scope matrix", () => {
    const engine = new DecisionPolicyEngine();

    for (const domain of domains) {
      for (const level of levels) {
        for (const scope of scopes) {
          const profile = profileFor(domain, level);
          const request = routingRequest({
            decision_domain: domain,
            decision_scope: scope,
            declared_risk: 1,
          });
          const threshold = evaluateAutonomyThreshold(
            request,
            autonomyVerdict(1),
            profile,
          );
          const engineVerdict = engine.evaluate({
            request,
            config: configFor(profile),
          });

          expect(engineVerdict.outcome).toBe(threshold.action === "proceed" ? "permit" : "stop");
          expect(engineVerdict.review_required).toBe(threshold.action === "escalate");
          expect(engineVerdict.route_to).toBe(threshold.action === "escalate" ? "human" : null);
          expect(engineVerdict.rationale).toContain(threshold.reason);
        }
      }
    }
  });

  it("inherits daimyo's product-baseline guardrail for delegated non-local product decisions", () => {
    const profile = profileFor("product", "delegate");
    const request = routingRequest({
      decision_domain: "product",
      decision_scope: "moderate",
      declared_risk: 1,
    });
    const directThreshold = evaluateAutonomyThreshold(
      {
        ...request,
        context: {
          ...request.context,
          product_baseline_approved: false,
        },
      },
      autonomyVerdict(1),
      profile,
    );

    const verdict = new DecisionPolicyEngine().evaluate({
      request,
      config: configFor(profile, false),
    });

    expect(directThreshold).toEqual({
      action: "escalate",
      reason: "product delegation requires an approved baseline",
    });
    expect(verdict).toMatchObject({
      outcome: "stop",
      review_required: true,
      route_to: "human",
      classified_domain: "product",
      classified_scope: "moderate",
    });
    expect(verdict.rationale).toContain(directThreshold.reason);
  });

  it("folds soft and hard conflicts into parent-loop routing when autonomy permits", () => {
    const engine = new DecisionPolicyEngine();
    const soft = engine.evaluate({
      request: routingRequest({
        decision_domain: "engineering",
        decision_scope: "moderate",
        declared_risk: 1,
        touched_surfaces: ["interface:GET /api/settings"],
      }),
      config: configFor(profileFor("engineering", "delegate")),
      sibling_ownership: [
        sibling("story-settings-shell", {
          depends_on: ["interface:GET /api/settings"],
        }),
      ],
    });
    const hard = engine.evaluate({
      request: routingRequest({
        decision_domain: "engineering",
        decision_scope: "local",
        declared_risk: 1,
        touched_surfaces: ["file:src/shared/settings.ts"],
      }),
      config: configFor(profileFor("engineering", "delegate")),
      sibling_ownership: [
        sibling("task-settings-cache", {
          owns_files: ["src/shared/settings.ts"],
        }),
      ],
    });

    expect(soft).toMatchObject({
      outcome: "route",
      conflict_class: "soft_conflict",
      review_required: false,
      route_to: "parent_loop",
    });
    expect(soft.rationale).toContain("loading sibling context and patching child instructions");
    expect(hard).toMatchObject({
      outcome: "route",
      conflict_class: "hard_conflict",
      review_required: false,
      route_to: "parent_loop",
    });
    expect(hard.rationale).toContain("sibling quiesce");
  });

  it("lets autonomy escalation override hard-conflict parent routing with human stop", () => {
    const verdict = new DecisionPolicyEngine().evaluate({
      request: routingRequest({
        decision_domain: "product",
        decision_scope: "major",
        declared_risk: 8,
        touched_surfaces: ["config:admin.audit.retention_days"],
      }),
      config: configFor(profileFor("product", "big_questions_only")),
      sibling_ownership: [
        sibling("story-audit-policy", {
          owns_data: ["config:admin.audit.*"],
        }),
      ],
    });

    expect(verdict).toMatchObject({
      outcome: "stop",
      conflict_class: "hard_conflict",
      review_required: true,
      route_to: "human",
    });
    expect(verdict.rationale).toContain("major decision under big_questions_only");
    expect(verdict.rationale).toContain("Hard conflict");
  });

  it("matches the initiative local copy, save-route, and audit-stop fixture examples", () => {
    const engine = new DecisionPolicyEngine();
    const copy = engine.evaluate({
      request: routingRequest({
        source_loop_id: "task-admin-settings-copy",
        action_type: "ui_text_update",
        altitude: "task",
        ownership_scope: ["workflow:admin-settings:copy"],
        touched_surfaces: ["file:src/features/admin/settings/copy.ts"],
      }, "decision-request-admin-settings-copy-001"),
      config: configFor(DEFAULT_AUTONOMY_PROFILE),
      sibling_ownership: [
        sibling("story-admin-settings-shell", {
          owns_workflow_steps: ["workflow:admin-settings:shell"],
          depends_on: ["interface:PUT /api/admin/settings"],
        }),
      ],
    });
    const save = engine.evaluate({
      request: routingRequest({
        source_loop_id: "task-admin-settings-save",
        action_type: "api_response_change",
        altitude: "task",
        ownership_scope: ["interface:PUT /api/admin/settings"],
        touched_surfaces: [
          "interface:PUT /api/admin/settings",
          "workflow:admin-settings:save",
        ],
        matched_dependencies: ["story-admin-settings-shell"],
      }, "decision-request-admin-settings-save-004"),
      config: configFor(DEFAULT_AUTONOMY_PROFILE),
      sibling_ownership: [
        sibling("story-admin-settings-shell", {
          owns_workflow_steps: ["workflow:admin-settings:shell"],
          depends_on: ["interface:PUT /api/admin/settings"],
        }),
      ],
    });
    const audit = engine.evaluate({
      request: routingRequest({
        source_loop_id: "story-admin-settings-audit",
        action_type: "policy_change",
        altitude: "initiative",
        ownership_scope: [
          "workflow:admin-settings:audit",
          "config:admin.audit.*",
        ],
        risk_level: "high",
      }, "decision-request-admin-settings-audit-002"),
      config: configFor(DEFAULT_AUTONOMY_PROFILE),
      sibling_ownership: [
        sibling("story-admin-settings-audit-log", {
          owns_data: ["config:admin.audit.enabled"],
        }),
      ],
    });

    expect(copy).toMatchObject({
      outcome: "permit",
      conflict_class: "no_conflict",
      review_required: false,
      route_to: null,
      classified_domain: "design",
      classified_scope: "local",
    });
    expect(save).toMatchObject({
      outcome: "route",
      conflict_class: "soft_conflict",
      review_required: false,
      route_to: "parent_loop",
      classified_domain: "engineering",
      classified_scope: "moderate",
    });
    expect(audit).toMatchObject({
      outcome: "stop",
      conflict_class: "hard_conflict",
      review_required: true,
      route_to: "human",
      classified_domain: "product",
      classified_scope: "major",
    });
  });
});

function configFor(
  autonomyProfile: AutonomyProfile,
  productBaselineApproved = true,
  staticRules: PolicyGovernanceConfig["static_rules"] = [],
): PolicyGovernanceConfig {
  return {
    autonomy_profile: autonomyProfile,
    product_baseline_approved: productBaselineApproved,
    static_rules: staticRules,
  };
}

function profileFor(domain: AutonomyDomain, level: AutonomyLevel): AutonomyProfile {
  return {
    engineering: "big_questions_only",
    product: "big_questions_only",
    design: "big_questions_only",
    [domain]: level,
  };
}

function routingRequest(context: JsonObject, decisionId = "decision-routing-test"): DecisionRequestPayload {
  return {
    decision_id: decisionId,
    node_id: "node-policy-test",
    task_id: "task-policy-test",
    surface: "routing",
    prompt: "Evaluate this routing decision.",
    context,
  };
}

function permissionRequest(toolName: string): DecisionRequestPayload {
  return {
    decision_id: `decision-permission-${toolName}`,
    node_id: "node-policy-test",
    task_id: "task-policy-test",
    surface: "permission",
    prompt: `May the agent run ${toolName}?`,
    tool_name: toolName,
    arguments: {},
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

function autonomyVerdict(risk: DecisionVerdict["risk"]): DecisionVerdict {
  return {
    type: "decision",
    suggested_choice: "proceed",
    suggested_response: "Deterministic policy classification produced the autonomy threshold inputs.",
    confidence: 10,
    risk,
    block_trigger: false,
  };
}

function sibling(
  siblingId: string,
  surface: Readonly<Partial<Omit<SiblingOwnership, "sibling_id">>>,
): SiblingOwnership {
  return {
    sibling_id: siblingId,
    owns_files: [],
    owns_interfaces: [],
    owns_data: [],
    owns_workflow_steps: [],
    ...surface,
  };
}

function isPromise(value: object): boolean {
  return "then" in value;
}
