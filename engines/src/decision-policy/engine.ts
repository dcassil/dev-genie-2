import type { AutonomyProfile } from "daimyo";
import type { DecisionRequestPayload, PolicyConfig, PolicyVerdict } from "protocol";

import { classifyDecision } from "./classifier.js";

export const DECISION_POLICY_ENGINE_VERSION = "0.3.0";

export type PolicyGovernanceConfig = Omit<PolicyConfig, "autonomy_profile"> & {
  readonly autonomy_profile: AutonomyProfile;
};

export interface PolicyDecisionInput {
  readonly request: DecisionRequestPayload;
  readonly config: PolicyGovernanceConfig;
}

export interface Engine<TInput, TOutput> {
  evaluate(input: TInput): TOutput;
}

export class DecisionPolicyEngine implements Engine<PolicyDecisionInput, PolicyVerdict> {
  evaluate(input: PolicyDecisionInput): PolicyVerdict {
    return scaffoldFallbackVerdict(input);
  }
}

function scaffoldFallbackVerdict(input: PolicyDecisionInput): PolicyVerdict {
  const classification = classifyDecision(input);

  return {
    outcome: "route",
    conflict_class: "soft_conflict",
    review_required: false,
    route_to: "parent_loop",
    classified_domain: classification.domain,
    classified_scope: classification.scope,
    rationale: `Scaffold fallback routed ${input.request.surface} policy decision to the parent loop pending concrete evaluators. ${classification.rationale}`,
    matched_rule_refs: [],
    engine_version: DECISION_POLICY_ENGINE_VERSION,
  };
}
