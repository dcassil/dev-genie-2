import { describe, expect, it } from "vitest";

import type { PolicyConfig, PolicyVerdict } from "../src/index.js";
import {
  isPolicyConfig,
  isPolicyVerdict,
  policyConfigJsonSchema,
  policyConfigValidationErrors,
  policyVerdictJsonSchema,
  policyVerdictValidationErrors,
  schemaFor,
  validatorFor,
} from "../src/index.js";

describe("protocol schema loader", () => {
  it("resolves sibling protocol schemas from the engines package context", () => {
    expect(schemaFor("PolicyVerdict")).toBe(policyVerdictJsonSchema);
    expect(schemaFor("PolicyConfig")).toBe(policyConfigJsonSchema);
    expect(validatorFor("PolicyVerdict")).toBeTypeOf("function");
    expect(validatorFor("PolicyConfig")).toBeTypeOf("function");
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
      static_rules: {
        reserved: {
          rule_refs: ["static-rule:placeholder"],
        },
      },
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
});
