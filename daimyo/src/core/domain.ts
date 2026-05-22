export type NodeId = string & { readonly __nodeId: unique symbol };
export type TaskId = string & { readonly __taskId: unique symbol };
export type DecisionId = string & { readonly __decisionId: unique symbol };

export type NodeType = "leaf" | "inner";

export type NodeStatus =
  | "pending"
  | "running"
  | "done"
  | "needs-decision"
  | "failed"
  | "awaiting-human"
  | "superseded";

export type Score0To10 = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export interface NodeRef {
  readonly id: NodeId;
  readonly taskId: TaskId;
  readonly type: NodeType;
  readonly status: NodeStatus;
  readonly parentId?: NodeId;
}

export interface ExecutionEvidence {
  readonly summary: string;
  readonly artifacts?: readonly string[];
  readonly touchedFiles?: readonly string[];
  readonly report_ref?: string;
}

export type ValidationScope = "leaf" | "parent";
export type ValidationStatus = "pass" | "fail";
export type ValidationEvidenceStrength = "command" | "model_fallback";

export interface ValidationReport {
  readonly report_ref: string;
  readonly taskId: TaskId;
  readonly nodeId: NodeId;
  readonly scope: ValidationScope;
  readonly status: ValidationStatus;
  readonly reasons: readonly string[];
  readonly evidence_strength: ValidationEvidenceStrength;
  readonly evidence: ExecutionEvidence;
  readonly details: JsonObject;
  readonly createdAt: string;
}

export interface DecisionRequest {
  readonly id: DecisionId;
  readonly nodeId: NodeId;
  readonly taskId: TaskId;
  readonly surface: "permission" | "routing";
  readonly prompt: string;
  readonly options?: readonly string[];
  readonly context?: JsonObject;
}

export interface ChildDone {
  readonly type: "done";
  readonly nodeId: NodeId;
  readonly evidence: ExecutionEvidence;
}

export interface ChildNeedsDecision {
  readonly type: "needs-decision";
  readonly nodeId: NodeId;
  readonly request: DecisionRequest;
}

export interface ChildFailed {
  readonly type: "failed";
  readonly nodeId: NodeId;
  readonly error: string;
  readonly evidence?: ExecutionEvidence;
  readonly retryable: boolean;
}

export type ChildReturn = ChildDone | ChildNeedsDecision | ChildFailed;

export interface DecisionVerdict {
  readonly type: "decision" | "access" | "human";
  readonly suggested_choice: string | null;
  readonly suggested_response: string | null;
  readonly confidence: Score0To10;
  readonly risk: Score0To10;
  readonly block_trigger: boolean;
}

export type DecisionTier = 0 | 1 | 2 | 3;

export interface DecisionRecord {
  readonly id: DecisionId;
  readonly request: DecisionRequest;
  readonly verdict: DecisionVerdict;
  readonly tier: DecisionTier;
  readonly rationale: string;
  readonly createdAt: string;
}

export function asNodeId(value: string): NodeId {
  if (value.length === 0) throw new Error("NodeId cannot be empty");
  return value as NodeId;
}

export function asTaskId(value: string): TaskId {
  if (value.length === 0) throw new Error("TaskId cannot be empty");
  return value as TaskId;
}

export function asDecisionId(value: string): DecisionId {
  if (value.length === 0) throw new Error("DecisionId cannot be empty");
  return value as DecisionId;
}
