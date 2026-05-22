import type {
  DecisionRecord,
  DecisionRequest,
  DecisionVerdict,
  JsonObject,
  JsonValue,
} from "../core/domain.js";
import type { CreateTaskInput } from "../core/ports/work-source.js";
import {
  DEFAULT_AUTONOMY_PROFILE,
  evaluateAutonomyThreshold,
  type AutonomyProfile,
} from "../decision/autonomy.js";

export type DecisionSize = "small" | "large";

export type DecisionActionSelection =
  | {
      readonly type: "patch-and-resume";
      readonly size: DecisionSize;
      readonly instruction: string;
    }
  | {
      readonly type: "create-follow-up";
      readonly size: "large";
      readonly task: CreateTaskInput;
    }
  | {
      readonly type: "await-human";
      readonly size: DecisionSize;
      readonly reason: string;
    };

/**
 * Large decisions are classified only from explicit structured routing context:
 * - decision_size/size = "large"
 * - scope/decision_scope = "major"
 * - impact = one of cross_cutting, multi_task, architecture, schema, product_scope
 *
 * The classifier intentionally does not infer size from prose. A caller that
 * wants large-decision behavior must label the decision's scope or impact.
 */
export function classifyDecisionSize(request: DecisionRequest): DecisionSize {
  const context = request.context ?? {};
  if (readString(context, "decision_size") === "large") return "large";
  if (readString(context, "size") === "large") return "large";
  if (readString(context, "scope") === "major") return "large";
  if (readString(context, "decision_scope") === "major") return "large";
  const impact = readString(context, "impact");
  if (
    impact === "cross_cutting" ||
    impact === "multi_task" ||
    impact === "architecture" ||
    impact === "schema" ||
    impact === "product_scope"
  ) {
    return "large";
  }
  return "small";
}

export function selectDecisionAction(
  record: DecisionRecord,
  autonomyProfile: AutonomyProfile = DEFAULT_AUTONOMY_PROFILE,
): DecisionActionSelection {
  if (record.verdict.type === "human" || record.verdict.block_trigger) {
    return {
      type: "await-human",
      size: classifyDecisionSize(record.request),
      reason: record.verdict.suggested_response ?? record.rationale,
    };
  }

  const threshold = evaluateAutonomyThreshold(
    record.request,
    record.verdict,
    autonomyProfile,
  );
  const size = classifyDecisionSize(record.request);
  if (threshold.action === "escalate") {
    return {
      type: "await-human",
      size,
      reason: threshold.reason,
    };
  }

  if (size === "large") {
    return {
      type: "create-follow-up",
      size,
      task: followUpTask(record),
    };
  }

  return {
    type: "patch-and-resume",
    size,
    instruction: verdictInstruction(record.verdict),
  };
}

export function verdictInstruction(verdict: DecisionVerdict): string {
  return (
    verdict.suggested_response ??
    verdict.suggested_choice ??
    "Decision resolved; continue with the selected approach."
  );
}

function followUpTask(record: DecisionRecord): CreateTaskInput {
  const instruction = verdictInstruction(record.verdict);
  return {
    title: `Follow up: ${record.request.prompt.slice(0, 72)}`,
    body: [
      "Created by Daimyo from a large needs-decision verdict.",
      "",
      `Decision: ${instruction}`,
      "",
      `Original request: ${record.request.prompt}`,
    ].join("\n"),
    acceptanceCriteria: ["Resolve the large decision as its own authoritative task."],
    metadata: {
      source: "daimyo-decision-action",
      decision_id: record.id,
      source_task_id: record.request.taskId,
      source_node_id: record.request.nodeId,
      decision_size: "large",
    },
  };
}

function readString(source: JsonObject, key: string): string | undefined {
  const value: JsonValue | undefined = source[key];
  return typeof value === "string" ? value : undefined;
}
