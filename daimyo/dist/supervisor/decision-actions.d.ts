import type { DecisionRecord, DecisionRequest, DecisionVerdict } from "../core/domain.js";
import type { CreateTaskInput } from "../core/ports/work-source.js";
import { type AutonomyProfile } from "../decision/autonomy.js";
export type DecisionSize = "small" | "large";
export type DecisionActionSelection = {
    readonly type: "patch-and-resume";
    readonly size: DecisionSize;
    readonly instruction: string;
} | {
    readonly type: "create-follow-up";
    readonly size: "large";
    readonly task: CreateTaskInput;
} | {
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
export declare function classifyDecisionSize(request: DecisionRequest): DecisionSize;
export declare function selectDecisionAction(record: DecisionRecord, autonomyProfile?: AutonomyProfile): DecisionActionSelection;
export declare function verdictInstruction(verdict: DecisionVerdict): string;
