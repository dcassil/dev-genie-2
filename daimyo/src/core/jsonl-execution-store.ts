import { constants } from "node:fs";
import { access, mkdir, open, readFile, truncate } from "node:fs/promises";
import { join } from "node:path";
import type {
  DecisionRecord,
  ExecutionEvidence,
  JsonObject,
  JsonValue,
  NodeId,
  NodeStatus,
  NodeType,
  Score0To10,
  TaskId,
  ValidationEvidenceStrength,
  ValidationReport,
  ValidationScope,
  ValidationStatus,
} from "./domain.js";
import {
  asDecisionId,
  asNodeId,
  asTaskId,
} from "./domain.js";
import type {
  ExecutionCursor,
  ExecutionNodeInput,
  ExecutionNodeState,
  ExecutionSnapshot,
  ExecutionStore,
  ResumeTokenStatus,
  WorkerSessionState,
} from "./execution-store.js";
import { asAgentSessionId } from "./ports/agent-transport.js";

type StoredExecutionEvent =
  | {
      readonly type: "node_upsert";
      readonly node: ExecutionNodeInput;
    }
  | {
      readonly type: "decision_recorded";
      readonly nodeId: NodeId;
      readonly record: DecisionRecord;
    }
  | {
      readonly type: "validation_report_recorded";
      readonly nodeId: NodeId;
      readonly report: ValidationReport;
    }
  | {
      readonly type: "evidence_appended";
      readonly nodeId: NodeId;
      readonly evidence: ExecutionEvidence;
    }
  | {
      readonly type: "cursor_set";
      readonly cursor: ExecutionCursor | null;
    }
  | {
      readonly type: "resume_token_invalidated";
      readonly nodeId: NodeId;
      readonly reason: string;
      readonly invalidatedAt: string;
    };

export interface JsonlExecutionStoreOptions {
  readonly workspaceDir: string;
}

/**
 * JSONL is the first durable adapter because Supervisor state is naturally an
 * append-only stream of loop events. A single fsynced JSON line per operation
 * makes crash recovery simple and inspectable; sqlite can replace this class
 * later without changing the ExecutionStore contract.
 */
export class JsonlExecutionStore implements ExecutionStore {
  private readonly executionDir: string;

  constructor(options: JsonlExecutionStoreOptions) {
    this.executionDir = join(options.workspaceDir, ".supervisor", "execution");
  }

  taskLogPath(taskId: TaskId): string {
    return join(this.executionDir, `${encodeURIComponent(taskId)}.jsonl`);
  }

  async upsertNode(taskId: TaskId, node: ExecutionNodeInput): Promise<void> {
    await this.appendEvent(taskId, { type: "node_upsert", node });
  }

  async recordDecision(
    taskId: TaskId,
    nodeId: NodeId,
    record: DecisionRecord,
  ): Promise<void> {
    await this.appendEvent(taskId, { type: "decision_recorded", nodeId, record });
  }

  async recordValidationReport(
    taskId: TaskId,
    nodeId: NodeId,
    report: ValidationReport,
  ): Promise<void> {
    await this.appendEvent(taskId, {
      type: "validation_report_recorded",
      nodeId,
      report,
    });
  }

  async appendEvidence(
    taskId: TaskId,
    nodeId: NodeId,
    evidence: ExecutionEvidence,
  ): Promise<void> {
    await this.appendEvent(taskId, { type: "evidence_appended", nodeId, evidence });
  }

  async setCursor(taskId: TaskId, cursor: ExecutionCursor | null): Promise<void> {
    await this.appendEvent(taskId, { type: "cursor_set", cursor });
  }

  async invalidateResumeToken(
    taskId: TaskId,
    nodeId: NodeId,
    reason: string,
    invalidatedAt: string,
  ): Promise<void> {
    await this.appendEvent(taskId, {
      type: "resume_token_invalidated",
      nodeId,
      reason,
      invalidatedAt,
    });
  }

  async load(taskId: TaskId): Promise<ExecutionSnapshot> {
    const filePath = this.taskLogPath(taskId);
    const content = await readExistingFile(filePath);
    const completeContent = content.endsWith("\n")
      ? content
      : content.slice(0, lastCompleteLineOffset(content));
    const lines = completeContent.split("\n").filter((line) => line.length > 0);
    const events = lines.map((line) => decodeStoredEvent(line));
    return projectEvents(taskId, events);
  }

