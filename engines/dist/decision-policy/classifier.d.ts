import type { AutonomyDomain, DecisionScope, Score0To10 } from "daimyo";
import type { PolicyDecisionInput } from "./engine.js";
type ActionMatch = "exact" | "prefix";
export interface DomainClassificationRule {
    readonly id: string;
    readonly domain: AutonomyDomain;
    readonly match: ActionMatch;
    readonly values: readonly string[];
    readonly rationale: string;
}
export interface ScopeClassificationRule {
    readonly id: string;
    readonly scope: DecisionScope;
    readonly rationale: string;
    readonly matches: (signals: ScopeSignals) => boolean;
}
export interface ClassifiedDecision {
    readonly domain: AutonomyDomain;
    readonly scope: DecisionScope;
    readonly risk: Score0To10;
    readonly rationale: string;
}
interface ScopeSignals {
    readonly altitude?: string;
    readonly surfaces: readonly string[];
}
export declare const DEFAULT_DOMAIN_CLASSIFICATION_RULES: readonly DomainClassificationRule[];
export declare const DEFAULT_SCOPE_CLASSIFICATION_RULES: readonly ScopeClassificationRule[];
export declare function classifyDecision(input: PolicyDecisionInput): ClassifiedDecision;
export {};
