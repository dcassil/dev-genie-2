import { createHash } from "node:crypto";
import type {
  ArtifactReference,
  DecisionRecord as ProtocolDecisionRecord,
  DecisionRecordPayload,
  DecisionRequest as ProtocolDecisionRequest,
  DecisionRequestPayload,
  DecisionTier,
  DecisionVerdict,
  ExecutionEvidence as ProtocolExecutionEvidence,
  ExecutionRecord,
  JsonObject,
  JsonValue,
  OwnershipSurface,
  Producer,
  RoleResult,
  RoleResultPayload,
  RoleResultStatus,
  Score0To10,
  TouchReport,
  ValidationEvidenceStrength,
  ValidationReport as ProtocolValidationReport,
  ValidationReportPayload,
  ValidationStatus,
} from "protocol";

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
  | "cancelled"
  | "superseded";

export interface NodeRef {
  readonly id: NodeId;
  readonly taskId: TaskId;
  readonly type: NodeType;
  readonly status: NodeStatus;
  readonly parentId?: NodeId;
}

export type ValidationScope = "leaf" | "parent";

export type DecisionRequestArtifact = ProtocolDecisionRequest;
export type DecisionRecord = Omit<ProtocolDecisionRecord, "payload"> & { readonly payload: DecisionRecordPayload };
export type ValidationReport = Omit<ProtocolValidationReport, "payload"> & { readonly payload: ValidationReportPayload };
export type ExecutionEvidence = ProtocolExecutionEvidence;
export type DecisionRequest = DecisionRequestPayload;
export type PermissionDecisionRequest = Extract<DecisionRequestPayload, { surface: "permission" }>;
export type RoutingDecisionRequest = Extract<DecisionRequestPayload, { surface: "routing" }>;
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

export const PROTOCOL_VERSION = "1.0.0";
export const PROTOCOL_SCHEMA_VERSION = "1.0.0";

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

export function makeArtifactReference(id: string, relation: ArtifactReference["relation"] = "produces"): ArtifactReference {
  return {
    ref_type: "artifact",
    id,
    relation,
  };
}

export function makeTaskReference(taskId: TaskId, relation: ArtifactReference["relation"] = "read"): ArtifactReference {
  return {
    ref_type: "task",
    id: taskId,
    relation,
  };
}

export function makeExecutionEvidence(input: ExecutionEvidenceInput): ExecutionEvidence {
  const produced_artifact_refs = [
    ...(input.producedArtifactRefs ?? []),
    ...(input.producedArtifactIds ?? []).map((id) => makeArtifactReference(id)),
  ];
  return {
    summary: input.summary,
    touch_report: makeTouchReport(input),
    produced_artifact_refs,
    ...(input.report_ref === undefined ? {} : { report_ref: input.report_ref }),
    ...(input.intendedFiles === undefined ? {} : { intended_files: [...input.intendedFiles] }),
    ...(input.intendedInterfaces === undefined ? {} : { intended_interfaces: [...input.intendedInterfaces] }),
    ...(input.intendedData === undefined ? {} : { intended_data: [...input.intendedData] }),
  };
}

export function makeTouchReport(input: {
  readonly taskId: TaskId;
  readonly touchedFiles?: readonly string[];
  readonly touchedInterfaces?: readonly string[];
  readonly touchedData?: readonly string[];
  readonly touchedWorkflowSteps?: readonly string[];
}): TouchReport {
  return {
    task_id: input.taskId,
    report_type: "touch_report",
    touched_files: [...(input.touchedFiles ?? [])],
    touched_interfaces: [...(input.touchedInterfaces ?? [])],
    touched_data: [...(input.touchedData ?? [])],
    touched_workflow_steps: [...(input.touchedWorkflowSteps ?? [])],
  };
}

