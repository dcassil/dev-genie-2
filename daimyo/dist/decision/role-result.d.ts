import type { DecisionVerdict, RoleResultStatus, Score0To10 } from "../core/domain.js";
export interface DecisionRoleResult {
    readonly status: RoleResultStatus;
    readonly confidence: Score0To10;
    readonly missing_context: readonly string[];
    readonly human_review_required: boolean;
    readonly output: {
        readonly suggested_choice: string | null;
        readonly suggested_response: string | null;
    };
}
export declare function decisionVerdictToRoleResult(verdict: DecisionVerdict): DecisionRoleResult;
export declare function roleResultToDecisionVerdict(result: DecisionRoleResult, verdictType?: DecisionVerdict["type"]): DecisionVerdict;
