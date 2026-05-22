import type {
  DecisionRequest,
  DecisionVerdict,
  JsonObject,
  JsonValue,
  Score0To10,
} from "../core/domain.js";

export type AutonomyDomain = "engineering" | "product" | "design";
export type AutonomyLevel = "always_in_loop" | "big_questions_only" | "delegate";
export type DecisionScope = "local" | "moderate" | "major";

export interface AutonomyProfile {
  readonly engineering: AutonomyLevel;
  readonly product: AutonomyLevel;
  readonly design: AutonomyLevel;
}

export interface DecisionPolicyContext {
  readonly domain: AutonomyDomain;
  readonly level: AutonomyLevel;
  readonly scope: DecisionScope;
  readonly productBaselineApproved: boolean;
  readonly declaredRisk: Score0To10;
}

export type AutonomyThresholdAction = "proceed" | "escalate";

export interface AutonomyThresholdResult {
  readonly action: AutonomyThresholdAction;
  readonly reason: string;
}

export const DEFAULT_AUTONOMY_PROFILE: AutonomyProfile = {
  engineering: "big_questions_only",
  product: "big_questions_only",
  design: "big_questions_only",
};

export function decisionPolicyContext(
  request: DecisionRequest,
  profile: AutonomyProfile,
): DecisionPolicyContext {
  const context = request.context ?? {};
  const domain = readDomain(context, "domain") ?? readDomain(context, "decision_domain") ?? "engineering";
  return {
    domain,
    level: profile[domain],
    scope: readScope(context, "scope") ?? readScope(context, "decision_scope") ?? "moderate",
    productBaselineApproved: readBoolean(context, "product_baseline_approved") ?? true,
    declaredRisk: readScore(context, "risk") ?? readScore(context, "declared_risk") ?? 5,
  };
}

export function evaluateAutonomyThreshold(
  request: DecisionRequest,
  verdict: DecisionVerdict,
  profile: AutonomyProfile,
): AutonomyThresholdResult {
  const policy = decisionPolicyContext(request, profile);

  if (verdict.type === "human") {
    return { action: "escalate", reason: "verdict requested human review" };
  }
  if (verdict.block_trigger) {
    return { action: "escalate", reason: "verdict block trigger is set" };
  }
  if (
    policy.domain === "product" &&
    policy.level === "delegate" &&
    !policy.productBaselineApproved &&
    policy.scope !== "local"
  ) {
    return { action: "escalate", reason: "product delegation requires an approved baseline" };
  }

  switch (policy.level) {
    case "always_in_loop":
      if (policy.scope !== "local") {
        return { action: "escalate", reason: "always_in_loop requires review beyond local details" };
      }
      if (verdict.risk >= 4) {
        return { action: "escalate", reason: "risk exceeds always_in_loop threshold" };
      }
      if (verdict.confidence <= 6) {
        return { action: "escalate", reason: "confidence is below always_in_loop threshold" };
      }
      return { action: "proceed", reason: "local low-risk decision under always_in_loop" };

    case "big_questions_only":
      if (policy.scope === "major") {
        return { action: "escalate", reason: "major decision under big_questions_only" };
      }
      if (verdict.risk >= 7) {
        return { action: "escalate", reason: "risk exceeds big_questions_only threshold" };
      }
      if (verdict.confidence <= 4) {
        return { action: "escalate", reason: "confidence is below big_questions_only threshold" };
      }
      return { action: "proceed", reason: "decision is below big_questions_only threshold" };

    case "delegate":
      if (verdict.risk >= 9) {
        return { action: "escalate", reason: "risk exceeds delegate threshold" };
      }
      if (verdict.confidence <= 2) {
        return { action: "escalate", reason: "confidence is below delegate threshold" };
      }
      return { action: "proceed", reason: "decision is within delegated bounds" };
  }
}

export function asScore0To10(value: number, label: string): Score0To10 {
  if (
    value === 0 ||
    value === 1 ||
    value === 2 ||
    value === 3 ||
    value === 4 ||
    value === 5 ||
    value === 6 ||
    value === 7 ||
    value === 8 ||
    value === 9 ||
    value === 10
  ) {
    return value;
  }
  throw new Error(`${label} must be an integer from 0 to 10`);
}

function readDomain(source: JsonObject, key: string): AutonomyDomain | undefined {
  const value = source[key];
  if (typeof value === "string" && isAutonomyDomain(value)) return value;
  return undefined;
}

function readScope(source: JsonObject, key: string): DecisionScope | undefined {
  const value = source[key];
  if (typeof value === "string" && isDecisionScope(value)) return value;
  return undefined;
}

function readBoolean(source: JsonObject, key: string): boolean | undefined {
  const value = source[key];
  return typeof value === "boolean" ? value : undefined;
}

function readScore(source: JsonObject, key: string): Score0To10 | undefined {
  const value = source[key];
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  if (isScore(value)) return value;
  return undefined;
}

function isScore(value: number): value is Score0To10 {
  return value >= 0 && value <= 10;
}

function isAutonomyDomain(value: JsonValue): value is AutonomyDomain {
  return value === "engineering" || value === "product" || value === "design";
}

function isDecisionScope(value: JsonValue): value is DecisionScope {
  return value === "local" || value === "moderate" || value === "major";
}
