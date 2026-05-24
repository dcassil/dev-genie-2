import { describe, expect, it } from "vitest";

import type {
  JsonObject,
  OwnershipSurface,
  PolicyDecisionInput,
  SiblingOwnership,
  TouchReport,
} from "../src/index.js";
import {
  DEFAULT_AUTONOMY_PROFILE,
  assessConflict,
} from "../src/index.js";

const config: PolicyDecisionInput["config"] = {
  autonomy_profile: DEFAULT_AUTONOMY_PROFILE,
  product_baseline_approved: true,
  static_rules: [],
};

describe("assessConflict", () => {
  it("classifies the admin-settings copy example as no_conflict", () => {
    const assessment = assessConflict(input({
      source_loop_id: "task-admin-settings-copy",
      action_type: "ui_text_update",
      altitude: "task",
      ownership_scope: ["workflow:admin-settings:copy"],
      touched_surfaces: ["file:src/features/admin/settings/copy.ts"],
    }), [
      sibling("story-admin-settings-shell", {
        owns_workflow_steps: ["workflow:admin-settings:shell"],
        depends_on: ["interface:PUT /api/admin/settings"],
      }),
    ]);

    expect(assessment).toEqual({
      conflict_class: "no_conflict",
      affected_siblings: [],
      rationale: "No changed surface overlaps sibling ownership or dependency surfaces.",
    });
  });

  it("classifies the admin-settings save example as soft_conflict for the dependent sibling", () => {
    const assessment = assessConflict(input({
      source_loop_id: "task-admin-settings-save",
      action_type: "api_response_change",
      altitude: "task",
      ownership_scope: ["interface:PUT /api/admin/settings"],
      touched_surfaces: [
        "interface:PUT /api/admin/settings",
        "workflow:admin-settings:save",
      ],
      matched_dependencies: ["story-admin-settings-shell"],
    }), [
      sibling("story-admin-settings-shell", {
        owns_workflow_steps: ["workflow:admin-settings:shell"],
        depends_on: ["interface:PUT /api/admin/settings"],
      }),
    ]);

    expect(assessment.conflict_class).toBe("soft_conflict");
    expect(assessment.affected_siblings).toEqual(["story-admin-settings-shell"]);
    expect(assessment.rationale).toContain("depends_on");
  });

  it("classifies the admin-settings audit config wildcard example as hard_conflict", () => {
    const assessment = assessConflict(input({
      source_loop_id: "story-admin-settings-audit",
      action_type: "policy_change",
      altitude: "initiative",
      ownership_scope: [
        "workflow:admin-settings:audit",
        "config:admin.audit.*",
      ],
      risk_level: "high",
    }), [
      sibling("story-admin-settings-audit-log", {
        owns_data: ["config:admin.audit.enabled"],
      }),
    ]);

    expect(assessment.conflict_class).toBe("hard_conflict");
    expect(assessment.affected_siblings).toEqual(["story-admin-settings-audit-log"]);
  });

  it("classifies direct file ownership overlap from a structured touch report as hard_conflict", () => {
    const assessment = assessConflict(input({}, {
      touch_report: touchReport({
        touched_files: ["src/shared/auth.ts"],
      }),
    }), [
      sibling("task-auth-session", {
        owns_files: ["src/shared/auth.ts"],
      }),
    ]);

    expect(assessment.conflict_class).toBe("hard_conflict");
    expect(assessment.affected_siblings).toEqual(["task-auth-session"]);
  });

  it("classifies depends_on-only surface impact as soft_conflict", () => {
    const assessment = assessConflict(input({
      touched_surfaces: ["config:billing.tax_rate"],
    }), [
      sibling("story-invoice-preview", {
        owns_workflow_steps: ["workflow:invoice-preview:render"],
        depends_on: ["config:billing.*"],
      }),
    ]);

    expect(assessment.conflict_class).toBe("soft_conflict");
    expect(assessment.affected_siblings).toEqual(["story-invoice-preview"]);
  });

  it("classifies disjoint owned and dependency surfaces as no_conflict", () => {
    const assessment = assessConflict(input({
      touched_surfaces: ["file:src/features/admin/settings/copy.ts"],
    }), [
      sibling("task-billing-settings", {
        owns_files: ["src/features/billing/settings/form.ts"],
        depends_on: ["workflow:billing-settings:save"],
      }),
    ]);

    expect(assessment.conflict_class).toBe("no_conflict");
    expect(assessment.affected_siblings).toEqual([]);
  });

  it("degrades absent siblings to no_conflict with an explicit rationale", () => {
    expect(assessConflict(input({
      touched_surfaces: ["interface:PUT /api/admin/settings"],
    }))).toEqual({
      conflict_class: "no_conflict",
      affected_siblings: [],
      rationale: "No sibling ownership data was supplied; conflict assessment degrades to scope-only no_conflict.",
    });

    expect(assessConflict(input({
      touched_surfaces: ["interface:PUT /api/admin/settings"],
    }), []).conflict_class).toBe("no_conflict");
  });

  it("treats present but incomplete sibling ownership data conservatively", () => {
    const assessment = assessConflict(input({
      touched_surfaces: ["file:src/features/admin/settings/copy.ts"],
    }), [
      {
        sibling_id: "story-incomplete",
      },
    ]);

    expect(assessment.conflict_class).toBe("hard_conflict");
    expect(assessment.affected_siblings).toEqual(["story-incomplete"]);
    expect(assessment.rationale).toContain("incomplete sibling ownership data");
  });

  it("treats missing deciding touch and ownership surfaces conservatively when siblings are present", () => {
    const assessment = assessConflict(input({}), [
      sibling("story-admin-settings-shell", {
        owns_workflow_steps: ["workflow:admin-settings:shell"],
      }),
    ]);

    expect(assessment.conflict_class).toBe("hard_conflict");
    expect(assessment.affected_siblings).toEqual(["story-admin-settings-shell"]);
    expect(assessment.rationale).toContain("missing deciding ownership or touch surfaces");
  });

  it("matches config wildcard ownership against concrete touched config keys", () => {
    const assessment = assessConflict(input({
      touched_surfaces: ["config:admin.audit.retention_days"],
    }), [
      sibling("story-admin-audit-policy", {
        owns_data: ["config:admin.audit.*"],
      }),
    ]);

    expect(assessment.conflict_class).toBe("hard_conflict");
    expect(assessment.affected_siblings).toEqual(["story-admin-audit-policy"]);
  });

  it("is deterministic and does not mutate inputs", () => {
    const decisionInput = input({
      touched_surfaces: ["workflow:admin-settings:save"],
    });
    const siblings = [
      sibling("story-admin-settings-shell", {
        depends_on: ["workflow:admin-settings:save"],
      }),
    ];
    const before = JSON.stringify({ decisionInput, siblings });

    expect(assessConflict(decisionInput, siblings)).toEqual(assessConflict(decisionInput, siblings));
    expect(JSON.stringify({ decisionInput, siblings })).toBe(before);
  });
});

interface InputExtras {
  readonly ownership_scope?: OwnershipSurface;
  readonly touch_report?: TouchReport;
  readonly matched_dependencies?: readonly string[];
}

function input(context: JsonObject, extras: InputExtras = {}): PolicyDecisionInput {
  return {
    request: {
      decision_id: "decision-conflict-test",
      node_id: "node-conflict-test",
      task_id: "task-conflict-test",
      surface: "routing",
      prompt: "Assess sibling conflict.",
      context,
    },
    config,
    ...extras,
  };
}

function sibling(
  sibling_id: string,
  surface: Readonly<Partial<Omit<SiblingOwnership, "sibling_id">>>,
): SiblingOwnership {
  return {
    sibling_id,
    owns_files: [],
    owns_interfaces: [],
    owns_data: [],
    owns_workflow_steps: [],
    ...surface,
  };
}

function touchReport(surface: Partial<Omit<TouchReport, "task_id" | "report_type">>): TouchReport {
  return {
    task_id: "task-conflict-test",
    report_type: "touch_report",
    touched_files: [],
    touched_interfaces: [],
    touched_data: [],
    touched_workflow_steps: [],
    ...surface,
  };
}
