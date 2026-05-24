import type { AutonomyProfile } from "daimyo";
import type { DecisionRequestPayload, PolicyConfig, PolicyVerdict } from "protocol";
export declare const DECISION_POLICY_ENGINE_VERSION = "0.1.0";
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
export declare class DecisionPolicyEngine implements Engine<PolicyDecisionInput, PolicyVerdict> {
    evaluate(input: PolicyDecisionInput): PolicyVerdict;
}
