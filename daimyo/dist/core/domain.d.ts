import type { ArtifactReference, DecisionRecord as ProtocolDecisionRecord, DecisionRecordPayload, DecisionRequest as ProtocolDecisionRequest, DecisionRequestPayload, DecisionTier, DecisionVerdict, ExecutionEvidence as ProtocolExecutionEvidence, ExecutionRecord, JsonObject, JsonValue, OwnershipSurface, Producer, RoleResult, RoleResultPayload, RoleResultStatus, Score0To10, TouchReport, ValidationEvidenceStrength, ValidationReport as ProtocolValidationReport, ValidationReportPayload, ValidationStatus } from "protocol";
export type NodeId = string & {
    readonly __nodeId: unique symbol;
};
export type TaskId = string & {
    readonly __taskId: unique symbol;
};
export type DecisionId = string & {
    readonly __decisionId: unique symbol;
};
export type NodeType = "leaf" | "inner";
export type NodeStatus = "pending" | "running" | "done" | "needs-decision" | "failed" | "awaiting-human" | "cancelled" | "superseded";
export interface NodeRef {
    readonly id: NodeId;
    readonly taskId: TaskId;
    readonly type: NodeType;
    readonly status: NodeStatus;
    readonly parentId?: NodeId;
}
export type ValidationScope = "leaf" | "parent";
export type DecisionRequestArtifact = ProtocolDecisionRequest;
export type DecisionRecord = Omit<ProtocolDecisionRecord, "payload"> & {
    readonly payload: DecisionRecordPayload;
};
export type ValidationReport = Omit<ProtocolValidationReport, "payload"> & {
    readonly payload: ValidationReportPayload;
};
export type ExecutionEvidence = ProtocolExecutionEvidence;
export type DecisionRequest = DecisionRequestPayload;
export type PermissionDecisionRequest = Extract<DecisionRequestPayload, {
    surface: "permission";
}>;
export type RoutingDecisionRequest = Extract<DecisionRequestPayload, {
    surface: "routing";
}>;
export type { ArtifactReference, DecisionTier, DecisionVerdict, ExecutionRecord, JsonObject, JsonValue, OwnershipSurface, Producer, RoleResult, RoleResultPayload, RoleResultStatus, Score0To10, TouchReport, ValidationEvidenceStrength, ValidationReportPayload, ValidationStatus };
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
export declare const PROTOCOL_VERSION = "1.0.0";
export declare const PROTOCOL_SCHEMA_VERSION = "1.0.0";
export interface ExecutionEvidenceInput {
    readonly taskId: TaskId;
    readonly summary: string;
    readonly producedArtifactRefs?: readonly ArtifactReference[];
    readonly producedArtifactIds?: readonly string[];
    readonly touchedFiles?: readonly string[];
    readonly touchedInterfaces?: readonly string[];
    readonly touchedData?: readonly string[];
    readonly touchedWorkflowSteps?: readonly string[];
    readonly intendedFiles?: readonly string[];
    readonly intendedInterfaces?: readonly string[];
    readonly intendedData?: readonly string[];
    readonly report_ref?: string;
}
export interface DecisionRecordInput {
    readonly artifact_id?: string;
    readonly decision_id: DecisionId;
    readonly request: DecisionRequest;
    readonly verdict: DecisionVerdict;
    readonly tier: DecisionTier;
    readonly rationale: string;
    readonly created_at: string;
    readonly producer?: Producer;
    readonly source_refs?: readonly ArtifactReference[];
    readonly output_refs?: readonly ArtifactReference[];
}
export interface ValidationReportInput {
    readonly artifact_id?: string;
    readonly report_ref: string;
    readonly task_id: TaskId;
    readonly node_id: NodeId;
    readonly scope: ValidationScope;
    readonly status: ValidationStatus;
    readonly reasons: readonly string[];
    readonly evidence_strength: ValidationEvidenceStrength;
    readonly evidence: ExecutionEvidence;
    readonly details: JsonObject;
    readonly created_at: string;
    readonly producer?: Producer;
    readonly source_refs?: readonly ArtifactReference[];
    readonly output_refs?: readonly ArtifactReference[];
}
export declare function asNodeId(value: string): NodeId;
export declare function asTaskId(value: string): TaskId;
export declare function asDecisionId(value: string): DecisionId;
export declare function makeArtifactReference(id: string, relation?: ArtifactReference["relation"]): ArtifactReference;
export declare function makeTaskReference(taskId: TaskId, relation?: ArtifactReference["relation"]): ArtifactReference;
export declare function makeExecutionEvidence(input: ExecutionEvidenceInput): ExecutionEvidence;
export declare function makeTouchReport(input: {
    readonly taskId: TaskId;
    readonly touchedFiles?: readonly string[];
    readonly touchedInterfaces?: readonly string[];
    readonly touchedData?: readonly string[];
    readonly touchedWorkflowSteps?: readonly string[];
}): TouchReport;
export declare function makeDecisionRecord(input: DecisionRecordInput): DecisionRecord;
export declare function makeValidationReport(input: ValidationReportInput): ValidationReport;
export declare function decisionRequestId(request: DecisionRequest): DecisionId;
export declare function decisionRequestNodeId(request: DecisionRequest): NodeId;
export declare function decisionRequestTaskId(request: DecisionRequest): TaskId;
export declare function decisionRecordId(record: DecisionRecord): DecisionId;
export declare function validationReportRef(report: ValidationReport): string;
