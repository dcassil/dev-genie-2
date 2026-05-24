import type { PolicyStaticRule, PolicyStaticRules } from "protocol";
import type { PolicyDecisionInput } from "./engine.js";
export type StaticRuleEffect = "allow" | "deny";
export interface RuleMatch {
    readonly effect: StaticRuleEffect | "no_match";
    readonly matched_rule_ref: string | null;
    readonly matched_rule_refs: readonly string[];
    readonly rationale: string;
}
export declare function evaluateStaticRules(input: PolicyDecisionInput, staticRules: PolicyStaticRules): RuleMatch;
export declare function fromDaimyoStaticRules(allowTools?: readonly string[], denyTools?: readonly string[]): PolicyStaticRule[];
