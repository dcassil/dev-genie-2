import type { AutonomyProfile } from "daimyo";
import type { DecisionRequestPayload, OwnershipSurface, PolicyConfig, PolicyVerdict, TouchReport } from "protocol";
import type { SiblingOwnership } from "./conflict.js";
export declare const DECISION_POLICY_ENGINE_VERSION = "0.7.0";
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
export declare class DecisionPolicyEngine implements Engine<PolicyDecisionInput, PolicyVerdict> {
    evaluate(input: PolicyDecisionInput): PolicyVerdict;
}
