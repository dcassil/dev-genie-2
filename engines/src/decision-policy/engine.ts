import type { AutonomyDomain, AutonomyProfile } from "daimyo";
import type { DecisionRequestPayload, PolicyConfig, PolicyVerdict } from "protocol";

export const DECISION_POLICY_ENGINE_VERSION = "0.1.0";

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
  return {
    outcome: "route",
    conflict_class: "soft_conflict",
    review_required: false,
    route_to: "parent_loop",
    classified_domain: defaultDomain(input.config.autonomy_profile),
    classified_scope: "moderate",
    rationale: `Scaffold fallback routed ${input.request.surface} policy decision to the parent loop pending concrete evaluators.`,
    matched_rule_refs: [],
    engine_version: DECISION_POLICY_ENGINE_VERSION,
  };
}

function defaultDomain(profile: AutonomyProfile): AutonomyDomain {
  const profileEntries: ReadonlyArray<readonly [AutonomyDomain, AutonomyProfile[AutonomyDomain]]> = [
    ["engineering", profile.engineering],
    ["product", profile.product],
    ["design", profile.design],
  ];
  const delegatedDomain = profileEntries.find((entry) => entry[1] === "delegate");
  return delegatedDomain?.[0] ?? "engineering";
}