export function makeDecisionRecord(input: DecisionRecordInput): DecisionRecord {
  const payload = {
    decision_id: input.decision_id,
    request: input.request,
    verdict: input.verdict,
    tier: input.tier,
    rationale: input.rationale,
  };
  return {
    ...makeEnvelope("DecisionRecord", payload, input.created_at, input.producer, input.source_refs, input.output_refs, input.artifact_id),
    artifact_type: "DecisionRecord",
    payload,
  };
}

export function makeValidationReport(input: ValidationReportInput): ValidationReport {
  const payload = validationReportPayload(input);
  return {
    ...makeEnvelope("ValidationReport", payload, input.created_at, input.producer, input.source_refs, input.output_refs, input.artifact_id),
    artifact_type: "ValidationReport",
    payload,
  };
}

export function decisionRequestId(request: DecisionRequest): DecisionId {
  return asDecisionId(request.decision_id);
}

export function decisionRequestNodeId(request: DecisionRequest): NodeId {
  return asNodeId(request.node_id);
}

export function decisionRequestTaskId(request: DecisionRequest): TaskId {
  return asTaskId(request.task_id);
}

export function decisionRecordId(record: DecisionRecord): DecisionId {
  return asDecisionId(record.payload.decision_id);
}

export function validationReportRef(report: ValidationReport): string {
  return report.payload.report_ref;
}

function makeEnvelope<TPayload extends object>(
  artifactType: string,
  payload: TPayload,
  createdAt: string,
  producer: Producer | undefined,
  sourceRefs: readonly ArtifactReference[] | undefined,
  outputRefs: readonly ArtifactReference[] | undefined,
  artifactId: string | undefined,
) {
  const envelope = {
    artifact_id: artifactId ?? artifactIdFor(artifactType, createdAt, payload),
    artifact_type: artifactType,
    schema_version: PROTOCOL_SCHEMA_VERSION,
    protocol_version: PROTOCOL_VERSION,
    producer: producer ?? { primitive: "loop", name: "daimyo" },
    created_at: createdAt,
    source_refs: [...(sourceRefs ?? [])],
    output_refs: [...(outputRefs ?? [])],
    ownership: emptyOwnershipSurface(),
    confidence: { score: 1, level: "high" as const },
    review_required: { required: false, reason_codes: [] },
    diagnostics: { status: "produced" as const, warnings: [], errors: [], missing_context: [] },
    payload,
  };
  return envelope;
}

function emptyOwnershipSurface(): OwnershipSurface {
  return {
    owns_files: [],
    owns_interfaces: [],
    owns_data: [],
    owns_workflow_steps: [],
  };
}

function artifactIdFor(artifactType: string, createdAt: string, payload: object): string {
  const digest = createHash("sha256")
    .update(JSON.stringify({ artifact_type: artifactType, created_at: createdAt, payload }))
    .digest("hex");
  return `artifact:sha256:${digest}`;
}

function validationReportPayload(input: ValidationReportInput): ValidationReportPayload {
  const common = {
    report_ref: input.report_ref,
    task_id: input.task_id,
    node_id: input.node_id,
    reasons: [...input.reasons],
    evidence_strength: input.evidence_strength,
    evidence: input.evidence,
    details: input.details,
  };
  if (input.scope === "leaf") {
    return {
      ...common,
      scope: "leaf",
      status: input.status,
      completion_decision: {
        can_mark_complete: false,
        authority: "leaf_claim",
        blocking_reason_codes: input.status === "pass" ? [] : [...input.reasons],
      },
    };
  }
  if (input.status === "pass") {
    return {
      ...common,
      scope: "parent",
      status: "pass",
      completion_decision: {
        can_mark_complete: true,
        authority: "parent_authoritative",
        blocking_reason_codes: [],
      },
    };
  }
  return {
    ...common,
    scope: "parent",
    status: "fail",
    completion_decision: {
      can_mark_complete: false,
      authority: "parent_authoritative",
      blocking_reason_codes: [...input.reasons],
    },
  };
}
