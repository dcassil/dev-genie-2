declare module "daimyo" {
  import type { JsonObject, JsonValue, ValidationReport } from "protocol";

  export type NodeId = string & { readonly __nodeId: unique symbol };
  export type TaskId = string & { readonly __taskId: unique symbol };
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
  export type ValidationScope = "leaf" | "parent";
  export type ValidationStatus = "pass" | "fail";

  export interface NodeRef {
    readonly id: NodeId;
    readonly taskId: TaskId;
    readonly type: NodeType;
    readonly status: NodeStatus;
    readonly parentId?: NodeId;
  }

  export interface ExecutionEvidence {
    readonly summary: string;
    readonly touch_report: {
      readonly task_id: TaskId;
      readonly report_type: "touch_report";
      readonly touched_files: readonly string[];
      readonly touched_interfaces: readonly string[];
      readonly touched_data: readonly string[];
      readonly touched_workflow_steps: readonly string[];
    };
    readonly produced_artifact_refs: readonly {
      readonly ref_type: string;
      readonly id: string;
      readonly relation?: string;
    }[];
    readonly report_ref?: string;
    readonly intended_files?: readonly string[];
    readonly intended_interfaces?: readonly string[];
    readonly intended_data?: readonly string[];
  }

  export interface ExecutionNodeInput {
    readonly id: NodeId;
    readonly taskId: TaskId;
    readonly type: NodeType;
    readonly status: NodeStatus;
    readonly parentId?: NodeId;
    readonly retryCount: number;
    readonly session?: unknown;
    readonly workSourceRevision?: string;
    readonly workDefinitionFingerprint?: string;
  }

  export interface ExecutionNodeState extends ExecutionNodeInput {
    readonly decisionRecordIds: readonly string[];
    readonly validationReportRefs: readonly string[];
    readonly evidence: readonly ExecutionEvidence[];
  }

  export interface ExecutionSnapshot {
    readonly taskId: TaskId;
    readonly nodes: readonly ExecutionNodeState[];
    readonly decisions: readonly unknown[];
    readonly validationReports: readonly ValidationReport[];
    readonly cursor?: unknown;
  }

  export interface ExecutionStore {
    upsertNode(taskId: TaskId, node: ExecutionNodeInput): Promise<void>;
    recordDecision(taskId: TaskId, nodeId: NodeId, record: unknown): Promise<void>;
    recordValidationReport(taskId: TaskId, nodeId: NodeId, report: ValidationReport): Promise<void>;
    appendEvidence(taskId: TaskId, nodeId: NodeId, evidence: ExecutionEvidence): Promise<void>;
    setCursor(taskId: TaskId, cursor: unknown): Promise<void>;
    invalidateResumeToken(taskId: TaskId, nodeId: NodeId, reason: string, invalidatedAt: string): Promise<void>;
    listTaskIds(): Promise<readonly TaskId[]>;
    load(taskId: TaskId): Promise<ExecutionSnapshot>;
  }

  export interface CapabilityTask {
    readonly id: TaskId;
    readonly title: string;
    readonly status: string;
    readonly revision: string;
    readonly body: string;
    readonly acceptanceCriteria: readonly string[];
    readonly metadata?: JsonObject;
    readonly parentId?: TaskId;
  }

  export interface ValidationRequest {
    readonly task: CapabilityTask;
    readonly node: NodeRef;
    readonly scope: ValidationScope;
    readonly evidence: ExecutionEvidence;
  }

  export interface ValidationResult {
    readonly status: ValidationStatus;
    readonly reasons: readonly string[];
    readonly report_ref: string;
  }

  export interface DeclaredCommand {
    readonly command: string;
    readonly args?: readonly string[];
    readonly cwd?: string;
    readonly env?: Readonly<Record<string, string>>;
    readonly timeoutMs?: number;
  }

  export interface ShellRunResult {
    readonly exitCode: number;
    readonly stdout: string;
    readonly stderr: string;
  }

  export interface StructuredModelInput {
    readonly context: JsonValue;
    readonly rules?: JsonValue;
    readonly request: JsonValue;
  }

  export interface StructuredModelSchema<T> {
    readonly name: string;
    readonly schema: JsonObject;
    readonly parse: (value: JsonValue) => T;
  }

  export interface StructuredModelRequest<T> {
    readonly input: StructuredModelInput;
    readonly output: StructuredModelSchema<T>;
  }

  export interface StructuredModelCaller {
    call<T>(request: StructuredModelRequest<T>): Promise<T>;
  }

  export interface BuiltInValidationOptions {
    readonly executionStore: ExecutionStore;
    readonly modelClient: StructuredModelCaller;
    readonly runCommand?: (command: DeclaredCommand) => Promise<ShellRunResult>;
    readonly now?: () => string;
    readonly makeReportRef?: (request: ValidationRequest) => string;
  }

  export class BuiltInValidation {
    constructor(options: BuiltInValidationOptions);
    validate(request: ValidationRequest): Promise<ValidationResult>;
  }

  export class StructuredModelCallError extends Error {
    constructor(message: string);
  }

  export function asNodeId(value: string): NodeId;
  export function asTaskId(value: string): TaskId;
}
