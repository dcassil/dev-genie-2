import { describe, expect, it } from "vitest";

import type {
  InstallPlan,
  PolicyConfig,
  PolicyVerdict,
  ReconciliationReport,
} from "../src/index.js";
import {
  installPlanJsonSchema,
  installPlanValidationErrors,
  isInstallPlan,
  isPolicyConfig,
  isPolicyVerdict,
  isReconciliationReport,
  policyConfigJsonSchema,
  policyConfigValidationErrors,
  policyVerdictJsonSchema,
  policyVerdictValidationErrors,
  reconciliationReportJsonSchema,
  reconciliationReportValidationErrors,
  schemaFor,
  validatorFor,
} from "../src/index.js";

describe("protocol schema loader", () => {
  it("resolves protocol schemas through the protocol package", () => {
    expect(schemaFor("PolicyVerdict")).toBe(policyVerdictJsonSchema);
    expect(schemaFor("PolicyConfig")).toBe(policyConfigJsonSchema);
    expect(schemaFor("InstallPlan")).toBe(installPlanJsonSchema);
    expect(schemaFor("ReconciliationReport")).toBe(reconciliationReportJsonSchema);
    expect(schemaFor("install-plan")).toBe(installPlanJsonSchema);
    expect(schemaFor("reconciliation-report")).toBe(reconciliationReportJsonSchema);
    expect(validatorFor("PolicyVerdict")).toBeTypeOf("function");
    expect(validatorFor("PolicyConfig")).toBeTypeOf("function");
    expect(validatorFor("InstallPlan")).toBeTypeOf("function");
    expect(validatorFor("ReconciliationReport")).toBeTypeOf("function");
    expect(validatorFor("install-plan")).toBeTypeOf("function");
    expect(validatorFor("reconciliation-report")).toBeTypeOf("function");
  });

  it("validates PolicyVerdict samples", () => {
    const verdict: PolicyVerdict = {
      outcome: "permit",
      conflict_class: "no_conflict",
      review_required: false,
      route_to: null,
      classified_domain: "design",
      classified_scope: "local",
      rationale: "Local delegated design update stays within task-owned surfaces.",
      matched_rule_refs: ["static-rule:local-design-copy"],
      engine_version: "0.1.0",
    };
    const invalidVerdict = {
      ...verdict,
      outcome: "review",
    };

    expect(isPolicyVerdict(verdict)).toBe(true);
    expect(isPolicyVerdict(invalidVerdict)).toBe(false);
    expect(policyVerdictValidationErrors().some((message) => message.includes("must be equal to one of the allowed values"))).toBe(true);
  });

  it("validates PolicyConfig samples", () => {
    const config: PolicyConfig = {
      autonomy_profile: {
        engineering: "big_questions_only",
        product: "delegate",
        design: "always_in_loop",
      },
      product_baseline_approved: false,
      static_rules: [
        {
          id: "allow-read",
          effect: "allow",
          match: {
            tool_name: "Read",
          },
        },
      ],
    };
    const invalidConfig = {
      ...config,
      autonomy_profile: {
        ...config.autonomy_profile,
        product: "ask_first",
      },
    };

    expect(isPolicyConfig(config)).toBe(true);
    expect(isPolicyConfig(invalidConfig)).toBe(false);
    expect(policyConfigValidationErrors().some((message) => message.includes("must be equal to one of the allowed values"))).toBe(true);
  });

  it("validates Installer Engine InstallPlan and ReconciliationReport samples", () => {
    const plan: InstallPlan = {
      plan_version: "1.0.0",
      engine_version: "0.8.0",
      repo_classification: "greenfield",
      mutations: [],
    };
    const report: ReconciliationReport = {
      report_version: "1.0.0",
      engine_version: "0.8.0",
      repo_classification: "greenfield",
      had_conflict: false,
      counts: {
        applied: 0,
        skipped: 0,
        blocked: 0,
        conflict: 0,
      },
      outcomes: [],
    };
    const invalidPlan = {
      ...plan,
      repo_classification: "brownfield",
    };
    const invalidReport = {
      ...report,
      counts: {
        ...report.counts,
        conflict: -1,
      },
    };

    expect(isInstallPlan(plan)).toBe(true);
    expect(isInstallPlan(invalidPlan)).toBe(false);
    expect(installPlanValidationErrors().some((message) => message.includes("must be equal to one of the allowed values"))).toBe(true);
    expect(isReconciliationReport(report)).toBe(true);
    expect(isReconciliationReport(invalidReport)).toBe(false);
    expect(reconciliationReportValidationErrors().some((message) => message.includes("must be >="))).toBe(true);
  });
});