  private async appendEvent(taskId: TaskId, event: StoredExecutionEvent): Promise<void> {
    await mkdir(this.executionDir, { recursive: true });
    const filePath = this.taskLogPath(taskId);
    await repairPartialTail(filePath);

    const handle = await open(filePath, "a");
    try {
      await handle.write(`${JSON.stringify(event)}\n`);
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
}

async function readExistingFile(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return "";
    throw error;
  }
}

async function repairPartialTail(filePath: string): Promise<void> {
  try {
    await access(filePath, constants.F_OK);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return;
    throw error;
  }

  const content = await readFile(filePath, "utf8");
  if (content.length === 0 || content.endsWith("\n")) return;
  await truncate(filePath, lastCompleteLineOffset(content));
}

function lastCompleteLineOffset(content: string): number {
  const offset = content.lastIndexOf("\n");
  return offset === -1 ? 0 : offset + 1;
}

function projectEvents(
  taskId: TaskId,
  events: readonly StoredExecutionEvent[],
): ExecutionSnapshot {
  const nodes = new Map<NodeId, ExecutionNodeState>();
  const decisions = new Map<string, DecisionRecord>();
  const validationReports = new Map<string, ValidationReport>();
  let cursor: ExecutionCursor | undefined;

  for (const event of events) {
    switch (event.type) {
      case "node_upsert": {
        const existing = nodes.get(event.node.id);
        const node: ExecutionNodeState = {
          ...event.node,
          decisionRecordIds: existing?.decisionRecordIds ?? [],
          validationReportRefs: existing?.validationReportRefs ?? [],
          evidence: existing?.evidence ?? [],
        };
        nodes.set(event.node.id, node);
        break;
      }
      case "decision_recorded": {
        decisions.set(event.record.id, event.record);
        const node = requireNode(nodes, event.nodeId, event.type);
        const decisionRecordIds = node.decisionRecordIds.includes(event.record.id)
          ? node.decisionRecordIds
          : [...node.decisionRecordIds, event.record.id];
        nodes.set(event.nodeId, { ...node, decisionRecordIds });
        break;
      }
      case "validation_report_recorded": {
        validationReports.set(event.report.report_ref, event.report);
        const node = requireNode(nodes, event.nodeId, event.type);
        const validationReportRefs = node.validationReportRefs.includes(event.report.report_ref)
          ? node.validationReportRefs
          : [...node.validationReportRefs, event.report.report_ref];
        nodes.set(event.nodeId, { ...node, validationReportRefs });
        break;
      }
      case "evidence_appended": {
        const node = requireNode(nodes, event.nodeId, event.type);
        nodes.set(event.nodeId, { ...node, evidence: [...node.evidence, event.evidence] });
        break;
      }
      case "cursor_set": {
        cursor = event.cursor ?? undefined;
        break;
      }
      case "resume_token_invalidated": {
        const node = requireNode(nodes, event.nodeId, event.type);
        if (node.session === undefined) {
          throw new Error(`Cannot invalidate resume token for node without session: ${event.nodeId}`);
        }
        const session: WorkerSessionState = {
          ...node.session,
          tokenStatus: "restart-required",
          restartReason: event.reason,
          invalidatedAt: event.invalidatedAt,
        };
        nodes.set(event.nodeId, { ...node, session });
        break;
      }
    }
  }

  const snapshot: ExecutionSnapshot = {
    taskId,
    nodes: Array.from(nodes.values()),
    decisions: Array.from(decisions.values()),
    validationReports: Array.from(validationReports.values()),
    ...(cursor === undefined ? {} : { cursor }),
  };
  return snapshot;
}

function requireNode(
  nodes: ReadonlyMap<NodeId, ExecutionNodeState>,
  nodeId: NodeId,
  eventType: string,
): ExecutionNodeState {
  const node = nodes.get(nodeId);
  if (node === undefined) {
    throw new Error(`Execution event ${eventType} referenced unknown node: ${nodeId}`);
  }
  return node;
}

function decodeStoredEvent(line: string): StoredExecutionEvent {
  const value: JsonValue = JSON.parse(line);
  const event = readObjectValue(value, "execution event");
  const type = readString(event, "type");

  switch (type) {
    case "node_upsert":
      return {
        type,
        node: readNodeInput(readObject(event, "node")),
      };
    case "decision_recorded":
      return {
        type,
        nodeId: asNodeId(readString(event, "nodeId")),
        record: readDecisionRecord(readObject(event, "record")),
      };
    case "validation_report_recorded":
      return {
        type,
        nodeId: asNodeId(readString(event, "nodeId")),
        report: readValidationReport(readObject(event, "report")),
      };
    case "evidence_appended":
      return {
        type,
        nodeId: asNodeId(readString(event, "nodeId")),
        evidence: readEvidence(readObject(event, "evidence")),
      };
    case "cursor_set":
      return {
        type,
        cursor: readNullableCursor(event, "cursor"),
      };
    case "resume_token_invalidated":
      return {
        type,
        nodeId: asNodeId(readString(event, "nodeId")),
        reason: readString(event, "reason"),
        invalidatedAt: readString(event, "invalidatedAt"),
      };
    default:
      throw new Error(`Unknown execution event type: ${type}`);
  }
}

function readNodeInput(value: JsonObject): ExecutionNodeInput {
  const parentId = readOptionalString(value, "parentId");
  const session = readOptionalObject(value, "session");
  const node: ExecutionNodeInput = {
    id: asNodeId(readString(value, "id")),
    taskId: asTaskId(readString(value, "taskId")),
    type: readNodeType(value, "type"),
    status: readNodeStatus(value, "status"),
    retryCount: readNonNegativeInteger(value, "retryCount"),
    ...(parentId === undefined ? {} : { parentId: asNodeId(parentId) }),
    ...(session === undefined ? {} : { session: readSession(session) }),
  };
  return node;
}

function readSession(value: JsonObject): WorkerSessionState {
  const restartReason = readOptionalString(value, "restartReason");
  const invalidatedAt = readOptionalString(value, "invalidatedAt");
  const session: WorkerSessionState = {
    sessionId: asAgentSessionId(readString(value, "sessionId")),
    resumeToken: readString(value, "resumeToken"),
    tokenStatus: readResumeTokenStatus(value, "tokenStatus"),
    ...(restartReason === undefined ? {} : { restartReason }),
    ...(invalidatedAt === undefined ? {} : { invalidatedAt }),
  };
  return session;
}

function readNullableCursor(value: JsonObject, key: string): ExecutionCursor | null {
  const field = value[key];
  if (field === null) return null;
  return readCursor(readObject(value, key));
}

function readCursor(value: JsonObject): ExecutionCursor {
  return {
    nodeId: asNodeId(readString(value, "nodeId")),
    reason: readCursorReason(value, "reason"),
    updatedAt: readString(value, "updatedAt"),
  };
}

function readDecisionRecord(value: JsonObject): DecisionRecord {
  return {
    id: asDecisionId(readString(value, "id")),
    request: readDecisionRequest(readObject(value, "request")),
    verdict: readDecisionVerdict(readObject(value, "verdict")),
    tier: readDecisionTier(value, "tier"),
    rationale: readString(value, "rationale"),
    createdAt: readString(value, "createdAt"),
  };
}

function readDecisionRequest(value: JsonObject): DecisionRecord["request"] {
  const options = readOptionalStringArray(value, "options");
  const context = readOptionalObject(value, "context");
  const base = {
    id: asDecisionId(readString(value, "id")),
    nodeId: asNodeId(readString(value, "nodeId")),
    taskId: asTaskId(readString(value, "taskId")),
    prompt: readString(value, "prompt"),
    ...(context === undefined ? {} : { context }),
  };
  const surface = readStringUnion(value, "surface", ["permission", "routing"]);

  if (surface === "permission") {
    return {
      ...base,
      surface,
      toolName: readString(value, "toolName"),
      arguments: readObject(value, "arguments"),
    };
  }

  return {
    ...base,
    surface,
    ...(options === undefined ? {} : { options }),
  };
}

function readDecisionVerdict(value: JsonObject): DecisionRecord["verdict"] {
  return {
    type: readStringUnion(value, "type", ["decision", "access", "human"]),
    suggested_choice: readNullableString(value, "suggested_choice"),
    suggested_response: readNullableString(value, "suggested_response"),
    confidence: readScore(value, "confidence"),
    risk: readScore(value, "risk"),
    block_trigger: readBoolean(value, "block_trigger"),
  };
}

function readValidationReport(value: JsonObject): ValidationReport {
  return {
    report_ref: readString(value, "report_ref"),
    taskId: asTaskId(readString(value, "taskId")),
    nodeId: asNodeId(readString(value, "nodeId")),
    scope: readValidationScope(value, "scope"),
    status: readValidationStatus(value, "status"),
    reasons: readStringArray(value, "reasons"),
    evidence_strength: readValidationEvidenceStrength(value, "evidence_strength"),
    evidence: readEvidence(readObject(value, "evidence")),
    details: readObject(value, "details"),
    createdAt: readString(value, "createdAt"),
  };
}

function readEvidence(value: JsonObject): ExecutionEvidence {
  const artifacts = readOptionalStringArray(value, "artifacts");
  const touchedFiles = readOptionalStringArray(value, "touchedFiles");
  const reportRef = readOptionalString(value, "report_ref");
  return {
    summary: readString(value, "summary"),
    ...(artifacts === undefined ? {} : { artifacts }),
    ...(touchedFiles === undefined ? {} : { touchedFiles }),
    ...(reportRef === undefined ? {} : { report_ref: reportRef }),
  };
}

function readObject(source: JsonObject, key: string): JsonObject {
  return readObjectValue(source[key], key);
}

function readOptionalObject(source: JsonObject, key: string): JsonObject | undefined {
  const value = source[key];
  if (value === undefined) return undefined;
  return readObjectValue(value, key);
}

function readObjectValue(value: JsonValue | undefined, label: string): JsonObject {
  if (isJsonObject(value)) return value;
  throw new Error(`Expected ${label} to be an object`);
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(source: JsonObject, key: string): string {
  const value = source[key];
  if (typeof value === "string") return value;
  throw new Error(`Expected ${key} to be a string`);
}

function readOptionalString(source: JsonObject, key: string): string | undefined {
  const value = source[key];
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  throw new Error(`Expected ${key} to be a string`);
}

function readNullableString(source: JsonObject, key: string): string | null {
  const value = source[key];
  if (value === null || typeof value === "string") return value;
  throw new Error(`Expected ${key} to be a nullable string`);
}

function readBoolean(source: JsonObject, key: string): boolean {
  const value = source[key];
  if (typeof value === "boolean") return value;
  throw new Error(`Expected ${key} to be a boolean`);
}

function readNonNegativeInteger(source: JsonObject, key: string): number {
  const value = source[key];
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  throw new Error(`Expected ${key} to be a non-negative integer`);
}

function readScore(source: JsonObject, key: string): Score0To10 {
  const value = readNonNegativeInteger(source, key);
  if (
    value === 0 ||
    value === 1 ||
    value === 2 ||
    value === 3 ||
    value === 4 ||
    value === 5 ||
    value === 6 ||
    value === 7 ||
    value === 8 ||
    value === 9 ||
    value === 10
  ) {
    return value;
  }
  throw new Error(`Expected ${key} to be a score from 0 to 10`);
}

function readDecisionTier(source: JsonObject, key: string): DecisionRecord["tier"] {
  const value = readNonNegativeInteger(source, key);
  if (value === 0 || value === 1 || value === 2 || value === 3) return value;
  throw new Error(`Expected ${key} to be a decision tier`);
}

function readNodeType(source: JsonObject, key: string): NodeType {
  return readStringUnion(source, key, ["leaf", "inner"]);
}

function readValidationScope(source: JsonObject, key: string): ValidationScope {
  return readStringUnion(source, key, ["leaf", "parent"]);
}

function readValidationStatus(source: JsonObject, key: string): ValidationStatus {
  return readStringUnion(source, key, ["pass", "fail"]);
}

function readValidationEvidenceStrength(
  source: JsonObject,
  key: string,
): ValidationEvidenceStrength {
  return readStringUnion(source, key, ["command", "model_fallback"]);
}

function readNodeStatus(source: JsonObject, key: string): NodeStatus {
  return readStringUnion(source, key, [
    "pending",
    "running",
    "done",
    "needs-decision",
    "failed",
    "awaiting-human",
    "superseded",
  ]);
}

function readResumeTokenStatus(source: JsonObject, key: string): ResumeTokenStatus {
  return readStringUnion(source, key, ["resumable", "restart-required"]);
}

function readCursorReason(source: JsonObject, key: string): ExecutionCursor["reason"] {
  return readStringUnion(source, key, [
    "scheduled",
    "running",
    "awaiting-decision",
    "recovering",
  ]);
}

function readStringUnion<const T extends readonly string[]>(
  source: JsonObject,
  key: string,
  allowed: T,
): T[number] {
  const value = readString(source, key);
  if (isOneOf(value, allowed)) return value;
  throw new Error(`Unexpected ${key}: ${value}`);
}

function isOneOf<const T extends readonly string[]>(
  value: string,
  allowed: T,
): value is T[number] {
  return allowed.some((item) => item === value);
}

function readOptionalStringArray(
  source: JsonObject,
  key: string,
): readonly string[] | undefined {
  const value = source[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error(`Expected ${key} to be a string array`);
  return value.map((item) => {
    if (typeof item !== "string") throw new Error(`Expected ${key} to be a string array`);
    return item;
  });
}

function readStringArray(source: JsonObject, key: string): readonly string[] {
  const value = readOptionalStringArray(source, key);
  if (value !== undefined) return value;
  throw new Error(`Expected ${key} to be a string array`);
}

interface ErrorWithCode extends Error {
  readonly code?: string;
}

function isNodeError(error: unknown): error is ErrorWithCode {
  return error instanceof Error && "code" in error;
}
