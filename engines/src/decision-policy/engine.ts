import {
  evaluateAutonomyThreshold,
} from "daimyo";
import type {
  AutonomyProfile,
  DecisionRequest,
  DecisionVerdict,
  Score0To10,
} from "daimyo";
import type {
  DecisionRequestPayload,
  JsonObject,
  OwnershipSurface,
  PolicyConfig,
  PolicyVerdict,
  TouchReport,
} from "protocol";

import { assessConflict } from "./conflict.js";
import { classifyDecision } from "./classifier.js";
import type { ClassifiedDecision } from "./classifier.js";
import type { ConflictAssessment, SiblingOwnership } from "./conflict.js";
import { evaluateStaticRules } from "./static-rules.js";
import type { RuleMatch } from "./static-rules.js";

export const DECISION_POLICY_ENGINE_VERSION = "0.7.0";

const DETERMINISTIC_POLICY_CONFIDENCE: Score0To10 = 10;

export type PolicyGovernanceConfig = Omit<PolicyConfig, "autonomy_profile"> & {
  readonly autonomy_profile: AutonomyProfile;
};

export interface PolicyDecisionInput {
  readonly request: DecisionRequestPayload;
  readonly config: PolicyGovernanceConfig;
  readonly ownership_scope?: OwnershipSurface;
  readonly touch_report?: TouchReport;
  readonly matched_dependencies?: readonly string[];
  readonly sibling_ownership?: readonly SiblingOwnership[];
}

export interface Engine<TInput, TOutput> {
  evaluate(input: TInput): TOutput;
}

export class DecisionPolicyEngine implements Engine<PolicyDecisionInput, PolicyVerdict> {
  evaluate(input: PolicyDecisionInput): PolicyVerdict {
    if (input.request.surface === "permission") {
      return evaluatePermission(input);
    }

    return evaluateRouting(input);
  }
}

function evaluatePermission(input: PolicyDecisionInput): PolicyVerdict {
  const staticRule = evaluateStaticRules(input, input.config.static_rules);
  const classification = classifyDecision(input);

  if (staticRule.effect === "allow") {
    return permissionVerdict("permit", false, null, input, classification, staticRule);
  }
  if (staticRule.effect === "deny") {
    return permissionVerdict("stop", true, "human", input, classification, staticRule);
  }

  return {
    outcome: "route",
    conflict_class: "no_conflict",
    review_required: true,
    route_to: "human",
    classified_domain: classification.domain,
    classified_scope: classification.scope,
    rationale: rationale([
      `Permission request ${input.request.decision_id} did not match a deterministic static allow/deny rule, so it falls through for human review.`,
      staticRule.rationale,
      classification.rationale,
    ]),
    matched_rule_refs: [],
    engine_version: DECISION_POLICY_ENGINE_VERSION,
  };
}

function evaluateRouting(input: PolicyDecisionInput): PolicyVerdict {
  const classification = classifyDecision(input);
  const conflict = assessConflict(input, input.sibling_ownership);
  const autonomy = evaluateAutonomyThreshold(
    requestWithClassifiedPolicyContext(input.request, input.config.product_baseline_approved, classification),
    provisionalDecisionVerdict(classification),
    input.config.autonomy_profile,
  );

  if (autonomy.action === "escalate") {
    return routingVerdict("stop", true, "human", classification, conflict, [
      `Daimyo autonomy threshold escalated: ${autonomy.reason}.`,
      conflictRationale(conflict),
      classification.rationale,
    ]);
  }

  if (conflict.conflict_class === "hard_conflict") {
    return routingVerdict("route", false, "parent_loop", classification, conflict, [
      "Daimyo autonomy threshold allowed proceed, but a hard conflict requires parent-loop routing and sibling quiesce before work continues.",
      conflictRationale(conflict),
      classification.rationale,
      `Daimyo autonomy threshold reason: ${autonomy.reason}.`,
    ]);
  }

  if (conflict.conflict_class === "soft_conflict") {
    return routingVerdict("route", false, "parent_loop", classification, conflict, [
      "Daimyo autonomy threshold allowed proceed, but a soft conflict requires loading sibling context and patching child instructions through the parent loop.",
      conflictRationale(conflict),
      classification.rationale,
      `Daimyo autonomy threshold reason: ${autonomy.reason}.`,
    ]);
  }

  return routingVerdict("permit", false, null, classification, conflict, [
    `Daimyo autonomy threshold allowed proceed: ${autonomy.reason}.`,
    conflictRationale(conflict),
    classification.rationale,
  ]);
}

function permissionVerdict(
  outcome: PolicyVerdict["outcome"],
  reviewRequired: boolean,
  routeTo: PolicyVerdict["route_to"],
  input: PolicyDecisionInput,
  classification: ClassifiedDecision,
  staticRule: RuleMatch,
): PolicyVerdict {
  return {
    outcome,
    conflict_class: "no_conflict",
    review_required: reviewRequired,
    route_to: routeTo,
    classified_domain: classification.domain,
    classified_scope: classification.scope,
    rationale: rationale([
      `Permission request ${input.request.decision_id} was settled by static rules before routing policy.`,
      staticRule.rationale,
      classification.rationale,
    ]),
    matched_rule_refs: [...staticRule.matched_rule_refs],
    engine_version: DECISION_POLICY_ENGINE_VERSION,
  };
}

function routingVerdict(
  outcome: PolicyVerdict["outcome"],
  reviewRequired: boolean,
  routeTo: PolicyVerdict["route_to"],
  classification: ClassifiedDecision,
  conflict: ConflictAssessment,
  rationaleParts: readonly string[],
): PolicyVerdict {
  return {
    outcome,
    conflict_class: conflict.conflict_class,
    review_required: reviewRequired,
    route_to: routeTo,
    classified_domain: classification.domain,
    classified_scope: classification.scope,
    rationale: rationale(rationaleParts),
    matched_rule_refs: [],
    engine_version: DECISION_POLICY_ENGINE_VERSION,
  };
}

function requestWithClassifiedPolicyContext(
  request: DecisionRequestPayload,
  productBaselineApproved: boolean,
  classification: ClassifiedDecision,
): DecisionRequest {
  const context: JsonObject = {
    ...(request.context ?? {}),
    domain: classification.domain,
    decision_domain: classification.domain,
    scope: classification.scope,
    decision_scope: classification.scope,
    product_baseline_approved: productBaselineApproved,
    risk: classification.risk,
    declared_risk: classification.risk,
  };

  if (request.surface === "permission") {
    return {
      ...request,
      context,
    };
  }

  return {
    ...request,
    context,
  };
}

function provisionalDecisionVerdict(classification: ClassifiedDecision): DecisionVerdict {
  return {
    type: "decision",
    suggested_choice: "proceed",
    suggested_response: "Deterministic policy classification produced the autonomy threshold inputs.",
    confidence: DETERMINISTIC_POLICY_CONFIDENCE,
    risk: classification.risk,
    block_trigger: false,
  };
}

function conflictRationale(conflict: ConflictAssessment): string {
  return `Conflict ${conflict.conflict_class}: ${conflict.rationale}`;
}

function rationale(parts: readonly string[]): string {
  return parts.filter((part) => part.length > 0).join(" ");
}
