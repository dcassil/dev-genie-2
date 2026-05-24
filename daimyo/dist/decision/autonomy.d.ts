import type { DecisionRequest, DecisionVerdict, Score0To10 } from "../core/domain.js";
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
export declare const DEFAULT_AUTONOMY_PROFILE: AutonomyProfile;
export declare function decisionPolicyContext(request: DecisionRequest, profile: AutonomyProfile): DecisionPolicyContext;
export declare function evaluateAutonomyThreshold(request: DecisionRequest, verdict: DecisionVerdict, profile: AutonomyProfile): AutonomyThresholdResult;
export declare function asScore0To10(value: number, label: string): Score0To10;
