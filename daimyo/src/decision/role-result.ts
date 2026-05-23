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

export function decisionVerdictToRoleResult(verdict: DecisionVerdict): DecisionRoleResult {
  const status = roleStatusForVerdict(verdict);
  return {
    status,
    confidence: verdict.confidence,
    missing_context: status === "needs_human" ? ["human_decision"] : [],
    human_review_required: status === "needs_human" || status === "blocked",
    output: {
      suggested_choice: verdict.suggested_choice,
      suggested_response: verdict.suggested_response,
    },
  };
}

export function roleResultToDecisionVerdict(
  result: DecisionRoleResult,
  verdictType: DecisionVerdict["type"] = "decision",
): DecisionVerdict {
  if (result.status === "needs_human") {
    return {
      type: "human",
      suggested_choice: result.output.suggested_choice,
      suggested_response: result.output.suggested_response,
      confidence: result.confidence,
      risk: 10,
      block_trigger: true,
    };
  }

  if (result.status === "blocked") {
    return {
      type: verdictType,
      suggested_choice: result.output.suggested_choice,
      suggested_response: result.output.suggested_response,
      confidence: result.confidence,
      risk: 10,
      block_trigger: true,
    };
  }

  return {
    type: verdictType,
    suggested_choice: result.output.suggested_choice,
    suggested_response: result.output.suggested_response,
    confidence: result.confidence,
    risk: result.human_review_required ? 7 : 3,
    block_trigger: result.human_review_required,
  };
}

function roleStatusForVerdict(verdict: DecisionVerdict): RoleResultStatus {
  if (verdict.type === "human") return "needs_human";
  if (verdict.block_trigger) return "blocked";
  if (verdict.suggested_choice === null && verdict.suggested_response === null) {
    return "skipped";
  }
  return "produced";
}
