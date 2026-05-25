import{createRequire as __cr}from "node:module";const require=__cr(import.meta.url);

// src/core/domain.ts
import { createHash } from "node:crypto";
var PROTOCOL_VERSION = "1.0.0";
var PROTOCOL_SCHEMA_VERSION = "1.0.0";
function asNodeId(value) {
  if (value.length === 0) throw new Error("NodeId cannot be empty");
  return value;
}
function asTaskId(value) {
  if (value.length === 0) throw new Error("TaskId cannot be empty");
  return value;
}
function asDecisionId(value) {
  if (value.length === 0) throw new Error("DecisionId cannot be empty");
  return value;
}
function makeArtifactReference(id, relation = "produces") {
  return {
    ref_type: "artifact",
    id,
    relation
  };
}
function makeTaskReference(taskId, relation = "read") {
  return {
    ref_type: "task",
    id: taskId,
    relation
  };
}
function makeExecutionEvidence(input) {
  const produced_artifact_refs = [
    ...input.producedArtifactRefs ?? [],
    ...(input.producedArtifactIds ?? []).map((id) => makeArtifactReference(id))
  ];
  return {
    summary: input.summary,
    touch_report: makeTouchReport(input),
    produced_artifact_refs,
    ...input.report_ref === void 0 ? {} : { report_ref: input.report_ref },
    ...input.intendedFiles === void 0 ? {} : { intended_files: [...input.intendedFiles] },
    ...input.intendedInterfaces === void 0 ? {} : { intended_interfaces: [...input.intendedInterfaces] },
    ...input.intendedData === void 0 ? {} : { intended_data: [...input.intendedData] }
  };
}
function makeTouchReport(input) {
  return {
    task_id: input.taskId,
    report_type: "touch_report",
    touched_files: [...input.touchedFiles ?? []],
    touched_interfaces: [...input.touchedInterfaces ?? []],
    touched_data: [...input.touchedData ?? []],
    touched_workflow_steps: [...input.touchedWorkflowSteps ?? []]
  };
}
function makeDecisionRecord(input) {
  const payload = {
    decision_id: input.decision_id,
    request: input.request,
    verdict: input.verdict,
    tier: input.tier,
    rationale: input.rationale
  };
  return {
    ...makeEnvelope("DecisionRecord", payload, input.created_at, input.producer, input.source_refs, input.output_refs, input.artifact_id),
    artifact_type: "DecisionRecord",
    payload
  };
}
function makeValidationReport(input) {
  const payload = validationReportPayload(input);
  return {
    ...makeEnvelope("ValidationReport", payload, input.created_at, input.producer, input.source_refs, input.output_refs, input.artifact_id),
    artifact_type: "ValidationReport",
    payload
  };
}
function decisionRequestId(request) {
  return asDecisionId(request.decision_id);
}
function decisionRequestNodeId(request) {
  return asNodeId(request.node_id);
}
function decisionRequestTaskId(request) {
  return asTaskId(request.task_id);
}
function decisionRecordId(record) {
  return asDecisionId(record.payload.decision_id);
}
function validationReportRef(report) {
  return report.payload.report_ref;
}
function makeEnvelope(artifactType, payload, createdAt, producer, sourceRefs, outputRefs, artifactId) {
  const envelope = {
    artifact_id: artifactId ?? artifactIdFor(artifactType, createdAt, payload),
    artifact_type: artifactType,
    schema_version: PROTOCOL_SCHEMA_VERSION,
    protocol_version: PROTOCOL_VERSION,
    producer: producer ?? { primitive: "loop", name: "daimyo" },
    created_at: createdAt,
    source_refs: [...sourceRefs ?? []],
    output_refs: [...outputRefs ?? []],
    ownership: emptyOwnershipSurface(),
    confidence: { score: 1, level: "high" },
    review_required: { required: false, reason_codes: [] },
    diagnostics: { status: "produced", warnings: [], errors: [], missing_context: [] },
    payload
  };
  return envelope;
}
function emptyOwnershipSurface() {
  return {
    owns_files: [],
    owns_interfaces: [],
    owns_data: [],
    owns_workflow_steps: []
  };
}
function artifactIdFor(artifactType, createdAt, payload) {
  const digest = createHash("sha256").update(JSON.stringify({ artifact_type: artifactType, created_at: createdAt, payload })).digest("hex");
  return `artifact:sha256:${digest}`;
}
function validationReportPayload(input) {
  const common = {
    report_ref: input.report_ref,
    task_id: input.task_id,
    node_id: input.node_id,
    reasons: [...input.reasons],
    evidence_strength: input.evidence_strength,
    evidence: input.evidence,
    details: input.details
  };
  if (input.scope === "leaf") {
    return {
      ...common,
      scope: "leaf",
      status: input.status,
      completion_decision: {
        can_mark_complete: false,
        authority: "leaf_claim",
        blocking_reason_codes: input.status === "pass" ? [] : [...input.reasons]
      }
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
        blocking_reason_codes: []
      }
    };
  }
  return {
    ...common,
    scope: "parent",
    status: "fail",
    completion_decision: {
      can_mark_complete: false,
      authority: "parent_authoritative",
      blocking_reason_codes: [...input.reasons]
    }
  };
}

// src/core/execution-store.ts
function workerRequiresRestart(node) {
  return node.session?.tokenStatus === "restart-required";
}
function rebuildExecutionNodeTree(snapshot) {
  const childrenByParent = /* @__PURE__ */ new Map();
  const roots = [];
  for (const node of snapshot.nodes) {
    if (node.parentId === void 0) {
      roots.push(node);
      continue;
    }
    const children = childrenByParent.get(node.parentId) ?? [];
    children.push(node);
    childrenByParent.set(node.parentId, children);
  }
  const buildTree = (node) => ({
    node,
    children: (childrenByParent.get(node.id) ?? []).map(buildTree)
  });
  return roots.map(buildTree);
}

// src/core/jsonl-execution-store.ts
import { constants } from "node:fs";
import { access, mkdir, open, readFile, readdir, truncate } from "node:fs/promises";
import { join } from "node:path";

// src/core/ports/agent-transport.ts
var AgentCommandRejectedError = class extends Error {
  correlationId;
  commandType;
  constructor(message, correlationId, commandType) {
    super(message);
    this.name = "AgentCommandRejectedError";
    this.correlationId = correlationId;
    this.commandType = commandType;
  }
};
var AgentSessionResumeRejectedError = class extends Error {
  sessionId;
  constructor(message, sessionId) {
    super(message);
    this.name = "AgentSessionResumeRejectedError";
    this.sessionId = sessionId;
  }
};
function asAgentSessionId(value) {
  if (value.length === 0) throw new Error("AgentSessionId cannot be empty");
  return value;
}
function asTransportCorrelationId(value) {
  if (value.length === 0) throw new Error("TransportCorrelationId cannot be empty");
  return value;
}

// src/core/jsonl-execution-store.ts
var JsonlExecutionStore = class {
  executionDir;
  constructor(options) {
    this.executionDir = join(options.workspaceDir, ".supervisor", "execution");
  }
  taskLogPath(taskId) {
    return join(this.executionDir, `${encodeURIComponent(taskId)}.jsonl`);
  }
  async upsertNode(taskId, node) {
    await this.appendEvent(taskId, { type: "node_upsert", node });
  }
  async recordDecision(taskId, nodeId, record) {
    await this.appendEvent(taskId, { type: "decision_recorded", nodeId, record });
  }
  async recordValidationReport(taskId, nodeId, report) {
    await this.appendEvent(taskId, {
      type: "validation_report_recorded",
      nodeId,
      report
    });
  }
  async appendEvidence(taskId, nodeId, evidence) {
    await this.appendEvent(taskId, { type: "evidence_appended", nodeId, evidence });
  }
  async setCursor(taskId, cursor) {
    await this.appendEvent(taskId, { type: "cursor_set", cursor });
  }
  async invalidateResumeToken(taskId, nodeId, reason, invalidatedAt) {
    await this.appendEvent(taskId, {
      type: "resume_token_invalidated",
      nodeId,
      reason,
      invalidatedAt
    });
  }
  async listTaskIds() {
    let entries;
    try {
      entries = await readdir(this.executionDir);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return [];
      throw error;
    }
    return entries.filter((entry) => entry.endsWith(".jsonl")).map((entry) => asTaskId(decodeURIComponent(entry.slice(0, -".jsonl".length)))).sort((left, right) => left.localeCompare(right));
  }
  async load(taskId) {
    const filePath = this.taskLogPath(taskId);
    const content = await readExistingFile(filePath);
    const completeContent = content.endsWith("\n") ? content : content.slice(0, lastCompleteLineOffset(content));
    const lines = completeContent.split("\n").filter((line) => line.length > 0);
    const events = lines.map((line) => decodeStoredEvent(line));
    return projectEvents(taskId, events);
  }
  async appendEvent(taskId, event) {
    await mkdir(this.executionDir, { recursive: true });
    const filePath = this.taskLogPath(taskId);
    await repairPartialTail(filePath);
    const handle = await open(filePath, "a");
    try {
      await handle.write(`${JSON.stringify(event)}
`);
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
};
async function readExistingFile(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return "";
    throw error;
  }
}
async function repairPartialTail(filePath) {
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
function lastCompleteLineOffset(content) {
  const offset = content.lastIndexOf("\n");
  return offset === -1 ? 0 : offset + 1;
}
function projectEvents(taskId, events) {
  const nodes = /* @__PURE__ */ new Map();
  const decisions = /* @__PURE__ */ new Map();
  const validationReports = /* @__PURE__ */ new Map();
  let cursor;
  for (const event of events) {
    switch (event.type) {
      case "node_upsert": {
        const existing = nodes.get(event.node.id);
        const node = {
          ...event.node,
          decisionRecordIds: existing?.decisionRecordIds ?? [],
          validationReportRefs: existing?.validationReportRefs ?? [],
          evidence: existing?.evidence ?? []
        };
        nodes.set(event.node.id, node);
        break;
      }
      case "decision_recorded": {
        const decisionId = asDecisionId(event.record.payload.decision_id);
        decisions.set(decisionId, event.record);
        const node = requireNode(nodes, event.nodeId, event.type);
        const decisionRecordIds = node.decisionRecordIds.includes(decisionId) ? node.decisionRecordIds : [...node.decisionRecordIds, decisionId];
        nodes.set(event.nodeId, { ...node, decisionRecordIds });
        break;
      }
      case "validation_report_recorded": {
        const reportRef = validationReportRef(event.report);
        validationReports.set(reportRef, event.report);
        const node = requireNode(nodes, event.nodeId, event.type);
        const validationReportRefs = node.validationReportRefs.includes(reportRef) ? node.validationReportRefs : [...node.validationReportRefs, reportRef];
        nodes.set(event.nodeId, { ...node, validationReportRefs });
        break;
      }
      case "evidence_appended": {
        const node = requireNode(nodes, event.nodeId, event.type);
        nodes.set(event.nodeId, { ...node, evidence: [...node.evidence, event.evidence] });
        break;
      }
      case "cursor_set": {
        cursor = event.cursor ?? void 0;
        break;
      }
      case "resume_token_invalidated": {
        const node = requireNode(nodes, event.nodeId, event.type);
        if (node.session === void 0) {
          throw new Error(`Cannot invalidate resume token for node without session: ${event.nodeId}`);
        }
        const session = {
          ...node.session,
          tokenStatus: "restart-required",
          restartReason: event.reason,
          invalidatedAt: event.invalidatedAt
        };
        nodes.set(event.nodeId, { ...node, session });
        break;
      }
    }
  }
  const snapshot = {
    taskId,
    nodes: Array.from(nodes.values()),
    decisions: Array.from(decisions.values()),
    validationReports: Array.from(validationReports.values()),
    ...cursor === void 0 ? {} : { cursor }
  };
  return snapshot;
}
function requireNode(nodes, nodeId, eventType) {
  const node = nodes.get(nodeId);
  if (node === void 0) {
    throw new Error(`Execution event ${eventType} referenced unknown node: ${nodeId}`);
  }
  return node;
}
function decodeStoredEvent(line) {
  const value = JSON.parse(line);
  const event = readObjectValue(value, "execution event");
  const type = readString(event, "type");
  switch (type) {
    case "node_upsert":
      return {
        type,
        node: readNodeInput(readObject(event, "node"))
      };
    case "decision_recorded":
      return {
        type,
        nodeId: asNodeId(readString(event, "nodeId")),
        record: readDecisionRecord(readObject(event, "record"))
      };
    case "validation_report_recorded":
      return {
        type,
        nodeId: asNodeId(readString(event, "nodeId")),
        report: readValidationReport(readObject(event, "report"))
      };
    case "evidence_appended":
      return {
        type,
        nodeId: asNodeId(readString(event, "nodeId")),
        evidence: readEvidence(readObject(event, "evidence"))
      };
    case "cursor_set":
      return {
        type,
        cursor: readNullableCursor(event, "cursor")
      };
    case "resume_token_invalidated":
      return {
        type,
        nodeId: asNodeId(readString(event, "nodeId")),
        reason: readString(event, "reason"),
        invalidatedAt: readString(event, "invalidatedAt")
      };
    default:
      throw new Error(`Unknown execution event type: ${type}`);
  }
}
function readNodeInput(value) {
  const parentId = readOptionalString(value, "parentId");
  const session = readOptionalObject(value, "session");
  const workSourceRevision = readOptionalString(value, "workSourceRevision");
  const workDefinitionFingerprint2 = readOptionalString(value, "workDefinitionFingerprint");
  const node = {
    id: asNodeId(readString(value, "id")),
    taskId: asTaskId(readString(value, "taskId")),
    type: readNodeType(value, "type"),
    status: readNodeStatus(value, "status"),
    retryCount: readNonNegativeInteger(value, "retryCount"),
    ...parentId === void 0 ? {} : { parentId: asNodeId(parentId) },
    ...session === void 0 ? {} : { session: readSession(session) },
    ...workSourceRevision === void 0 ? {} : { workSourceRevision },
    ...workDefinitionFingerprint2 === void 0 ? {} : { workDefinitionFingerprint: workDefinitionFingerprint2 }
  };
  return node;
}
function readSession(value) {
  const restartReason = readOptionalString(value, "restartReason");
  const invalidatedAt = readOptionalString(value, "invalidatedAt");
  const session = {
    sessionId: asAgentSessionId(readString(value, "sessionId")),
    resumeToken: readString(value, "resumeToken"),
    tokenStatus: readResumeTokenStatus(value, "tokenStatus"),
    ...restartReason === void 0 ? {} : { restartReason },
    ...invalidatedAt === void 0 ? {} : { invalidatedAt }
  };
  return session;
}
function readNullableCursor(value, key) {
  const field = value[key];
  if (field === null) return null;
  return readCursor(readObject(value, key));
}
function readCursor(value) {
  return {
    nodeId: asNodeId(readString(value, "nodeId")),
    reason: readCursorReason(value, "reason"),
    updatedAt: readString(value, "updatedAt")
  };
}
function readDecisionRecord(value) {
  const payload = readObject(value, "payload");
  return makeDecisionRecord({
    artifact_id: readString(value, "artifact_id"),
    decision_id: asDecisionId(readString(payload, "decision_id")),
    request: readDecisionRequest(readObject(payload, "request")),
    verdict: readDecisionVerdict(readObject(payload, "verdict")),
    tier: readDecisionTier(payload, "tier"),
    rationale: readString(payload, "rationale"),
    created_at: readString(value, "created_at"),
    producer: readProducer(readObject(value, "producer")),
    source_refs: readArtifactReferences(value, "source_refs"),
    output_refs: readArtifactReferences(value, "output_refs")
  });
}
function readDecisionRequest(value) {
  const options = readOptionalStringArray(value, "options");
  const context = readOptionalObject(value, "context");
  const base = {
    decision_id: asDecisionId(readString(value, "decision_id")),
    node_id: asNodeId(readString(value, "node_id")),
    task_id: asTaskId(readString(value, "task_id")),
    prompt: readString(value, "prompt"),
    ...context === void 0 ? {} : { context }
  };
  const surface = readStringUnion(value, "surface", ["permission", "routing"]);
  if (surface === "permission") {
    return {
      ...base,
      surface,
      tool_name: readString(value, "tool_name"),
      arguments: readObject(value, "arguments")
    };
  }
  return {
    ...base,
    surface,
    ...options === void 0 ? {} : { options: [...options] }
  };
}
function readDecisionVerdict(value) {
  return {
    type: readStringUnion(value, "type", ["decision", "access", "human"]),
    suggested_choice: readNullableString(value, "suggested_choice"),
    suggested_response: readNullableString(value, "suggested_response"),
    confidence: readScore(value, "confidence"),
    risk: readScore(value, "risk"),
    block_trigger: readBoolean(value, "block_trigger")
  };
}
function readValidationReport(value) {
  const payload = readObject(value, "payload");
  return makeValidationReport({
    artifact_id: readString(value, "artifact_id"),
    report_ref: readString(payload, "report_ref"),
    task_id: asTaskId(readString(payload, "task_id")),
    node_id: asNodeId(readString(payload, "node_id")),
    scope: readValidationScope(payload, "scope"),
    status: readValidationStatus(payload, "status"),
    reasons: readStringArray(payload, "reasons"),
    evidence_strength: readValidationEvidenceStrength(payload, "evidence_strength"),
    evidence: readEvidence(readObject(payload, "evidence")),
    details: readObject(payload, "details"),
    created_at: readString(value, "created_at"),
    producer: readProducer(readObject(value, "producer")),
    source_refs: readArtifactReferences(value, "source_refs"),
    output_refs: readArtifactReferences(value, "output_refs")
  });
}
function readEvidence(value) {
  const touchReport = readObject(value, "touch_report");
  const reportRef = readOptionalString(value, "report_ref");
  const intendedFiles = readOptionalStringArray(value, "intended_files");
  const intendedInterfaces = readOptionalStringArray(value, "intended_interfaces");
  const intendedData = readOptionalStringArray(value, "intended_data");
  return makeExecutionEvidence({
    taskId: asTaskId(readString(touchReport, "task_id")),
    summary: readString(value, "summary"),
    producedArtifactRefs: readArtifactReferences(value, "produced_artifact_refs"),
    touchedFiles: readStringArray(touchReport, "touched_files"),
    touchedInterfaces: readStringArray(touchReport, "touched_interfaces"),
    touchedData: readStringArray(touchReport, "touched_data"),
    touchedWorkflowSteps: readStringArray(touchReport, "touched_workflow_steps"),
    ...intendedFiles === void 0 ? {} : { intendedFiles },
    ...intendedInterfaces === void 0 ? {} : { intendedInterfaces },
    ...intendedData === void 0 ? {} : { intendedData },
    ...reportRef === void 0 ? {} : { report_ref: reportRef }
  });
}
function readProducer(value) {
  const version = readOptionalString(value, "version");
  const invocationId = readOptionalString(value, "invocation_id");
  return {
    primitive: readStringUnion(value, "primitive", ["engine", "role", "loop", "adapter", "human"]),
    name: readString(value, "name"),
    ...version === void 0 ? {} : { version },
    ...invocationId === void 0 ? {} : { invocation_id: invocationId }
  };
}
function readArtifactReferences(source, key) {
  const value = source[key];
  if (!Array.isArray(value)) throw new Error(`Expected ${key} to be an artifact reference array`);
  return value.map(readArtifactReference);
}
function readArtifactReference(value) {
  const object = readObjectValue(value, "artifact reference");
  const artifactType = readOptionalString(object, "artifact_type");
  const schemaVersion = readOptionalString(object, "schema_version");
  const protocolVersion = readOptionalString(object, "protocol_version");
  const uri = readOptionalString(object, "uri");
  const relation = readOptionalArtifactRelation(object, "relation");
  return {
    ref_type: readStringUnion(object, "ref_type", [
      "artifact",
      "file",
      "task",
      "policy",
      "command",
      "config",
      "url",
      "external"
    ]),
    id: readString(object, "id"),
    ...artifactType === void 0 ? {} : { artifact_type: artifactType },
    ...schemaVersion === void 0 ? {} : { schema_version: schemaVersion },
    ...protocolVersion === void 0 ? {} : { protocol_version: protocolVersion },
    ...uri === void 0 ? {} : { uri },
    ...relation === void 0 ? {} : { relation }
  };
}
function readObject(source, key) {
  return readObjectValue(source[key], key);
}
function readOptionalObject(source, key) {
  const value = source[key];
  if (value === void 0) return void 0;
  return readObjectValue(value, key);
}
function readObjectValue(value, label) {
  if (isJsonObject(value)) return value;
  throw new Error(`Expected ${label} to be an object`);
}
function isJsonObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function readString(source, key) {
  const value = source[key];
  if (typeof value === "string") return value;
  throw new Error(`Expected ${key} to be a string`);
}
function readOptionalString(source, key) {
  const value = source[key];
  if (value === void 0) return void 0;
  if (typeof value === "string") return value;
  throw new Error(`Expected ${key} to be a string`);
}
function readNullableString(source, key) {
  const value = source[key];
  if (value === null || typeof value === "string") return value;
  throw new Error(`Expected ${key} to be a nullable string`);
}
function readBoolean(source, key) {
  const value = source[key];
  if (typeof value === "boolean") return value;
  throw new Error(`Expected ${key} to be a boolean`);
}
function readNonNegativeInteger(source, key) {
  const value = source[key];
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  throw new Error(`Expected ${key} to be a non-negative integer`);
}
function readScore(source, key) {
  const value = readNonNegativeInteger(source, key);
  if (value === 0 || value === 1 || value === 2 || value === 3 || value === 4 || value === 5 || value === 6 || value === 7 || value === 8 || value === 9 || value === 10) {
    return value;
  }
  throw new Error(`Expected ${key} to be a score from 0 to 10`);
}
function readDecisionTier(source, key) {
  const value = readNonNegativeInteger(source, key);
  if (value === 0 || value === 1 || value === 2 || value === 3) return value;
  throw new Error(`Expected ${key} to be a decision tier`);
}
function readNodeType(source, key) {
  return readStringUnion(source, key, ["leaf", "inner"]);
}
function readValidationScope(source, key) {
  return readStringUnion(source, key, ["leaf", "parent"]);
}
function readValidationStatus(source, key) {
  return readStringUnion(source, key, ["pass", "fail"]);
}
function readValidationEvidenceStrength(source, key) {
  return readStringUnion(source, key, ["command", "model_fallback"]);
}
function readNodeStatus(source, key) {
  return readStringUnion(source, key, [
    "pending",
    "running",
    "done",
    "needs-decision",
    "failed",
    "awaiting-human",
    "cancelled",
    "superseded"
  ]);
}
function readResumeTokenStatus(source, key) {
  return readStringUnion(source, key, ["resumable", "restart-required"]);
}
function readCursorReason(source, key) {
  return readStringUnion(source, key, [
    "scheduled",
    "running",
    "awaiting-decision",
    "recovering"
  ]);
}
function readStringUnion(source, key, allowed) {
  const value = readString(source, key);
  if (isOneOf(value, allowed)) return value;
  throw new Error(`Unexpected ${key}: ${value}`);
}
function readOptionalArtifactRelation(source, key) {
  const value = source[key];
  if (value === void 0) return void 0;
  if (value === "read" || value === "derived_from" || value === "validates" || value === "produces" || value === "supersedes" || value === "patches" || value === "blocks") {
    return value;
  }
  throw new Error(`Unexpected ${key}: ${String(value)}`);
}
function isOneOf(value, allowed) {
  return allowed.some((item) => item === value);
}
function readOptionalStringArray(source, key) {
  const value = source[key];
  if (value === void 0) return void 0;
  if (!Array.isArray(value)) throw new Error(`Expected ${key} to be a string array`);
  return value.map((item) => {
    if (typeof item !== "string") throw new Error(`Expected ${key} to be a string array`);
    return item;
  });
}
function readStringArray(source, key) {
  const value = readOptionalStringArray(source, key);
  if (value !== void 0) return value;
  throw new Error(`Expected ${key} to be a string array`);
}
function isNodeError(error) {
  return error instanceof Error && "code" in error;
}

// src/core/reconciliation.ts
var RETIRED_STATUSES = ["cancelled", "superseded"];
function reconcileCheckpoints(workSourceSnapshot, executionStoreSnapshot) {
  assertStableTaskIds(workSourceSnapshot.tasks);
  assertUniqueNodeIds(executionStoreSnapshot.nodes);
  const tasksById = /* @__PURE__ */ new Map();
  for (const task of workSourceSnapshot.tasks) {
    tasksById.set(task.id, task);
  }
  const activeNodesByTask = latestActiveNodesByTask(executionStoreSnapshot.nodes);
  const actions = [];
  for (const task of workSourceSnapshot.tasks) {
    const node = activeNodesByTask.get(task.id);
    if (node === void 0) {
      if (task.status !== "done") {
        actions.push(scheduleNode(task));
      }
      continue;
    }
    if (task.status === "done") {
      if (isInFlight(node)) {
        actions.push(interruptAndSupersede(node, "externally-done", void 0));
      } else if (node.status !== "done") {
        actions.push({
          type: "drop-from-queue",
          taskId: task.id,
          nodeId: node.id,
          workSourceRevision: task.revision,
          ...task.definitionFingerprint === void 0 ? {} : { workDefinitionFingerprint: task.definitionFingerprint },
          reason: "externally-done"
        });
      }
      continue;
    }
    if (task.revision === node.workSourceRevision) continue;
    if (task.definitionFingerprint !== void 0 && node.workDefinitionFingerprint !== void 0 && task.definitionFingerprint !== node.workDefinitionFingerprint) {
      if (isInFlight(node)) {
        actions.push(
          interruptAndSupersede(node, "definition-changed", {
            nodeId: replacementNodeId(task.id, task.revision),
            nodeType: task.type,
            workSourceRevision: task.revision,
            workDefinitionFingerprint: task.definitionFingerprint
          })
        );
      } else {
        actions.push({
          type: "mark-stale",
          taskId: task.id,
          nodeId: node.id,
          workSourceRevision: task.revision,
          workDefinitionFingerprint: task.definitionFingerprint,
          reason: "definition-changed"
        });
      }
      continue;
    }
    actions.push({
      type: "refresh-observed-revision",
      taskId: task.id,
      nodeId: node.id,
      workSourceRevision: task.revision,
      ...task.definitionFingerprint === void 0 ? {} : { workDefinitionFingerprint: task.definitionFingerprint },
      reason: "non-definition-change"
    });
  }
  for (const node of activeNodesByTask.values()) {
    if (tasksById.has(node.taskId)) continue;
    if (isInFlight(node)) {
      actions.push(interruptAndSupersede(node, "missing-from-work-source", void 0));
      continue;
    }
    actions.push({
      type: "cancel-node",
      taskId: node.taskId,
      nodeId: node.id,
      reason: "missing-from-work-source"
    });
  }
  return actions;
}
function workDefinitionFingerprint(task) {
  return stableStringify({
    acceptanceCriteria: [...task.acceptanceCriteria],
    dependencies: dependencyMetadata(task.metadata)
  });
}
function defaultNodeIdForTask(taskId) {
  return asNodeId(`node:${taskId}`);
}
function scheduleNode(task) {
  return {
    type: "schedule-node",
    taskId: task.id,
    nodeId: defaultNodeIdForTask(task.id),
    nodeType: task.type,
    ...task.parentTaskId === void 0 ? {} : { parentNodeId: defaultNodeIdForTask(task.parentTaskId) },
    workSourceRevision: task.revision,
    ...task.definitionFingerprint === void 0 ? {} : { workDefinitionFingerprint: task.definitionFingerprint }
  };
}
function interruptAndSupersede(node, reason, replacement) {
  if (node.sessionId === void 0) {
    throw new Error(`Cannot interrupt in-flight node without a session id: ${node.id}`);
  }
  return {
    type: "interrupt-and-supersede",
    taskId: node.taskId,
    nodeId: node.id,
    sessionId: node.sessionId,
    reason,
    ...replacement === void 0 ? {} : { replacement }
  };
}
function isInFlight(node) {
  return node.status === "running";
}
function latestActiveNodesByTask(nodes) {
  const byTask = /* @__PURE__ */ new Map();
  for (const node of nodes) {
    if (RETIRED_STATUSES.includes(node.status)) continue;
    if (!byTask.has(node.taskId)) byTask.set(node.taskId, node);
  }
  return byTask;
}
function assertStableTaskIds(tasks) {
  const seen = /* @__PURE__ */ new Set();
  for (const task of tasks) {
    if (task.id.length === 0) {
      throw new Error("WorkSource returned an empty task id; stable ids are required for reconciliation");
    }
    if (task.revision.length === 0) {
      throw new Error(`WorkSource task ${task.id} has an empty revision; etags are required for reconciliation`);
    }
    if (seen.has(task.id)) {
      throw new Error(`WorkSource returned duplicate task id ${task.id}; stable unique ids are required`);
    }
    seen.add(task.id);
  }
}
function assertUniqueNodeIds(nodes) {
  const seen = /* @__PURE__ */ new Set();
  for (const node of nodes) {
    if (seen.has(node.id)) {
      throw new Error(`ExecutionStore returned duplicate node id ${node.id}`);
    }
    seen.add(node.id);
  }
}
function replacementNodeId(taskId, revision) {
  return asNodeId(`node:${taskId}:reconciled:${safeRevisionSegment(revision)}`);
}
function safeRevisionSegment(revision) {
  const segment = revision.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
  return segment.length === 0 ? "revision" : segment;
}
function dependencyMetadata(metadata) {
  if (metadata === void 0) return null;
  return {
    blockedBy: metadata.blockedBy ?? null,
    blocked_by: metadata.blocked_by ?? null,
    dependencies: metadata.dependencies ?? null,
    dependsOn: metadata.dependsOn ?? null,
    depends_on: metadata.depends_on ?? null
  };
}
function stableStringify(value) {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(",")}}`;
}

// src/core/ports/work-source.ts
var WORK_STATUSES = ["todo", "active", "done", "blocked"];
function isWorkStatus(value) {
  return WORK_STATUSES.some((status) => status === value);
}
function assertWorkStatus(value) {
  if (!isWorkStatus(value)) {
    throw new Error(
      `Unsupported WorkSource status "${value}". Expected one of: ${WORK_STATUSES.join(", ")}`
    );
  }
}

// src/adapters/claude-sdk-agent-transport.ts
import { randomUUID } from "node:crypto";
import { query as claudeQuery } from "@anthropic-ai/claude-agent-sdk";
var DEFAULT_STALL_AFTER_MS = 12e4;
var DEFAULT_INTERRUPT_TIMEOUT_MS = 1e4;
var ClaudeSdkAgentTransport = class {
  sdk;
  sdkOptions;
  defaultStallAfterMs;
  interruptTimeoutMs;
  permissionRequestMode;
  sessions = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    this.sdk = options.sdk ?? { query: claudeQuery };
    this.sdkOptions = options.sdkOptions ?? {};
    this.defaultStallAfterMs = options.stallAfterMs ?? DEFAULT_STALL_AFTER_MS;
    this.interruptTimeoutMs = options.interruptTimeoutMs ?? DEFAULT_INTERRUPT_TIMEOUT_MS;
    this.permissionRequestMode = options.permissionRequestMode ?? "canUseTool";
  }
  async spawnSession(request) {
    const sessionId = request.resumeFromSessionId ?? asAgentSessionId(randomUUID());
    const session = { id: sessionId, nodeId: request.nodeId };
    const abortController = new AbortController();
    const state = {
      session,
      taskId: request.metadata?.taskId === void 0 ? "unknown-task" : String(request.metadata.taskId),
      abortController,
      query: void 0,
      events: [],
      waiters: [],
      stallAfterMs: this.defaultStallAfterMs,
      lastProgressAtMs: Date.now(),
      terminal: false,
      interrupting: false,
      correlationSequence: 0,
      pending: void 0,
      stalledTimer: void 0,
      interruptTimer: void 0
    };
    this.sessions.set(sessionId, state);
    const options = this.buildOptions(request, sessionId, abortController);
    state.query = this.sdk.query({ prompt: request.prompt, options });
    this.armStalledTimer(state);
    this.pumpMessages(state);
    return session;
  }
  async readEvent(sessionId, options) {
    const state = this.requireSession(sessionId);
    if (options?.stallAfterMs !== void 0) {
      state.stallAfterMs = options.stallAfterMs;
      this.armStalledTimer(state);
    }
    const event = state.events.shift();
    if (event !== void 0) return event;
    return new Promise((resolve2) => state.waiters.push(resolve2));
  }
  async sendCommand(sessionId, command) {
    const state = this.requireSession(sessionId);
    const pending = state.pending;
    if (pending === void 0) {
      throw new AgentCommandRejectedError(
        "No pending correlated event",
        command.correlationId,
        command.type
      );
    }
    if (pending.correlationId !== command.correlationId) {
      throw new AgentCommandRejectedError(
        `Pending correlation is ${pending.correlationId}`,
        command.correlationId,
        command.type
      );
    }
    if (!pending.acceptedCommands.includes(command.type)) {
      throw new AgentCommandRejectedError(
        `${command.type} cannot answer ${pending.eventType}`,
        command.correlationId,
        command.type
      );
    }
    if (pending.eventType === "needs_permission") {
      this.resolvePermission(state, pending, command);
      return;
    }
    if (pending.eventType === "needs_input") {
      this.resolveInput(state, pending, command);
      return;
    }
    await this.resolveStalled(state, command);
  }
  async interruptSession(sessionId, reason) {
    const state = this.requireSession(sessionId);
    state.pending = void 0;
    this.clearStalledTimer(state);
    state.interrupting = true;
    const query = this.requireQuery(state);
    await query.interrupt();
    state.abortController.abort(reason);
    this.clearInterruptTimer(state);
    state.interruptTimer = setTimeout(() => {
      if (state.terminal) return;
      query.close();
      this.enqueueExit(state, "interrupt_timeout", "Agent ignored interrupt before timeout");
    }, this.interruptTimeoutMs);
    unrefTimer(state.interruptTimer);
    return {
      workProduct: makeExecutionEvidence({
        taskId: asTaskId(state.taskId),
        summary: `Interrupted worker session ${sessionId} before a terminal result.`,
        producedArtifactRefs: [makeArtifactReference(`agent-session:${sessionId}`)]
      })
    };
  }
  async disposeSession(sessionId) {
    const state = this.sessions.get(sessionId);
    if (state === void 0) return;
    this.clearStalledTimer(state);
    this.clearInterruptTimer(state);
    state.pending = void 0;
    state.terminal = true;
    state.query?.close();
    state.abortController.abort("Daimyo disposed worker session");
    this.sessions.delete(sessionId);
  }
  buildOptions(request, sessionId, abortController) {
    const base = {
      ...this.sdkOptions,
      abortController,
      cwd: request.cwd,
      ...request.resumeFromSessionId === void 0 ? { sessionId } : { resume: request.resumeFromSessionId },
      env: { ...process.env, ...this.sdkOptions.env },
      includePartialMessages: true,
      onElicitation: this.makeOnElicitation(sessionId)
    };
    if (this.permissionRequestMode === "canUseTool") {
      base.canUseTool = this.makeCanUseTool(sessionId);
    }
    if (this.permissionRequestMode === "preToolUse") {
      base.hooks = this.withPreToolUseHook(sessionId, this.sdkOptions.hooks);
    }
    return base;
  }
  makeCanUseTool(sessionId) {
    return async (toolName, input, options) => {
      return await this.requestPermission(
        sessionId,
        toolName,
        input,
        options.signal,
        permissionPrompt(options.title, options.decisionReason),
        toolOrigin(options.toolUseID, options.agentID, options.blockedPath)
      );
    };
  }
  withPreToolUseHook(sessionId, hooks) {
    const preToolUseHook = {
      hooks: [
        async (input, toolUseId, options) => {
          if (input.hook_event_name !== "PreToolUse") return { continue: true };
          const result = await this.requestPreToolUsePermission(
            sessionId,
            input,
            toolUseId,
            options.signal
          );
          return result;
        }
      ]
    };
    return {
      ...hooks,
      PreToolUse: [preToolUseHook, ...hooks?.PreToolUse ?? []]
    };
  }
  async requestPreToolUsePermission(sessionId, input, toolUseId, signal) {
    const result = await this.requestPermission(
      sessionId,
      input.tool_name,
      recordFromUnknown(input.tool_input),
      signal,
      void 0,
      toolOrigin(toolUseId, input.agent_id, void 0)
    );
    const allowed = result.behavior === "allow";
    return {
      continue: allowed,
      ...allowed ? {} : { reason: result.message },
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: allowed ? "allow" : "deny",
        ...allowed ? {} : { permissionDecisionReason: result.message }
      }
    };
  }
  makeOnElicitation(sessionId) {
    return async (request, options) => {
      return await this.requestInput(sessionId, request, options.signal);
    };
  }
  async requestPermission(sessionId, toolName, input, signal, prompt, origin) {
    const state = this.requireSession(sessionId);
    if (state.pending !== void 0) {
      return { behavior: "deny", message: "Another transport event is pending", interrupt: false };
    }
    const correlationId = this.nextCorrelation(state, "permission");
    const event = {
      type: "needs_permission",
      sessionId,
      correlationId,
      toolName,
      arguments: jsonObjectFromRecord(input),
      ...prompt === void 0 ? {} : { prompt },
      origin
    };
    return await new Promise((resolve2) => {
      state.pending = {
        eventType: "needs_permission",
        correlationId,
        acceptedCommands: ["approve", "deny"],
        resolve: resolve2
      };
      signal.addEventListener(
        "abort",
        () => {
          if (state.pending?.correlationId === correlationId) {
            state.pending = void 0;
            resolve2({ behavior: "deny", message: "Permission request aborted", interrupt: true });
          }
        },
        { once: true }
      );
      this.enqueue(state, event);
    });
  }
  async requestInput(sessionId, request, signal) {
    const state = this.requireSession(sessionId);
    if (state.pending !== void 0) {
      return { action: "decline" };
    }
    const correlationId = this.nextCorrelation(state, "input");
    const options = inputOptions(request.requestedSchema);
    const event = {
      type: "needs_input",
      sessionId,
      correlationId,
      prompt: request.title ?? request.message,
      ...options.length === 0 ? {} : { options }
    };
    return await new Promise((resolve2) => {
      state.pending = {
        eventType: "needs_input",
        correlationId,
        acceptedCommands: options.length === 0 ? ["respond"] : ["respond", "choose_option"],
        resolve: resolve2
      };
      signal.addEventListener(
        "abort",
        () => {
          if (state.pending?.correlationId === correlationId) {
            state.pending = void 0;
            resolve2({ action: "cancel" });
          }
        },
        { once: true }
      );
      this.enqueue(state, event);
    });
  }
  resolvePermission(state, pending, command) {
    state.pending = void 0;
    this.markProgress(state);
    if (command.type === "approve") {
      pending.resolve({ behavior: "allow" });
      return;
    }
    if (command.type === "deny") {
      pending.resolve({ behavior: "deny", message: command.reason });
    }
  }
  resolveInput(state, pending, command) {
    state.pending = void 0;
    this.markProgress(state);
    if (command.type === "respond") {
      pending.resolve({ action: "accept", content: { response: command.response } });
      return;
    }
    if (command.type === "choose_option") {
      pending.resolve({ action: "accept", content: { choice: command.option } });
    }
  }
  async resolveStalled(state, command) {
    state.pending = void 0;
    if (command.type === "resume") {
      this.markProgress(state);
      return;
    }
    if (command.type !== "interrupt") return;
    this.clearStalledTimer(state);
    state.interrupting = true;
    const query = this.requireQuery(state);
    await query.interrupt();
    state.abortController.abort(command.reason);
    this.clearInterruptTimer(state);
    state.interruptTimer = setTimeout(() => {
      if (state.terminal) return;
      query.close();
      this.enqueueExit(state, "interrupt_timeout", "Agent ignored interrupt before timeout");
    }, this.interruptTimeoutMs);
    unrefTimer(state.interruptTimer);
  }
  pumpMessages(state) {
    void (async () => {
      try {
        for await (const message of this.requireQuery(state)) {
          this.handleSdkMessage(state, message);
        }
        if (state.terminal) return;
        this.enqueueExit(
          state,
          state.interrupting ? "interrupted" : "completed",
          "SDK session stream ended"
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!state.terminal) this.enqueueExit(state, "errored", message);
      }
    })();
  }
  handleSdkMessage(state, message) {
    if (message.type === "result") {
      this.enqueue(state, {
        type: "turn_ended",
        sessionId: state.session.id,
        result: message.subtype === "success" ? message.result : message.subtype,
        stopReason: message.stop_reason,
        costUsd: message.total_cost_usd
      });
      return;
    }
    const logMessage = sdkMessageToLog(message);
    if (logMessage !== null) {
      this.enqueue(state, {
        type: "log",
        sessionId: state.session.id,
        message: logMessage.message,
        source: logMessage.source
      });
    }
  }
  enqueue(state, event) {
    if (event.type === "log" && state.pending?.eventType === "stalled") {
      state.pending = void 0;
    }
    if (event.type === "turn_ended") {
      state.pending = void 0;
      this.clearInterruptTimer(state);
    }
    if (event.type === "exited") {
      state.pending = void 0;
      state.terminal = true;
      this.clearInterruptTimer(state);
    }
    if (event.type !== "stalled") this.markProgress(state);
    const waiter = state.waiters.shift();
    if (waiter !== void 0) {
      waiter(event);
      return;
    }
    state.events.push(event);
  }
  enqueueExit(state, reason, message) {
    state.pending = void 0;
    this.clearStalledTimer(state);
    this.enqueue(state, {
      type: "exited",
      sessionId: state.session.id,
      exitCode: null,
      reason,
      message
    });
  }
  markProgress(state) {
    state.lastProgressAtMs = Date.now();
    if (!state.terminal && state.pending === void 0) this.armStalledTimer(state);
  }
  armStalledTimer(state) {
    this.clearStalledTimer(state);
    if (state.terminal || state.pending !== void 0) return;
    state.stalledTimer = setTimeout(() => {
      if (state.terminal || state.pending !== void 0) return;
      const correlationId = this.nextCorrelation(state, "stalled");
      state.pending = {
        eventType: "stalled",
        correlationId,
        acceptedCommands: ["interrupt", "resume"]
      };
      this.enqueue(state, {
        type: "stalled",
        sessionId: state.session.id,
        correlationId,
        elapsedMs: Date.now() - state.lastProgressAtMs,
        lastProgressAt: new Date(state.lastProgressAtMs).toISOString(),
        reason: `No progress observed for ${state.stallAfterMs}ms`
      });
    }, state.stallAfterMs);
    unrefTimer(state.stalledTimer);
  }
  clearStalledTimer(state) {
    if (state.stalledTimer !== void 0) clearTimeout(state.stalledTimer);
    state.stalledTimer = void 0;
  }
  clearInterruptTimer(state) {
    if (state.interruptTimer !== void 0) clearTimeout(state.interruptTimer);
    state.interruptTimer = void 0;
  }
  nextCorrelation(state, prefix) {
    state.correlationSequence += 1;
    return asTransportCorrelationId(`${state.session.id}:${prefix}:${state.correlationSequence}`);
  }
  requireSession(sessionId) {
    const state = this.sessions.get(sessionId);
    if (state === void 0) throw new Error(`Unknown agent session: ${sessionId}`);
    return state;
  }
  requireQuery(state) {
    if (state.query === void 0) {
      throw new Error(`Agent session is not initialized: ${state.session.id}`);
    }
    return state.query;
  }
};
function sdkMessageToLog(message) {
  if (message.type === "assistant") {
    const text = assistantText(message.message.content);
    return text.length === 0 ? null : { message: text, source: "assistant" };
  }
  if (message.type === "stream_event") {
    const text = streamText(message.event);
    return text.length === 0 ? null : { message: text, source: "assistant" };
  }
  if (message.type === "tool_progress") {
    return {
      message: `${message.tool_name} running for ${message.elapsed_time_seconds}s`,
      source: "tool"
    };
  }
  if (message.type !== "system") return null;
  if (message.subtype === "local_command_output") {
    return { message: message.content, source: "tool" };
  }
  if (message.subtype === "hook_progress") {
    return { message: message.output, source: "tool" };
  }
  if (message.subtype === "task_progress") {
    return { message: message.summary ?? message.description, source: "tool" };
  }
  if (message.subtype === "task_started") {
    return { message: message.description, source: "tool" };
  }
  if (message.subtype === "task_updated") {
    return { message: `task ${message.task_id} updated`, source: "tool" };
  }
  if (message.subtype === "permission_denied") {
    return { message: message.message, source: "system" };
  }
  if (message.subtype === "notification") {
    return { message: message.key, source: "system" };
  }
  if (message.subtype === "status") {
    return message.status === null ? null : { message: message.status, source: "system" };
  }
  if (message.subtype === "api_retry") {
    return { message: `API retry ${message.attempt}/${message.max_retries}`, source: "system" };
  }
  return null;
}
function assistantText(content) {
  if (typeof content === "string") return content;
  const parts = [];
  for (const block of content) {
    if (block.type === "text") parts.push(block.text);
    if (block.type === "tool_use") parts.push(`tool_use:${block.name}`);
  }
  return parts.join("\n");
}
function streamText(event) {
  if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
    return event.delta.text;
  }
  return "";
}
function jsonObjectFromRecord(record) {
  const result = {};
  for (const [key, value] of Object.entries(record)) {
    result[key] = jsonValueFromUnknown(value);
  }
  return result;
}
function recordFromUnknown(value) {
  if (isPlainRecord(value)) return value;
  return { value };
}
function jsonValueFromUnknown(value) {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) return value.map((entry) => jsonValueFromUnknown(entry));
  if (isPlainRecord(value)) return jsonObjectFromRecord(value);
  return String(value);
}
function isPlainRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function permissionPrompt(title, decisionReason) {
  return title ?? decisionReason;
}
function toolOrigin(toolUseId, agentId, blockedPath) {
  return jsonObjectFromRecord({
    ...toolUseId === void 0 ? {} : { toolUseId },
    ...agentId === void 0 ? {} : { agentId },
    ...blockedPath === void 0 ? {} : { blockedPath }
  });
}
function inputOptions(schema) {
  if (schema === void 0) return [];
  const properties = schema.properties;
  if (!isPlainRecord(properties)) return [];
  for (const property of Object.values(properties)) {
    if (!isPlainRecord(property)) continue;
    const enumValues = property.enum;
    if (Array.isArray(enumValues) && enumValues.every((value) => typeof value === "string")) {
      return enumValues;
    }
  }
  return [];
}
function unrefTimer(timer) {
  if (typeof timer === "object" && timer !== null && "unref" in timer) {
    const candidate = timer.unref;
    if (typeof candidate === "function") candidate.call(timer);
  }
}

// src/adapters/json-work-source.ts
import { mkdir as mkdir2, readFile as readFile2, writeFile } from "node:fs/promises";
import { createHash as createHash2 } from "node:crypto";
import { dirname } from "node:path";
var jsonWorkSourceStatusMapping = {
  fromNative(status) {
    assertWorkStatus(status);
    return status;
  },
  toNative(status) {
    assertWorkStatus(status);
    return status;
  }
};
var JsonWorkSource = class {
  filePath;
  constructor(options) {
    this.filePath = options.filePath;
  }
  async listTasks() {
    const store = await this.readStore();
    return store.tasks.map((task) => {
      const summary = {
        id: asTaskId(task.id),
        title: task.title,
        status: jsonWorkSourceStatusMapping.fromNative(task.status),
        revision: task.revision,
        ...task.parentId === void 0 ? {} : { parentId: asTaskId(task.parentId) }
      };
      return summary;
    });
  }
  async getTask(id) {
    const store = await this.readStore();
    return toWorkTask(findTask(store, id));
  }
  async markStatus(id, status, evidence) {
    assertWorkStatus(status);
    const store = await this.readStore();
    const task = findTask(store, id);
    const updatedTask = withRevision({
      ...task,
      status: jsonWorkSourceStatusMapping.toNative(status),
      evidence: [...task.evidence, evidence]
    });
    const updatedStore = {
      version: 1,
      tasks: store.tasks.map((candidate) => candidate.id === task.id ? updatedTask : candidate)
    };
    await this.writeStore(updatedStore);
    return toWorkTask(updatedTask);
  }
  async patchTask(id, patch, evidence) {
    const store = await this.readStore();
    const task = findTask(store, id);
    const updatedTask = withRevision({
      ...task,
      body: patch.body ?? task.body,
      acceptanceCriteria: patch.acceptanceCriteria ?? task.acceptanceCriteria,
      evidence: [...task.evidence, evidence],
      ...patch.metadata === void 0 ? task.metadata === void 0 ? {} : { metadata: task.metadata } : { metadata: patch.metadata }
    });
    await this.writeStore({
      version: 1,
      tasks: store.tasks.map((candidate) => candidate.id === task.id ? updatedTask : candidate)
    });
    return toWorkTask(updatedTask);
  }
  async createTask(input, parentId) {
    const store = await this.readStore();
    const id = nextJsonTaskId(input, store.tasks);
    const task = withRevision({
      id,
      title: input.title,
      body: input.body,
      acceptanceCriteria: input.acceptanceCriteria ?? [],
      status: "todo",
      evidence: [],
      revision: "",
      ...input.metadata === void 0 ? {} : { metadata: input.metadata },
      ...parentId === void 0 ? {} : { parentId }
    });
    await this.writeStore({
      version: 1,
      tasks: [...store.tasks, task]
    });
    return asTaskId(id);
  }
  async readStore() {
    const content = await readTextFileIfPresent(this.filePath);
    if (content.trim().length === 0) return { version: 1, tasks: [] };
    const parsed = JSON.parse(content);
    if (!isJsonWorkSourceStore(parsed)) {
      throw new Error(`Invalid JSON WorkSource file: ${this.filePath}`);
    }
    return parsed;
  }
  async writeStore(store) {
    await mkdir2(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(store, null, 2)}
`, "utf8");
  }
};
function toWorkTask(task) {
  return {
    id: asTaskId(task.id),
    title: task.title,
    status: jsonWorkSourceStatusMapping.fromNative(task.status),
    revision: task.revision,
    body: task.body,
    acceptanceCriteria: task.acceptanceCriteria,
    ...task.metadata === void 0 ? {} : { metadata: task.metadata },
    ...task.parentId === void 0 ? {} : { parentId: asTaskId(task.parentId) }
  };
}
function findTask(store, id) {
  const task = store.tasks.find((candidate) => candidate.id === id);
  if (task === void 0) throw new Error(`JSON task not found: ${id}`);
  return task;
}
function nextJsonTaskId(input, tasks) {
  const existingIds = new Set(tasks.map((task) => task.id));
  const base = `json-${hash(`${input.title}
${input.body}`).slice(0, 16)}`;
  if (!existingIds.has(base)) return base;
  for (let index = 2; index < Number.MAX_SAFE_INTEGER; index += 1) {
    const candidate = `${base}-${index}`;
    if (!existingIds.has(candidate)) return candidate;
  }
  throw new Error("Unable to allocate JSON task id");
}
function withRevision(task) {
  const revisionInput = {
    id: task.id,
    title: task.title,
    body: task.body,
    acceptanceCriteria: task.acceptanceCriteria,
    status: task.status,
    parentId: task.parentId ?? null,
    metadata: task.metadata ?? null,
    evidence: task.evidence
  };
  return {
    ...task,
    revision: `sha256:${hash(JSON.stringify(revisionInput))}`
  };
}
function hash(content) {
  return createHash2("sha256").update(content).digest("hex");
}
async function readTextFileIfPresent(filePath) {
  try {
    return await readFile2(filePath, "utf8");
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) return "";
    throw error;
  }
}
function isJsonWorkSourceStore(value) {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.tasks)) return false;
  return value.tasks.every(isJsonWorkTaskRecord);
}
function isJsonWorkTaskRecord(value) {
  if (!isRecord(value)) return false;
  return typeof value.id === "string" && value.id.length > 0 && typeof value.title === "string" && typeof value.body === "string" && Array.isArray(value.acceptanceCriteria) && value.acceptanceCriteria.every((item) => typeof item === "string") && isWorkStatusValue(value.status) && typeof value.revision === "string" && optionalString(value.parentId) && optionalJsonObject(value.metadata) && Array.isArray(value.evidence) && value.evidence.every(isExecutionEvidence);
}
function isWorkStatusValue(value) {
  return typeof value === "string" && isWorkStatus(value);
}
function optionalString(value) {
  return value === void 0 || typeof value === "string";
}
function optionalStringArray(value) {
  return value === void 0 || Array.isArray(value) && value.every((item) => typeof item === "string");
}
function isExecutionEvidence(value) {
  if (!isRecord(value) || typeof value.summary !== "string") return false;
  return isTouchReport(value.touch_report) && Array.isArray(value.produced_artifact_refs) && value.produced_artifact_refs.every(isArtifactReference) && optionalStringArray(value.intended_files) && optionalStringArray(value.intended_interfaces) && optionalStringArray(value.intended_data) && optionalString(value.report_ref);
}
function isTouchReport(value) {
  return isRecord(value) && typeof value.task_id === "string" && value.report_type === "touch_report" && Array.isArray(value.touched_files) && value.touched_files.every((item) => typeof item === "string") && Array.isArray(value.touched_interfaces) && value.touched_interfaces.every((item) => typeof item === "string") && Array.isArray(value.touched_data) && value.touched_data.every((item) => typeof item === "string") && Array.isArray(value.touched_workflow_steps) && value.touched_workflow_steps.every((item) => typeof item === "string");
}
function isArtifactReference(value) {
  return isRecord(value) && typeof value.ref_type === "string" && typeof value.id === "string";
}
function optionalJsonObject(value) {
  return value === void 0 || isJsonObject2(value);
}
function isJsonObject2(value) {
  if (!isRecord(value)) return false;
  return Object.values(value).every(isJsonValue);
}
function isJsonValue(value) {
  if (value === null) return true;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isJsonObject2(value);
}
function isNodeErrorCode(error, code) {
  return isRecord(error) && error.code === code;
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/adapters/markdown-checklist-work-source.ts
import { mkdir as mkdir3, readFile as readFile3, writeFile as writeFile2 } from "node:fs/promises";
import { createHash as createHash3 } from "node:crypto";
import { dirname as dirname2 } from "node:path";
var MARKDOWN_CHECKLIST_ID_SCHEME = "markdown-checklist:v1: id = md-<sha256(normalized visible item text)[0..16]>-<duplicate occurrence>. The id is stable while the visible checklist text is unchanged; editing that text intentionally produces a new id. Duplicate items are disambiguated by their occurrence among identical normalized texts.";
var markdownChecklistStatusMapping = {
  fromNative(status) {
    switch (status) {
      case "unchecked":
        return "todo";
      case "checked":
        return "done";
      case "active":
        return "active";
      case "blocked":
        return "blocked";
    }
  },
  toNative(status) {
    assertWorkStatus(status);
    switch (status) {
      case "todo":
        return "unchecked";
      case "done":
        return "checked";
      case "active":
        return "active";
      case "blocked":
        return "blocked";
    }
  }
};
var CHECKLIST_PATTERN = /^(\s*)- \[([ xX])\] (.*)$/;
var METADATA_PATTERN = /^(\s*)<!-- daimyo-work-source: ([A-Za-z0-9_-]+) -->\s*$/;
var MarkdownChecklistWorkSource = class {
  filePath;
  constructor(options) {
    this.filePath = options.filePath;
  }
  async listTasks() {
    const parsed = await this.readChecklist();
    return parsed.entries.map((entry) => {
      const task = {
        id: entry.id,
        title: entry.title,
        status: statusForEntry(entry),
        revision: parsed.contentRevision,
        ...entry.metadata?.parentId === void 0 ? {} : { parentId: asTaskId(entry.metadata.parentId) }
      };
      return task;
    });
  }
  async getTask(id) {
    const parsed = await this.readChecklist();
    const entry = findEntry(parsed, id);
    const task = {
      id: entry.id,
      title: entry.title,
      status: statusForEntry(entry),
      revision: parsed.contentRevision,
      body: entry.metadata?.body ?? entry.title,
      acceptanceCriteria: entry.metadata?.acceptanceCriteria ?? [],
      ...entry.metadata?.taskMetadata === void 0 ? {} : { metadata: entry.metadata.taskMetadata },
      ...entry.metadata?.parentId === void 0 ? {} : { parentId: asTaskId(entry.metadata.parentId) }
    };
    return task;
  }
  async markStatus(id, status, evidence) {
    assertWorkStatus(status);
    const parsed = await this.readChecklist();
    const entry = findEntry(parsed, id);
    const nativeStatus = markdownChecklistStatusMapping.toNative(status);
    const nextMetadata = withEvidenceAndStatus(entry.metadata, nativeStatus, evidence);
    const nextLines = [...parsed.lines];
    nextLines[entry.lineIndex] = `${entry.indent}- [${nativeStatus === "checked" ? "x" : " "}] ${entry.title}`;
    replaceMetadataLine(nextLines, entry, nextMetadata);
    await this.writeChecklist(nextLines.join("\n"));
    return this.getTask(id);
  }
  async patchTask(id, patch, evidence) {
    const parsed = await this.readChecklist();
    const entry = findEntry(parsed, id);
    const nextMetadata = {
      ...metadataWithoutStatus(entry.metadata),
      evidence,
      body: patch.body ?? entry.metadata?.body ?? entry.title,
      acceptanceCriteria: patch.acceptanceCriteria ?? entry.metadata?.acceptanceCriteria ?? [],
      ...patch.metadata === void 0 ? entry.metadata?.taskMetadata === void 0 ? {} : { taskMetadata: entry.metadata.taskMetadata } : { taskMetadata: patch.metadata },
      ...entry.metadata?.status === void 0 ? {} : { status: entry.metadata.status },
      ...entry.metadata?.parentId === void 0 ? {} : { parentId: entry.metadata.parentId }
    };
    const nextLines = [...parsed.lines];
    replaceMetadataLine(nextLines, entry, nextMetadata);
    await this.writeChecklist(nextLines.join("\n"));
    return this.getTask(id);
  }
  async createTask(input, parentId) {
    const parsed = await this.readChecklist();
    const normalizedTitle = normalizeTitle(input.title);
    const existingOccurrences = parsed.entries.filter(
      (entry) => normalizeTitle(entry.title) === normalizedTitle
    ).length;
    const createdId = idForTitle(normalizedTitle, existingOccurrences + 1);
    const metadata = {
      body: input.body,
      acceptanceCriteria: input.acceptanceCriteria ?? [],
      ...input.metadata === void 0 ? {} : { taskMetadata: input.metadata },
      ...parentId === void 0 ? {} : { parentId }
    };
    const line = `- [ ] ${input.title}`;
    const nextContent = appendMarkdownTask(parsed.content, line, buildMetadataLine("  ", metadata));
    await this.writeChecklist(nextContent);
    return createdId;
  }
  async readChecklist() {
    const content = await readTextFileIfPresent2(this.filePath);
    const lines = content.length === 0 ? [] : content.split("\n");
    const entries = parseEntries(lines);
    return {
      content,
      contentRevision: contentHash(content),
      lines,
      entries
    };
  }
  async writeChecklist(content) {
    await mkdir3(dirname2(this.filePath), { recursive: true });
    await writeFile2(this.filePath, content, "utf8");
  }
};
function parseEntries(lines) {
  const entries = [];
  const duplicateCounts = /* @__PURE__ */ new Map();
  lines.forEach((line, lineIndex) => {
    const match = CHECKLIST_PATTERN.exec(line);
    if (match === null) return;
    const indent = requireMatchGroup(match, 1);
    const marker = requireMatchGroup(match, 2);
    const title = requireMatchGroup(match, 3).trim();
    const normalizedTitle = normalizeTitle(title);
    const occurrence = (duplicateCounts.get(normalizedTitle) ?? 0) + 1;
    duplicateCounts.set(normalizedTitle, occurrence);
    entries.push({
      id: idForTitle(normalizedTitle, occurrence),
      lineIndex,
      indent,
      checked: marker.toLowerCase() === "x",
      title,
      ...metadataForNextLine(lines, lineIndex)
    });
  });
  return entries;
}
function statusForEntry(entry) {
  if (entry.checked) return markdownChecklistStatusMapping.fromNative("checked");
  if (entry.metadata?.status === "active") return markdownChecklistStatusMapping.fromNative("active");
  if (entry.metadata?.status === "blocked") return markdownChecklistStatusMapping.fromNative("blocked");
  return markdownChecklistStatusMapping.fromNative("unchecked");
}
function withEvidenceAndStatus(existing, nativeStatus, evidence) {
  return {
    ...metadataWithoutStatus(existing),
    evidence,
    ...nativeStatus === "active" || nativeStatus === "blocked" ? { status: nativeStatus } : {}
  };
}
function metadataWithoutStatus(metadata) {
  if (metadata === void 0) return {};
  return {
    ...metadata.evidence === void 0 ? {} : { evidence: metadata.evidence },
    ...metadata.body === void 0 ? {} : { body: metadata.body },
    ...metadata.acceptanceCriteria === void 0 ? {} : { acceptanceCriteria: metadata.acceptanceCriteria },
    ...metadata.taskMetadata === void 0 ? {} : { taskMetadata: metadata.taskMetadata },
    ...metadata.parentId === void 0 ? {} : { parentId: metadata.parentId }
  };
}
function replaceMetadataLine(lines, entry, metadata) {
  const metadataIndex = entry.lineIndex + 1;
  const metadataLine = buildMetadataLine(`${entry.indent}  `, metadata);
  if (isMetadataLine(lines[metadataIndex])) {
    lines[metadataIndex] = metadataLine;
    return;
  }
  lines.splice(metadataIndex, 0, metadataLine);
}
function metadataForNextLine(lines, lineIndex) {
  const metadataLine = lines[lineIndex + 1];
  if (metadataLine === void 0) return {};
  const match = METADATA_PATTERN.exec(metadataLine);
  if (match === null) return {};
  const metadata = decodeMetadata(requireMatchGroup(match, 2));
  return metadata === void 0 ? {} : { metadata };
}
function buildMetadataLine(indent, metadata) {
  return `${indent}<!-- daimyo-work-source: ${encodeMetadata(metadata)} -->`;
}
function encodeMetadata(metadata) {
  return Buffer.from(JSON.stringify(metadata), "utf8").toString("base64url");
}
function decodeMetadata(encoded) {
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!isMarkdownTaskMetadata(parsed)) return void 0;
    return parsed;
  } catch (_error) {
    return void 0;
  }
}
function isMarkdownTaskMetadata(value) {
  if (!isRecord2(value)) return false;
  return optionalStatus(value.status) && optionalEvidence(value.evidence) && optionalString2(value.body) && optionalStringArray2(value.acceptanceCriteria) && optionalJsonObject2(value.taskMetadata) && optionalString2(value.parentId);
}
function appendMarkdownTask(content, taskLine, metadataLine) {
  const prefix = content.length === 0 ? "" : content.endsWith("\n") ? content : `${content}
`;
  return `${prefix}${taskLine}
${metadataLine}
`;
}
function findEntry(parsed, id) {
  const entry = parsed.entries.find((candidate) => candidate.id === id);
  if (entry === void 0) throw new Error(`Markdown checklist task not found: ${id}`);
  return entry;
}
function idForTitle(normalizedTitle, occurrence) {
  return asTaskId(`md-${hash2(normalizedTitle).slice(0, 16)}-${occurrence}`);
}
function normalizeTitle(title) {
  return title.trim().replace(/\s+/g, " ");
}
function contentHash(content) {
  return `sha256:${hash2(content)}`;
}
function hash2(content) {
  return createHash3("sha256").update(content).digest("hex");
}
async function readTextFileIfPresent2(filePath) {
  try {
    return await readFile3(filePath, "utf8");
  } catch (error) {
    if (isNodeErrorCode2(error, "ENOENT")) return "";
    throw error;
  }
}
function isMetadataLine(line) {
  return line !== void 0 && METADATA_PATTERN.test(line);
}
function isNodeErrorCode2(error, code) {
  return isRecord2(error) && error.code === code;
}
function requireMatchGroup(match, index) {
  const value = match[index];
  if (value === void 0) throw new Error(`Expected markdown regex match group ${index}`);
  return value;
}
function optionalStatus(value) {
  return value === void 0 || value === "active" || value === "blocked";
}
function optionalEvidence(value) {
  return value === void 0 || isExecutionEvidence2(value);
}
function isExecutionEvidence2(value) {
  if (!isRecord2(value) || typeof value.summary !== "string") return false;
  return isTouchReport2(value.touch_report) && Array.isArray(value.produced_artifact_refs) && value.produced_artifact_refs.every(isArtifactReference2) && optionalStringArray2(value.intended_files) && optionalStringArray2(value.intended_interfaces) && optionalStringArray2(value.intended_data) && optionalString2(value.report_ref);
}
function isTouchReport2(value) {
  return isRecord2(value) && typeof value.task_id === "string" && value.report_type === "touch_report" && Array.isArray(value.touched_files) && value.touched_files.every((item) => typeof item === "string") && Array.isArray(value.touched_interfaces) && value.touched_interfaces.every((item) => typeof item === "string") && Array.isArray(value.touched_data) && value.touched_data.every((item) => typeof item === "string") && Array.isArray(value.touched_workflow_steps) && value.touched_workflow_steps.every((item) => typeof item === "string");
}
function isArtifactReference2(value) {
  return isRecord2(value) && typeof value.ref_type === "string" && typeof value.id === "string";
}
function optionalString2(value) {
  return value === void 0 || typeof value === "string";
}
function optionalStringArray2(value) {
  return value === void 0 || Array.isArray(value) && value.every((item) => typeof item === "string");
}
function optionalJsonObject2(value) {
  return value === void 0 || isJsonObject3(value);
}
function isJsonObject3(value) {
  if (!isRecord2(value)) return false;
  return Object.values(value).every(isJsonValue2);
}
function isJsonValue2(value) {
  if (value === null) return true;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.every(isJsonValue2);
  return isJsonObject3(value);
}
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/decision/autonomy.ts
var DEFAULT_AUTONOMY_PROFILE = {
  engineering: "big_questions_only",
  product: "big_questions_only",
  design: "big_questions_only"
};
function decisionPolicyContext(request, profile) {
  const context = request.context ?? {};
  const domain = readDomain(context, "domain") ?? readDomain(context, "decision_domain") ?? "engineering";
  return {
    domain,
    level: profile[domain],
    scope: readScope(context, "scope") ?? readScope(context, "decision_scope") ?? "moderate",
    productBaselineApproved: readBoolean2(context, "product_baseline_approved") ?? true,
    declaredRisk: readScore2(context, "risk") ?? readScore2(context, "declared_risk") ?? 5
  };
}
function evaluateAutonomyThreshold(request, verdict, profile) {
  const policy = decisionPolicyContext(request, profile);
  if (verdict.type === "human") {
    return { action: "escalate", reason: "verdict requested human review" };
  }
  if (verdict.block_trigger) {
    return { action: "escalate", reason: "verdict block trigger is set" };
  }
  if (policy.domain === "product" && policy.level === "delegate" && !policy.productBaselineApproved && policy.scope !== "local") {
    return { action: "escalate", reason: "product delegation requires an approved baseline" };
  }
  switch (policy.level) {
    case "always_in_loop":
      if (policy.scope !== "local") {
        return { action: "escalate", reason: "always_in_loop requires review beyond local details" };
      }
      if (verdict.risk >= 4) {
        return { action: "escalate", reason: "risk exceeds always_in_loop threshold" };
      }
      if (verdict.confidence <= 6) {
        return { action: "escalate", reason: "confidence is below always_in_loop threshold" };
      }
      return { action: "proceed", reason: "local low-risk decision under always_in_loop" };
    case "big_questions_only":
      if (policy.scope === "major") {
        return { action: "escalate", reason: "major decision under big_questions_only" };
      }
      if (verdict.risk >= 7) {
        return { action: "escalate", reason: "risk exceeds big_questions_only threshold" };
      }
      if (verdict.confidence <= 4) {
        return { action: "escalate", reason: "confidence is below big_questions_only threshold" };
      }
      return { action: "proceed", reason: "decision is below big_questions_only threshold" };
    case "delegate":
      if (verdict.risk >= 9) {
        return { action: "escalate", reason: "risk exceeds delegate threshold" };
      }
      if (verdict.confidence <= 2) {
        return { action: "escalate", reason: "confidence is below delegate threshold" };
      }
      return { action: "proceed", reason: "decision is within delegated bounds" };
  }
}
function asScore0To10(value, label) {
  if (value === 0 || value === 1 || value === 2 || value === 3 || value === 4 || value === 5 || value === 6 || value === 7 || value === 8 || value === 9 || value === 10) {
    return value;
  }
  throw new Error(`${label} must be an integer from 0 to 10`);
}
function readDomain(source, key) {
  const value = source[key];
  if (typeof value === "string" && isAutonomyDomain(value)) return value;
  return void 0;
}
function readScope(source, key) {
  const value = source[key];
  if (typeof value === "string" && isDecisionScope(value)) return value;
  return void 0;
}
function readBoolean2(source, key) {
  const value = source[key];
  return typeof value === "boolean" ? value : void 0;
}
function readScore2(source, key) {
  const value = source[key];
  if (typeof value !== "number" || !Number.isInteger(value)) return void 0;
  if (isScore(value)) return value;
  return void 0;
}
function isScore(value) {
  return value >= 0 && value <= 10;
}
function isAutonomyDomain(value) {
  return value === "engineering" || value === "product" || value === "design";
}
function isDecisionScope(value) {
  return value === "local" || value === "moderate" || value === "major";
}

// src/decision/role-result.ts
function decisionVerdictToRoleResult(verdict) {
  const status = roleStatusForVerdict(verdict);
  return {
    status,
    confidence: verdict.confidence,
    missing_context: status === "needs_human" ? ["human_decision"] : [],
    human_review_required: status === "needs_human" || status === "blocked",
    output: {
      suggested_choice: verdict.suggested_choice,
      suggested_response: verdict.suggested_response
    }
  };
}
function roleResultToDecisionVerdict(result, verdictType = "decision") {
  if (result.status === "needs_human") {
    return {
      type: "human",
      suggested_choice: result.output.suggested_choice,
      suggested_response: result.output.suggested_response,
      confidence: result.confidence,
      risk: 10,
      block_trigger: true
    };
  }
  if (result.status === "blocked") {
    return {
      type: verdictType,
      suggested_choice: result.output.suggested_choice,
      suggested_response: result.output.suggested_response,
      confidence: result.confidence,
      risk: 10,
      block_trigger: true
    };
  }
  return {
    type: verdictType,
    suggested_choice: result.output.suggested_choice,
    suggested_response: result.output.suggested_response,
    confidence: result.confidence,
    risk: result.human_review_required ? 7 : 3,
    block_trigger: result.human_review_required
  };
}
function roleStatusForVerdict(verdict) {
  if (verdict.type === "human") return "needs_human";
  if (verdict.block_trigger) return "blocked";
  if (verdict.suggested_choice === null && verdict.suggested_response === null) {
    return "skipped";
  }
  return "produced";
}

// src/decision/tier1-prompt.ts
var DEFAULT_TIER1_DECISION_PROMPT = {
  id: "daimyo.tier1-decision-role",
  version: "1.0.0",
  text: "You are Daimyo's bounded Tier-1 Decision Role. Given exactly {context, rules, request}, return only the DecisionVerdict JSON. Do not use tools, files, network, or hidden project state. Prefer a clear human verdict when the request is unsafe, underspecified, high-risk, or outside the autonomy rules."
};

// src/engine/structured-model-call.ts
var StructuredModelCallError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "StructuredModelCallError";
  }
};
var StructuredModelClient = class {
  constructor(options) {
    this.options = options;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 3e4;
    this.maxResponseBytes = options.maxResponseBytes ?? 65536;
  }
  options;
  fetchImpl;
  timeoutMs;
  maxResponseBytes;
  async call(request) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(this.options.endpoint, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          model: this.options.model,
          input: request.input,
          response_schema: request.output.schema
        }),
        signal: controller.signal
      });
      const body = await response.text();
      if (!response.ok) {
        throw new StructuredModelCallError(
          `Structured model call failed with HTTP ${response.status}: ${body}`
        );
      }
      if (Buffer.byteLength(body, "utf8") > this.maxResponseBytes) {
        throw new StructuredModelCallError(
          `Structured model response exceeded ${this.maxResponseBytes} bytes`
        );
      }
      const parsed = parseJson(body, "structured model response");
      return request.output.parse(parsed);
    } finally {
      clearTimeout(timeout);
    }
  }
  headers() {
    const headers = {
      "content-type": "application/json"
    };
    if (this.options.apiKey !== void 0) {
      headers.authorization = `Bearer ${this.options.apiKey}`;
    }
    return headers;
  }
};
function parseJson(value, label) {
  try {
    const parsed = JSON.parse(value);
    return parsed;
  } catch (error) {
    if (error instanceof Error) {
      throw new StructuredModelCallError(`Invalid ${label}: ${error.message}`);
    }
    throw new StructuredModelCallError(`Invalid ${label}`);
  }
}
function isJsonObject4(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function requireJsonObject(value, label) {
  if (!isJsonObject4(value)) {
    throw new StructuredModelCallError(`${label} must be a JSON object`);
  }
  return value;
}

// src/notification/notifier.ts
var ConsoleHumanDecisionNotifier = class {
  write;
  constructor(options = {}) {
    this.write = options.write ?? ((message) => process.stderr.write(message));
  }
  async notify(record) {
    this.write(
      [
        `Daimyo awaiting human decision ${record.payload.decision_id}`,
        `node=${record.payload.request.node_id}`,
        `task=${record.payload.request.task_id}`,
        `tier=${record.payload.tier}`,
        `reason=${record.payload.rationale}`,
        ""
      ].join("\n")
    );
  }
};

// src/decision/tiered-decision-provider.ts
var DEFAULT_STATIC_RULES = {
  allowTools: ["Read", "Grep", "Glob", "LS", "TodoRead"],
  denyTools: []
};
var AgentTransportTier2InvestigationHook = class {
  agentTransport;
  cwd;
  maxEvents;
  constructor(options) {
    this.agentTransport = options.agentTransport;
    this.cwd = options.cwd;
    this.maxEvents = options.maxEvents ?? 20;
  }
  async investigate(request) {
    const session = await this.agentTransport.spawnSession({
      nodeId: asNodeId(`${request.request.node_id}:tier2`),
      cwd: this.cwd,
      prompt: tier2InvestigationPrompt(request),
      metadata: {
        tier: 2,
        mode: "read-only",
        cross_port_edge: "DecisionProvider->AgentTransport Tier-2 investigation"
      }
    });
    try {
      for (let index = 0; index < this.maxEvents; index += 1) {
        const event = await this.agentTransport.readEvent(session.id);
        if (event.type === "turn_ended") {
          const parsed = JSON.parse(event.result);
          return decisionVerdictSchema.parse(parsed);
        }
        await this.handleNonTerminalEvent(event);
      }
    } finally {
      await this.agentTransport.disposeSession(session.id);
    }
    return humanVerdict("Tier 2 investigation did not produce a verdict within the event budget.");
  }
  async handleNonTerminalEvent(event) {
    if (event.type === "turn_ended") return;
    if (event.type === "log") return;
    if (event.type === "needs_permission") {
      const decision = readOnlyPermissionDecision(event.toolName, event.arguments);
      if (decision.allowed) {
        await this.agentTransport.sendCommand(event.sessionId, {
          type: "approve",
          correlationId: event.correlationId,
          reason: decision.reason
        });
      } else {
        await this.agentTransport.sendCommand(event.sessionId, {
          type: "deny",
          correlationId: event.correlationId,
          reason: decision.reason
        });
      }
      return;
    }
    if (event.type === "needs_input") {
      await this.agentTransport.sendCommand(event.sessionId, {
        type: "respond",
        correlationId: event.correlationId,
        response: "Continue the Tier 2 investigation using only read-only evidence."
      });
      return;
    }
    if (event.type === "stalled") {
      await this.agentTransport.sendCommand(event.sessionId, {
        type: "interrupt",
        correlationId: event.correlationId,
        reason: "Tier 2 read-only investigation stalled."
      });
      return;
    }
    throw new Error(`Tier 2 investigation worker exited before producing a verdict: ${event.reason}`);
  }
};
var TieredDecisionProvider = class {
  executionStore;
  autonomyProfile;
  staticRules;
  modelClient;
  tier1Prompt;
  notifier;
  tier2InvestigationHook;
  clock;
  constructor(options) {
    this.executionStore = options.executionStore;
    this.autonomyProfile = options.autonomyProfile ?? DEFAULT_AUTONOMY_PROFILE;
    this.staticRules = options.staticRules ?? DEFAULT_STATIC_RULES;
    this.modelClient = options.modelClient;
    this.tier1Prompt = options.tier1Prompt === void 0 ? DEFAULT_TIER1_DECISION_PROMPT : options.tier1Prompt;
    this.notifier = options.notifier ?? new ConsoleHumanDecisionNotifier();
    this.tier2InvestigationHook = options.tier2InvestigationHook;
    this.clock = options.clock ?? (() => (/* @__PURE__ */ new Date()).toISOString());
  }
  async decidePermission(request, _dependencies) {
    return this.resolve(request, this.evaluatePermissionTier0(request));
  }
  async decideRouting(request, dependencies) {
    const tier0 = this.evaluateRoutingTier0(request);
    if (tier0.kind === "resolved") return this.resolve(request, tier0);
    const tier1 = await this.evaluateTier1(request, tier0.rationale, dependencies);
    return this.resolve(request, tier1);
  }
  evaluatePermissionTier0(request) {
    const rule = this.toolRule(request.tool_name);
    const policy = decisionPolicyContext(request, this.autonomyProfile);
    if (rule === "deny") {
      return {
        kind: "resolved",
        tier: 0,
        rationale: `Tier 0 static deny rule matched tool ${request.tool_name}`,
        verdict: {
          type: "access",
          suggested_choice: "deny",
          suggested_response: `Denied ${request.tool_name} by static rule.`,
          confidence: 10,
          risk: 10,
          block_trigger: false
        }
      };
    }
    const provisional = {
      type: "access",
      suggested_choice: rule === "allow" || policy.level === "delegate" ? "allow" : "deny",
      suggested_response: rule === "allow" || policy.level === "delegate" ? `Allowed ${request.tool_name} by Tier 0 policy.` : `Denied ${request.tool_name} pending stronger policy.`,
      confidence: rule === "allow" ? 9 : 6,
      risk: policy.declaredRisk,
      block_trigger: false
    };
    if (provisional.suggested_choice === "deny") {
      return {
        kind: "resolved",
        tier: 0,
        verdict: provisional,
        rationale: `Tier 0 denied unlisted tool ${request.tool_name}`
      };
    }
    const threshold = evaluateAutonomyThreshold(request, provisional, this.autonomyProfile);
    if (threshold.action === "escalate") {
      return {
        kind: "resolved",
        tier: 3,
        verdict: humanVerdict(`Permission for ${request.tool_name} requires human review.`),
        rationale: `Tier 3 policy escalation: ${threshold.reason}`
      };
    }
    return {
      kind: "resolved",
      tier: 0,
      verdict: provisional,
      rationale: `Tier 0 ${rule === "allow" ? "static allow" : "delegated"} rule allowed tool ${request.tool_name}`
    };
  }
  evaluateRoutingTier0(request) {
    const policy = decisionPolicyContext(request, this.autonomyProfile);
    if (policy.level === "always_in_loop" && policy.scope !== "local") {
      return {
        kind: "resolved",
        tier: 3,
        verdict: humanVerdict("Routing decision requires human review under always_in_loop."),
        rationale: "Tier 3 policy escalation: always_in_loop requires review beyond local details"
      };
    }
    if (policy.level === "big_questions_only" && policy.scope === "major") {
      return {
        kind: "resolved",
        tier: 3,
        verdict: humanVerdict("Major routing decision requires human review."),
        rationale: "Tier 3 policy escalation: major decision under big_questions_only"
      };
    }
    if (policy.level === "delegate" && policy.scope === "local") {
      return {
        kind: "resolved",
        tier: 0,
        verdict: {
          type: "decision",
          suggested_choice: firstOption(request) ?? "proceed",
          suggested_response: "Proceed under delegated local routing policy.",
          confidence: 8,
          risk: 2,
          block_trigger: false
        },
        rationale: "Tier 0 settled delegated local routing decision"
      };
    }
    return {
      kind: "fallthrough",
      rationale: "Tier 0 found no deterministic routing rule"
    };
  }
  async evaluateTier1(request, fallthroughRationale, dependencies) {
    if (this.modelClient === void 0 || this.tier1Prompt === null) {
      return {
        kind: "resolved",
        tier: 3,
        verdict: humanVerdict("Tier 1 decision prompt or model client is unavailable."),
        rationale: `Tier 3 degradation: ${fallthroughRationale}; Tier 1 unavailable`
      };
    }
    const verdict = await this.modelClient.call({
      input: {
        context: this.tier1Context(request),
        rules: this.tier1Rules(),
        request: this.tier1Request(request)
      },
      output: decisionVerdictSchema
    });
    const investigatedVerdict = await this.maybeInvestigateTier2(
      request,
      verdict,
      fallthroughRationale,
      dependencies
    );
    const threshold = evaluateAutonomyThreshold(request, investigatedVerdict, this.autonomyProfile);
    if (threshold.action === "escalate") {
      if (investigatedVerdict !== verdict) {
        await this.recordIntermediateDecision(makeDecisionRecord({
          decision_id: asDecisionId(`${request.decision_id}:tier2`),
          request,
          verdict: investigatedVerdict,
          tier: 2,
          rationale: `Tier 2 investigation completed but policy still escalated: ${threshold.reason}`,
          created_at: this.clock()
        }));
      }
      return {
        kind: "resolved",
        tier: 3,
        verdict: toHumanVerdict(investigatedVerdict),
        rationale: `Tier 3 escalation after Tier 1: ${threshold.reason}`
      };
    }
    return {
      kind: "resolved",
      tier: investigatedVerdict === verdict ? 1 : 2,
      verdict: investigatedVerdict,
      rationale: investigatedVerdict === verdict ? `Tier 1 bounded model decision after Tier 0 fallthrough: ${fallthroughRationale}` : `Tier 2 read-only investigation improved Tier 1 verdict after: ${fallthroughRationale}`
    };
  }
  async maybeInvestigateTier2(request, verdict, fallthroughRationale, dependencies) {
    if (!this.shouldFlagTier2(verdict)) return verdict;
    const hook = this.tier2InvestigationHook ?? tier2HookFromDependencies(dependencies);
    if (hook === void 0) return verdict;
    return await hook.investigate({
      request,
      tier1Verdict: verdict,
      thresholdReason: `${fallthroughRationale}; ${tier2TriggerReason(verdict)}`
    });
  }
  async resolve(request, outcome) {
    const record = makeDecisionRecord({
      decision_id: decisionRequestId(request),
      request,
      verdict: outcome.verdict,
      tier: outcome.tier,
      rationale: outcome.rationale,
      created_at: this.clock()
    });
    if (outcome.tier === 3) {
      await this.parkAwaitingHuman(request);
    }
    await this.executionStore.recordDecision(decisionRequestTaskId(request), decisionRequestNodeId(request), record);
    if (outcome.tier === 3) {
      await this.notifier.notify(record);
    }
    return record;
  }
  async recordIntermediateDecision(record) {
    await this.executionStore.recordDecision(
      decisionRequestTaskId(record.payload.request),
      decisionRequestNodeId(record.payload.request),
      record
    );
  }
  async parkAwaitingHuman(request) {
    const taskId = decisionRequestTaskId(request);
    const nodeId = decisionRequestNodeId(request);
    const snapshot = await this.executionStore.load(taskId);
    const node = snapshot.nodes.find((candidate) => candidate.id === nodeId);
    if (node === void 0) {
      throw new Error(`Cannot park unknown node awaiting human: ${request.node_id}`);
    }
    const input = {
      id: node.id,
      taskId: node.taskId,
      type: node.type,
      status: "awaiting-human",
      retryCount: node.retryCount,
      ...node.parentId === void 0 ? {} : { parentId: node.parentId },
      ...node.session === void 0 ? {} : { session: node.session }
    };
    await this.executionStore.upsertNode(taskId, input);
  }
  toolRule(toolName) {
    if ((this.staticRules.denyTools ?? []).includes(toolName)) return "deny";
    if ((this.staticRules.allowTools ?? []).includes(toolName)) return "allow";
    return "none";
  }
  tier1Context(request) {
    return {
      prompt_id: this.requiredTier1Prompt().id,
      prompt_version: this.requiredTier1Prompt().version,
      prompt: this.requiredTier1Prompt().text,
      request_context: request.context ?? {}
    };
  }
  tier1Rules() {
    return {
      autonomy_profile: {
        engineering: this.autonomyProfile.engineering,
        product: this.autonomyProfile.product,
        design: this.autonomyProfile.design
      },
      static_rules: {
        allow_tools: [...this.staticRules.allowTools ?? []],
        deny_tools: [...this.staticRules.denyTools ?? []]
      },
      verdict_contract: "Return {type,suggested_choice,suggested_response,confidence,risk,block_trigger}. No tools or filesystem."
    };
  }
  tier1Request(request) {
    return {
      decision_id: request.decision_id,
      node_id: request.node_id,
      task_id: request.task_id,
      surface: request.surface,
      prompt: request.prompt,
      ...request.options === void 0 ? {} : { options: [...request.options] }
    };
  }
  requiredTier1Prompt() {
    if (this.tier1Prompt === null) {
      throw new Error("Tier 1 prompt is unavailable");
    }
    return this.tier1Prompt;
  }
  shouldFlagTier2(verdict) {
    return verdict.risk >= 7 || verdict.confidence <= 4;
  }
};
var decisionVerdictSchema = {
  name: "decision-verdict.v1",
  schema: {
    type: "object",
    required: [
      "type",
      "suggested_choice",
      "suggested_response",
      "confidence",
      "risk",
      "block_trigger"
    ],
    additionalProperties: false,
    properties: {
      type: { enum: ["decision", "access", "human"] },
      suggested_choice: { type: ["string", "null"] },
      suggested_response: { type: ["string", "null"] },
      confidence: { type: "integer", minimum: 0, maximum: 10 },
      risk: { type: "integer", minimum: 0, maximum: 10 },
      block_trigger: { type: "boolean" }
    }
  },
  parse(value) {
    const object = requireJsonObject(value, "decision verdict");
    return {
      type: readVerdictType(object, "type"),
      suggested_choice: readNullableString2(object, "suggested_choice"),
      suggested_response: readNullableString2(object, "suggested_response"),
      confidence: readScore3(object, "confidence"),
      risk: readScore3(object, "risk"),
      block_trigger: readBoolean3(object, "block_trigger")
    };
  }
};
function tier2HookFromDependencies(dependencies) {
  if (dependencies?.agentTransport === void 0 || dependencies.cwd === void 0) return void 0;
  return new AgentTransportTier2InvestigationHook({
    agentTransport: dependencies.agentTransport,
    cwd: dependencies.cwd
  });
}
function tier2TriggerReason(verdict) {
  if (verdict.risk >= 7 && verdict.confidence <= 4) {
    return "Tier 1 returned low confidence and high risk";
  }
  if (verdict.risk >= 7) return "Tier 1 returned high risk";
  return "Tier 1 returned low confidence";
}
function tier2InvestigationPrompt(request) {
  return [
    "Daimyo Tier 2 read-only investigation.",
    "You may inspect files and state, but you must not edit files or run mutating commands.",
    "Return only a DecisionVerdict JSON object with keys:",
    "{type,suggested_choice,suggested_response,confidence,risk,block_trigger}",
    "",
    `Decision prompt: ${request.request.prompt}`,
    `Tier 1 verdict: ${JSON.stringify(request.tier1Verdict)}`,
    `Escalation reason: ${request.thresholdReason}`,
    `Context: ${JSON.stringify(request.request.context ?? {})}`
  ].join("\n");
}
function readOnlyPermissionDecision(toolName, toolArguments) {
  if (toolName === "Read" || toolName === "Grep" || toolName === "Glob" || toolName === "LS" || toolName === "TodoRead") {
    return { allowed: true, reason: `Tier 2 read-only investigation allowed ${toolName}.` };
  }
  if (toolName === "Bash") {
    const command = readNullableCommand(toolArguments);
    if (command !== void 0 && isReadOnlyShellCommand(command)) {
      return { allowed: true, reason: "Tier 2 read-only investigation allowed read-only shell command." };
    }
    return { allowed: false, reason: "Tier 2 read-only investigation denied mutating bash." };
  }
  return { allowed: false, reason: `Tier 2 read-only investigation denied ${toolName}.` };
}
function readNullableCommand(toolArguments) {
  const value = toolArguments.command;
  return typeof value === "string" ? value.trim() : void 0;
}
function isReadOnlyShellCommand(command) {
  if (command.length === 0) return false;
  const readOnlyPrefixes = [
    "pwd",
    "ls",
    "find",
    "rg",
    "grep",
    "cat",
    "git status",
    "git diff",
    "git show",
    "git log",
    "git grep",
    "git ls-files"
  ];
  if (readOnlyPrefixes.some((prefix) => command === prefix || command.startsWith(`${prefix} `))) {
    return !containsShellMutation(command);
  }
  if (command.startsWith("sed -n ")) return !containsShellMutation(command);
  return false;
}
function containsShellMutation(command) {
  return /(^|[;&|]\s*)(rm|mv|cp|mkdir|touch|chmod|chown|npm|pnpm|yarn|git\s+(add|commit|push|checkout|reset|clean|merge|rebase)|sed\s+-i)\b/.test(command) || command.includes(">") || command.includes(">>");
}
function firstOption(request) {
  return request.options?.[0];
}
function humanVerdict(response) {
  return {
    type: "human",
    suggested_choice: null,
    suggested_response: response,
    confidence: 0,
    risk: 10,
    block_trigger: true
  };
}
function toHumanVerdict(verdict) {
  return {
    type: "human",
    suggested_choice: verdict.suggested_choice,
    suggested_response: verdict.suggested_response,
    confidence: verdict.confidence,
    risk: verdict.risk,
    block_trigger: true
  };
}
function readVerdictType(source, key) {
  const value = source[key];
  if (value === "decision" || value === "access" || value === "human") return value;
  throw new StructuredModelCallError(`${key} must be decision, access, or human`);
}
function readNullableString2(source, key) {
  const value = source[key];
  if (value === null || typeof value === "string") return value;
  throw new StructuredModelCallError(`${key} must be a string or null`);
}
function readBoolean3(source, key) {
  const value = source[key];
  if (typeof value === "boolean") return value;
  throw new StructuredModelCallError(`${key} must be a boolean`);
}
function readScore3(source, key) {
  const value = source[key];
  if (typeof value === "number" && Number.isInteger(value)) {
    try {
      return asScore0To10(value, key);
    } catch (_error) {
      throw new StructuredModelCallError(`${key} must be an integer from 0 to 10`);
    }
  }
  throw new StructuredModelCallError(`${key} must be an integer from 0 to 10`);
}

// src/engine/anthropic-structured-model-call.ts
var AnthropicStructuredModelClient = class {
  constructor(options) {
    this.options = options;
    this.endpoint = options.endpoint ?? "https://api.anthropic.com/v1/messages";
    this.anthropicVersion = options.anthropicVersion ?? "2023-06-01";
    this.timeoutMs = options.timeoutMs ?? 3e4;
    this.maxTokens = options.maxTokens ?? 1024;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }
  options;
  endpoint;
  anthropicVersion;
  timeoutMs;
  maxTokens;
  fetchImpl;
  async call(request) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          "anthropic-version": this.anthropicVersion,
          "content-type": "application/json",
          "x-api-key": this.options.apiKey
        },
        body: JSON.stringify({
          model: this.options.model,
          max_tokens: this.maxTokens,
          temperature: 0,
          system: "Return only JSON that satisfies the provided response_schema. Do not include markdown.",
          messages: [
            {
              role: "user",
              content: JSON.stringify({
                input: request.input,
                response_schema: request.output.schema
              })
            }
          ]
        }),
        signal: controller.signal
      });
      const body = await response.text();
      if (!response.ok) {
        throw new StructuredModelCallError(
          `Anthropic structured model call failed with HTTP ${response.status}: ${body}`
        );
      }
      return request.output.parse(
        parseJson(extractAnthropicText(body, request.output), "Anthropic structured model response")
      );
    } finally {
      clearTimeout(timeout);
    }
  }
};
function extractAnthropicText(body, output) {
  const parsed = requireJsonObject(parseJson(body, "Anthropic message response"), "Anthropic message response");
  const content = parsed.content;
  if (!Array.isArray(content)) {
    throw new StructuredModelCallError("Anthropic message response content must be an array");
  }
  const blocks = content.filter(isAnthropicTextBlock);
  const text = blocks.map((block) => block.text).join("\n").trim();
  if (text.length === 0) {
    throw new StructuredModelCallError(
      `Anthropic message response did not contain text for ${output.name}`
    );
  }
  return text;
}
function isAnthropicTextBlock(value) {
  if (!isJsonObject4(value)) return false;
  return value.type === "text" && typeof value.text === "string";
}

// src/engine/shell-runner.ts
import { spawn } from "node:child_process";
function runDeclaredCommand(command) {
  return new Promise((resolve2) => {
    const child = spawn(command.command, command.args ?? [], {
      cwd: command.cwd,
      env: command.env === void 0 ? process.env : { ...process.env, ...command.env },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdout = [];
    const stderr = [];
    let settled = false;
    const timeout = command.timeoutMs === void 0 ? void 0 : setTimeout(() => {
      if (settled) return;
      child.kill("SIGTERM");
      stderr.push(`Command timed out after ${command.timeoutMs}ms`);
    }, command.timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      if (timeout !== void 0) clearTimeout(timeout);
      resolve2({
        exitCode: 1,
        stdout: stdout.join(""),
        stderr: `${stderr.join("")}${error.message}`
      });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      if (timeout !== void 0) clearTimeout(timeout);
      resolve2({
        exitCode: code ?? 1,
        stdout: stdout.join(""),
        stderr: stderr.join("")
      });
    });
  });
}

// src/standalone/composition.ts
import { dirname as dirname3, extname, resolve } from "node:path";

// src/validation/built-in-validation.ts
var modelAcceptanceSchema = {
  name: "validation-acceptance-result",
  schema: {
    type: "object",
    required: ["pass", "fail", "reasons"],
    additionalProperties: false,
    properties: {
      pass: { type: "boolean" },
      fail: { type: "boolean" },
      reasons: { type: "array", items: { type: "string" } }
    }
  },
  parse(value) {
    const object = requireJsonObject(value, "validation acceptance result");
    const pass = object.pass;
    const fail = object.fail;
    const reasons = object.reasons;
    if (typeof pass !== "boolean") {
      throw new StructuredModelCallError("validation acceptance pass must be boolean");
    }
    if (typeof fail !== "boolean") {
      throw new StructuredModelCallError("validation acceptance fail must be boolean");
    }
    if (!Array.isArray(reasons) || !reasons.every((reason) => typeof reason === "string")) {
      throw new StructuredModelCallError("validation acceptance reasons must be a string array");
    }
    return { pass, fail, reasons };
  }
};
var BuiltInValidation = class {
  executionStore;
  modelClient;
  runCommand;
  now;
  makeReportRef;
  constructor(options) {
    this.executionStore = options.executionStore;
    this.modelClient = options.modelClient;
    this.runCommand = options.runCommand ?? runDeclaredCommand;
    this.now = options.now ?? (() => (/* @__PURE__ */ new Date()).toISOString());
    this.makeReportRef = options.makeReportRef ?? ((request) => `validation:${request.task.id}:${request.node.id}:${request.scope}:${this.now()}`);
  }
  async validate(request) {
    const command = readValidationCommand(request.task);
    if (command !== void 0) {
      return this.validateWithCommand(request, command);
    }
    return this.validateWithModelFallback(request);
  }
  async validateWithCommand(request, command) {
    const result = await this.runCommand(command);
    const status = result.exitCode === 0 ? "pass" : "fail";
    const reasons = [
      `Validation command exited with code ${result.exitCode}.`,
      `stdout: ${result.stdout}`,
      `stderr: ${result.stderr}`
    ];
    const details = {
      kind: "command",
      command: command.command,
      args: [...command.args ?? []],
      cwd: command.cwd ?? null,
      timeoutMs: command.timeoutMs ?? null,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr
    };
    return this.persistResult(request, status, reasons, "command", details);
  }
  async validateWithModelFallback(request) {
    const modelResult = await this.modelClient.call({
      input: {
        context: "Daimyo validation fallback. This is weaker evidence than a declared validation command.",
        request: JSON.stringify({
          task: {
            id: request.task.id,
            title: request.task.title,
            acceptanceCriteria: [...request.task.acceptanceCriteria]
          },
          scope: request.scope,
          evidence: request.evidence
        })
      },
      output: modelAcceptanceSchema
    });
    const status = modelResult.pass && !modelResult.fail ? "pass" : "fail";
    const reasons = [
      "Model acceptance fallback used; evidence is weaker than a command result.",
      ...modelResult.reasons
    ];
    const details = {
      kind: "model_fallback",
      pass: modelResult.pass,
      fail: modelResult.fail
    };
    return this.persistResult(request, status, reasons, "model_fallback", details);
  }
  async persistResult(request, status, reasons, evidenceStrength, details) {
    const report_ref = this.makeReportRef(request);
    const report = makeValidationReport({
      report_ref,
      task_id: request.task.id,
      node_id: request.node.id,
      scope: request.scope,
      status,
      reasons: [...reasons],
      evidence_strength: evidenceStrength,
      evidence: request.evidence,
      details,
      created_at: this.now(),
      producer: { primitive: "engine", name: "daimyo-built-in-validation" },
      source_refs: [{ ref_type: "task", id: request.task.id, relation: "validates" }],
      output_refs: [makeArtifactReference(report_ref, "produces")]
    });
    const evidence = validationEvidence(request.node, report, request.evidence);
    await this.executionStore.recordValidationReport(request.task.id, request.node.id, report);
    await this.executionStore.appendEvidence(request.task.id, request.node.id, evidence);
    return { status, reasons, report_ref };
  }
};
function validationEvidence(node, report, producedEvidence) {
  return makeExecutionEvidence({
    taskId: node.taskId,
    summary: `${report.payload.scope}-scope validation ${report.payload.status} for node ${node.id}`,
    producedArtifactRefs: [makeArtifactReference(report.payload.report_ref, "validates")],
    touchedFiles: producedEvidence.touch_report.touched_files,
    touchedInterfaces: producedEvidence.touch_report.touched_interfaces,
    touchedData: producedEvidence.touch_report.touched_data,
    touchedWorkflowSteps: producedEvidence.touch_report.touched_workflow_steps,
    report_ref: report.payload.report_ref
  });
}
function readValidationCommand(task) {
  const metadata = task.metadata;
  if (metadata === void 0) return void 0;
  const declared = metadata.validation_command ?? metadata.validationCommand;
  if (declared === void 0) return void 0;
  return parseDeclaredCommand(declared);
}
function parseDeclaredCommand(value) {
  if (!isJsonObject5(value)) {
    throw new Error("Task validation command must be an object");
  }
  const command = value.command;
  if (typeof command !== "string" || command.length === 0) {
    throw new Error("Task validation command.command must be a non-empty string");
  }
  const args = readOptionalStringArray2(value, "args");
  const cwd = readOptionalString2(value, "cwd");
  const env = readOptionalStringRecord(value, "env");
  const timeoutMs = readOptionalPositiveNumber(value, "timeoutMs");
  return {
    command,
    ...args === void 0 ? {} : { args },
    ...cwd === void 0 ? {} : { cwd },
    ...env === void 0 ? {} : { env },
    ...timeoutMs === void 0 ? {} : { timeoutMs }
  };
}
function readOptionalStringArray2(source, key) {
  const value = source[key];
  if (value === void 0) return void 0;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`Task validation command.${key} must be a string array`);
  }
  return value;
}
function readOptionalString2(source, key) {
  const value = source[key];
  if (value === void 0) return void 0;
  if (typeof value !== "string") {
    throw new Error(`Task validation command.${key} must be a string`);
  }
  return value;
}
function readOptionalStringRecord(source, key) {
  const value = source[key];
  if (value === void 0) return void 0;
  if (!isJsonObject5(value)) {
    throw new Error(`Task validation command.${key} must be an object`);
  }
  const entries = Object.entries(value);
  if (!entries.every((entry) => typeof entry[1] === "string")) {
    throw new Error(`Task validation command.${key} values must be strings`);
  }
  const record = {};
  for (const [entryKey, entryValue] of entries) {
    if (typeof entryValue === "string") {
      record[entryKey] = entryValue;
    }
  }
  return record;
}
function readOptionalPositiveNumber(source, key) {
  const value = source[key];
  if (value === void 0) return void 0;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  throw new Error(`Task validation command.${key} must be a positive number`);
}
function isJsonObject5(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/supervisor/decision-actions.ts
function classifyDecisionSize(request) {
  const context = request.context ?? {};
  if (readString2(context, "decision_size") === "large") return "large";
  if (readString2(context, "size") === "large") return "large";
  if (readString2(context, "scope") === "major") return "large";
  if (readString2(context, "decision_scope") === "major") return "large";
  const impact = readString2(context, "impact");
  if (impact === "cross_cutting" || impact === "multi_task" || impact === "architecture" || impact === "schema" || impact === "product_scope") {
    return "large";
  }
  return "small";
}
function selectDecisionAction(record, autonomyProfile = DEFAULT_AUTONOMY_PROFILE) {
  if (record.payload.verdict.type === "human" || record.payload.verdict.block_trigger) {
    return {
      type: "await-human",
      size: classifyDecisionSize(record.payload.request),
      reason: record.payload.verdict.suggested_response ?? record.payload.rationale
    };
  }
  const threshold = evaluateAutonomyThreshold(
    record.payload.request,
    record.payload.verdict,
    autonomyProfile
  );
  const size = classifyDecisionSize(record.payload.request);
  if (threshold.action === "escalate") {
    return {
      type: "await-human",
      size,
      reason: threshold.reason
    };
  }
  if (size === "large") {
    return {
      type: "create-follow-up",
      size,
      task: followUpTask(record)
    };
  }
  return {
    type: "patch-and-resume",
    size,
    instruction: verdictInstruction(record.payload.verdict)
  };
}
function verdictInstruction(verdict) {
  return verdict.suggested_response ?? verdict.suggested_choice ?? "Decision resolved; continue with the selected approach.";
}
function followUpTask(record) {
  const instruction = verdictInstruction(record.payload.verdict);
  return {
    title: `Follow up: ${record.payload.request.prompt.slice(0, 72)}`,
    body: [
      "Created by Daimyo from a large needs-decision verdict.",
      "",
      `Decision: ${instruction}`,
      "",
      `Original request: ${record.payload.request.prompt}`
    ].join("\n"),
    acceptanceCriteria: ["Resolve the large decision as its own authoritative task."],
    metadata: {
      source: "daimyo-decision-action",
      decision_id: decisionRecordId(record),
      source_task_id: record.payload.request.task_id,
      source_node_id: record.payload.request.node_id,
      decision_size: "large"
    }
  };
}
function readString2(source, key) {
  const value = source[key];
  return typeof value === "string" ? value : void 0;
}

// src/supervisor/supervisor.ts
var DEFAULT_MAX_RETRIES = 1;
var DEFAULT_MAX_CONCURRENCY = 4;
var DEFAULT_MAX_QUIESCE_ATTEMPTS = 2;
var Supervisor = class {
  agentTransport;
  workSource;
  executionStore;
  validation;
  decisionProvider;
  cwd;
  maxRetries;
  maxConcurrency;
  maxQuiesceAttempts;
  stallAfterMs;
  autonomyProfile;
  now;
  constructor(options) {
    this.agentTransport = options.agentTransport;
    this.workSource = options.workSource;
    this.executionStore = options.executionStore;
    this.validation = options.validation;
    this.decisionProvider = options.decisionProvider;
    this.cwd = options.cwd;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.maxConcurrency = options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
    if (this.maxConcurrency < 1) throw new Error("Supervisor maxConcurrency must be at least 1");
    this.maxQuiesceAttempts = options.maxQuiesceAttempts ?? DEFAULT_MAX_QUIESCE_ATTEMPTS;
    if (this.maxQuiesceAttempts < 1) {
      throw new Error("Supervisor maxQuiesceAttempts must be at least 1");
    }
    this.stallAfterMs = options.stallAfterMs;
    this.autonomyProfile = options.autonomyProfile ?? DEFAULT_AUTONOMY_PROFILE;
    this.now = options.now ?? (() => (/* @__PURE__ */ new Date()).toISOString());
  }
  async run(taskId, options = {}) {
    await this.reconcileAtCheckpoint();
    const task = await this.workSource.getTask(taskId);
    const budget = {
      processedEvents: 0,
      ...options.maxEvents === void 0 ? {} : { maxEvents: options.maxEvents }
    };
    const result = await this.executeNode(task, void 0, budget, void 0);
    return {
      status: childReturnToRunStatus(result.returnValue),
      nodeId: result.returnValue.nodeId,
      taskId,
      eventsProcessed: result.eventsProcessed
    };
  }
  async executeNode(task, parent, budget, resumeInstruction) {
    await this.reconcileAtCheckpoint();
    const childTasks = await this.childTasks(task.id);
    if (childTasks.length > 0) {
      return await this.executeInnerNode(task, childTasks, parent, budget);
    }
    return await this.executeLeafNode(task, parent, budget, resumeInstruction);
  }
  async executeInnerNode(task, childSummaries, parent, budget) {
    const node = await this.ensureNode(task, "inner", parent);
    await this.markNode(task, node, "running", node.retryCount, void 0);
    await this.workSource.markStatus(
      task.id,
      "active",
      simpleEvidence(task.id, `Daimyo inner node ${node.id} started governing children.`)
    );
    const waveResult = await this.executeChildWave(task, node, childSummaries, budget);
    if (waveResult.returnValue.type !== "done") return waveResult;
    const doneEvidence = simpleEvidence(
      task.id,
      `Inner node ${node.id} completed ${childSummaries.length} children after parent-scope validation.`
    );
    await this.executionStore.appendEvidence(task.id, node.id, doneEvidence);
    await this.markNode(task, node, "done", node.retryCount, void 0);
    await this.executionStore.setCursor(task.id, null);
    await this.workSource.markStatus(task.id, "done", doneEvidence);
    await this.reconcileAtCheckpoint();
    return {
      returnValue: { type: "done", nodeId: node.id, evidence: doneEvidence },
      eventsProcessed: budget.processedEvents
    };
  }
  async executeChildWave(parentTask, parentNode, childSummaries, budget) {
    const remaining = [...childSummaries].sort((left, right) => left.id.localeCompare(right.id));
    const activeBySession = /* @__PURE__ */ new Map();
    const completed = /* @__PURE__ */ new Map();
    const ownership = /* @__PURE__ */ new Map();
    const quiesceAttempts = /* @__PURE__ */ new Map();
    for (const summary of remaining) {
      ownership.set(summary.id, ownershipSurface(await this.workSource.getTask(summary.id)));
    }
    while (remaining.length > 0 || activeBySession.size > 0) {
      while (remaining.length > 0 && activeBySession.size < this.maxConcurrency) {
        const next = remaining.shift();
        if (next === void 0) break;
        const childTask = await this.workSource.getTask(next.id);
        const grandchildren = await this.childTasks(childTask.id);
        if (grandchildren.length > 0) {
          const childResult = await this.executeNode(childTask, parentNode, budget, void 0);
          if (childResult.returnValue.type === "done") {
            completed.set(childTask.id, childResult.returnValue);
            continue;
          }
          if (childResult.returnValue.type === "needs-decision") {
            const affectedTaskIds = decisionAffectedTaskIds(childResult.returnValue.request.context);
            if (affectedTaskIds.length > 0 && !await this.nodeOwnsAffectedTasks(parentTask.id, affectedTaskIds)) {
              return childResult;
            }
            const action = await this.routeNeedsDecision(parentTask, parentNode, childTask, childResult.returnValue);
            const resumed = await this.handleRoutedAction(
              parentTask,
              parentNode,
              childTask,
              childResult.returnValue,
              action,
              budget
            );
            if (resumed.returnValue.type !== "done") return resumed;
            completed.set(childTask.id, resumed.returnValue);
            continue;
          }
          const handled = await this.handleChildFailure(
            parentTask,
            parentNode,
            childTask,
            childResult.returnValue,
            budget
          );
          if (handled.returnValue.type !== "done") return handled;
          completed.set(childTask.id, handled.returnValue);
          continue;
        }
        const active2 = await this.startLeafWorker(childTask, parentNode, void 0);
        activeBySession.set(active2.session.id, active2);
      }
      if (activeBySession.size === 0) continue;
      if (budgetExhausted(budget)) {
        return {
          returnValue: childFailed(
            parentNode.id,
            "Supervisor event budget exhausted before the child wave reached a terminal state.",
            true,
            latestEvidence(parentNode)
          ),
          eventsProcessed: budget.processedEvents
        };
      }
      const readSessionId = sortedSessionIds(activeBySession)[0];
      if (readSessionId === void 0) throw new Error("Wave had active workers but no session id");
      const event = await this.agentTransport.readEvent(
        readSessionId,
        this.stallAfterMs === void 0 ? void 0 : { stallAfterMs: this.stallAfterMs }
      );
      budget.processedEvents += 1;
      const active = activeBySession.get(event.sessionId);
      if (active === void 0) {
        throw new Error(`Wave received event for inactive session ${event.sessionId}`);
      }
      const processed = await this.processLeafEvent(active.task, active.node, active.session, event);
      if (processed.type === "continue") {
        activeBySession.set(active.session.id, { ...active, node: processed.node });
        continue;
      }
      activeBySession.delete(active.session.id);
      if (processed.type === "failed") {
        const handled = await this.handleChildFailure(
          parentTask,
          parentNode,
          active.task,
          processed.returnValue,
          budget
        );
        await this.reconcileAtCheckpoint();
        if (handled.returnValue.type !== "done") return handled;
        completed.set(active.task.id, handled.returnValue);
        continue;
      }
      if (processed.type === "needs-decision") {
        const affectedTaskIds = decisionAffectedTaskIds(processed.returnValue.request.context);
        if (affectedTaskIds.length > 0 && !await this.nodeOwnsAffectedTasks(parentTask.id, affectedTaskIds)) {
          await this.markNode(parentTask, parentNode, "needs-decision", parentNode.retryCount, void 0);
          return {
            returnValue: {
              type: "needs-decision",
              nodeId: parentNode.id,
              request: processed.returnValue.request
            },
            eventsProcessed: budget.processedEvents
          };
        }
        const action = await this.routeNeedsDecision(parentTask, parentNode, active.task, processed.returnValue);
        const resumed = await this.handleRoutedAction(parentTask, parentNode, active.task, processed.returnValue, action, budget);
        if (resumed.returnValue.type !== "done") return resumed;
        completed.set(active.task.id, resumed.returnValue);
        continue;
      }
      completed.set(active.task.id, processed.returnValue);
      const conflict = classifySiblingImpact(active.task.id, processed.returnValue.evidence, ownership);
      if (conflict.level === "none") continue;
      if (conflict.level === "soft") {
        await this.loadSiblingContext(parentNode, active.task, conflict);
        continue;
      }
      const quiesced = await this.quiesceAffectedSiblings(
        activeBySession,
        conflict,
        quiesceAttempts
      );
      for (const quiescedTask of quiesced) {
        for (const [sessionId, activeWorker] of activeBySession) {
          if (activeWorker.task.id === quiescedTask.id) activeBySession.delete(sessionId);
        }
      }
      const hardHandled = await this.handleHardConflict(
        parentTask,
        parentNode,
        active.task,
        conflict,
        quiesced,
        budget
      );
      if (hardHandled.returnValue.type !== "done") return hardHandled;
      for (const done of hardHandled.completed) {
        completed.set(done.taskId, done.done);
      }
    }
    const aggregateEvidence = aggregateChildEvidence(Array.from(completed.values()));
    const parentValidation = await this.validation.validate({
      task: parentTask,
      node: nodeRef(parentNode, "running"),
      scope: "parent",
      evidence: aggregateEvidence
    });
    if (parentValidation.status !== "pass") {
      const failed = {
        type: "failed",
        nodeId: parentNode.id,
        retryable: true,
        error: `Parent validation failed: ${parentValidation.reasons.join("; ")}`,
        evidence: simpleEvidence(parentTask.id, "Parent validation rejected wave completion claims.", {
          producedArtifactIds: [parentValidation.report_ref],
          report_ref: parentValidation.report_ref
        })
      };
      for (const [childTaskId, childDone] of completed) {
        const childTask = await this.workSource.getTask(childTaskId);
        const childNode = await this.reloadNode(childTaskId, childDone.nodeId);
        await this.markNode(childTask, childNode, "failed", childNode.retryCount, void 0);
      }
      await this.markNode(parentTask, parentNode, "needs-decision", parentNode.retryCount, void 0);
      return {
        returnValue: {
          type: "needs-decision",
          nodeId: parentNode.id,
          request: {
            decision_id: asDecisionId(`decision:${parentNode.id}:parent-validation:${this.now()}`),
            node_id: parentNode.id,
            task_id: parentTask.id,
            surface: "routing",
            prompt: failed.error,
            context: {
              validationReport: parentValidation.report_ref
            }
          }
        },
        eventsProcessed: budget.processedEvents
      };
    }
    for (const [childTaskId, done] of completed) {
      await this.workSource.markStatus(childTaskId, "done", done.evidence);
    }
    return {
      returnValue: { type: "done", nodeId: parentNode.id, evidence: aggregateEvidence },
      eventsProcessed: budget.processedEvents
    };
  }
  async executeLeafNode(task, parent, budget, resumeInstruction) {
    const node = await this.ensureNode(task, "leaf", parent);
    if (node.status === "done") {
      return {
        returnValue: {
          type: "done",
          nodeId: node.id,
          evidence: latestEvidence(node) ?? simpleEvidence(task.id, `Node ${node.id} already done.`)
        },
        eventsProcessed: budget.processedEvents
      };
    }
    if (node.status === "failed") {
      return {
        returnValue: childFailed(
          node.id,
          `Node ${node.id} is already failed.`,
          false,
          latestEvidence(node)
        ),
        eventsProcessed: budget.processedEvents
      };
    }
    const active = await this.startLeafWorker(task, parent, resumeInstruction);
    let currentNode = active.node;
    while (true) {
      if (budgetExhausted(budget)) {
        return {
          returnValue: childFailed(
            node.id,
            "Supervisor event budget exhausted before a terminal worker return.",
            true,
            latestEvidence(currentNode)
          ),
          eventsProcessed: budget.processedEvents
        };
      }
      const event = await this.agentTransport.readEvent(
        active.session.id,
        this.stallAfterMs === void 0 ? void 0 : { stallAfterMs: this.stallAfterMs }
      );
      budget.processedEvents += 1;
      const processed = await this.processLeafEvent(
        task,
        currentNode,
        active.session,
        event
      );
      if (processed.type === "continue") {
        currentNode = processed.node;
        continue;
      }
      if (processed.type === "done" || processed.type === "needs-decision") {
        return { returnValue: processed.returnValue, eventsProcessed: budget.processedEvents };
      }
      return await this.handleLeafFailure(task, processed.node, processed.returnValue, budget);
    }
  }
  async startLeafWorker(task, parent, resumeInstruction) {
    const node = await this.ensureNode(task, "leaf", parent);
    await this.workSource.markStatus(
      task.id,
      "active",
      simpleEvidence(task.id, `Daimyo leaf node ${node.id} started worker execution.`)
    );
    const session = await this.startWorkerSession(task, node, resumeInstruction);
    return {
      task,
      node: await this.reloadNode(task.id, node.id),
      session
    };
  }
  async processLeafEvent(task, node, session, event) {
    if (event.type === "log") {
      return { type: "continue", node };
    }
    if (event.type === "needs_permission") {
      await this.handlePermissionEvent(task, node, event);
      return { type: "continue", node: await this.reloadNode(task.id, node.id) };
    }
    if (event.type === "needs_input") {
      await this.handleInputEvent(task, node, event);
      return { type: "continue", node: await this.reloadNode(task.id, node.id) };
    }
    if (event.type === "stalled") {
      await this.agentTransport.sendCommand(event.sessionId, {
        type: "interrupt",
        correlationId: event.correlationId,
        reason: `Daimyo interrupted stalled node ${node.id}: ${event.reason}`
      });
      return { type: "continue", node };
    }
    if (event.type === "exited") {
      return {
        type: "failed",
        node,
        returnValue: childFailed(
          node.id,
          `Worker exited (${event.reason}): ${event.message ?? "no message"}`,
          event.reason !== "closed",
          latestEvidence(node)
        )
      };
    }
    const parsed = parseWorkerReturn(event.result, node.id, task.id);
    if (parsed.type === "done") {
      const validation = await this.validation.validate({
        task,
        node: nodeRef(node, "running"),
        scope: "leaf",
        evidence: parsed.evidence
      });
      if (validation.status === "pass") {
        await this.executionStore.appendEvidence(task.id, node.id, parsed.evidence);
        await this.markNode(task, node, "done", node.retryCount, void 0);
        await this.executionStore.setCursor(task.id, null);
        if (node.parentId === void 0) {
          await this.workSource.markStatus(task.id, "done", parsed.evidence);
        }
        await this.agentTransport.disposeSession(session.id);
        return {
          type: "done",
          node: await this.reloadNode(task.id, node.id),
          returnValue: parsed
        };
      }
      return {
        type: "failed",
        node,
        returnValue: {
          type: "failed",
          nodeId: node.id,
          retryable: true,
          error: `Leaf validation failed: ${validation.reasons.join("; ")}`,
          evidence: simpleEvidence(task.id, "Leaf validation rejected worker completion claim.", {
            producedArtifactIds: [validation.report_ref],
            report_ref: validation.report_ref
          })
        }
      };
    }
    if (parsed.type === "needs-decision") {
      await this.markNode(task, node, "needs-decision", node.retryCount, void 0);
      await this.executionStore.setCursor(task.id, {
        nodeId: node.id,
        reason: "awaiting-decision",
        updatedAt: this.now()
      });
      await this.agentTransport.disposeSession(session.id);
      return {
        type: "needs-decision",
        node: await this.reloadNode(task.id, node.id),
        returnValue: parsed
      };
    }
    return {
      type: "failed",
      node,
      returnValue: parsed
    };
  }
  async handleLeafFailure(task, node, failed, budget) {
    if (failed.evidence !== void 0) {
      await this.executionStore.appendEvidence(task.id, node.id, failed.evidence);
    }
    if (node.session !== void 0) {
      await this.agentTransport.disposeSession(node.session.sessionId);
    }
    if (failed.retryable && node.retryCount < this.maxRetries) {
      const retryCount = node.retryCount + 1;
      await this.markNode(task, node, "pending", retryCount, void 0);
      await this.executionStore.setCursor(task.id, {
        nodeId: node.id,
        reason: "recovering",
        updatedAt: this.now()
      });
      return await this.executeLeafNode(
        task,
        node.parentId === void 0 ? void 0 : await this.loadParentNode(node.parentId),
        budget,
        `Retry after failure: ${failed.error}`
      );
    }
    const exhausted = childFailed(node.id, failed.error, false, failed.evidence);
    await this.markNode(task, node, "failed", node.retryCount, void 0);
    await this.executionStore.setCursor(task.id, null);
    await this.workSource.markStatus(
      task.id,
      "blocked",
      simpleEvidence(
        task.id,
        failed.error,
        failed.evidence === void 0 ? {} : { producedArtifactRefs: failed.evidence.produced_artifact_refs }
      )
    );
    return { returnValue: exhausted, eventsProcessed: budget.processedEvents };
  }
  async handleChildFailure(parentTask, parentNode, childTask, failed, budget) {
    const childNode = await this.reloadNode(childTask.id, failed.nodeId);
    if (failed.retryable && childNode.retryCount < this.maxRetries) {
      const retryCount = childNode.retryCount + 1;
      await this.markNode(childTask, childNode, "pending", retryCount, void 0);
      return await this.executeNode(childTask, parentNode, budget, `Retry after failure: ${failed.error}`);
    }
    await this.markNode(childTask, childNode, "failed", childNode.retryCount, void 0);
    const request = {
      decision_id: asDecisionId(`decision:${parentNode.id}:failed:${failed.nodeId}:${this.now()}`),
      node_id: parentNode.id,
      task_id: parentTask.id,
      surface: "routing",
      prompt: `Child ${failed.nodeId} failed after bounded retries: ${failed.error}`,
      context: {
        affectedNodeId: failed.nodeId,
        affectedTaskId: childTask.id,
        childError: failed.error
      }
    };
    const record = await this.decisionProvider.decideRouting(request, {
      agentTransport: this.agentTransport,
      cwd: this.cwd
    });
    await this.persistDecisionRecord(record);
    await this.markNode(parentTask, parentNode, "needs-decision", parentNode.retryCount, void 0);
    return {
      returnValue: {
        type: "needs-decision",
        nodeId: parentNode.id,
        request
      },
      eventsProcessed: budget.processedEvents
    };
  }
  async routeNeedsDecision(parentTask, parentNode, childTask, childReturn) {
    const request = {
      decision_id: asDecisionId(`decision:${parentNode.id}:routing:${childReturn.nodeId}:${this.now()}`),
      node_id: parentNode.id,
      task_id: parentTask.id,
      surface: "routing",
      prompt: childReturn.request.prompt,
      ...childReturn.request.surface === "routing" && childReturn.request.options !== void 0 ? { options: childReturn.request.options } : {},
      context: {
        affectedNodeId: childReturn.nodeId,
        affectedTaskId: childTask.id,
        originalDecisionId: childReturn.request.decision_id,
        ...childReturn.request.context === void 0 ? {} : childReturn.request.context
      }
    };
    const record = await this.decisionProvider.decideRouting(request, {
      agentTransport: this.agentTransport,
      cwd: this.cwd
    });
    await this.persistDecisionRecord(record);
    return await this.applyDecisionAction(record, childTask, childReturn.nodeId);
  }
  async handleRoutedAction(parentTask, parentNode, childTask, childReturn, action, budget) {
    if (action.type === "await-human") {
      await this.markNode(parentTask, parentNode, "awaiting-human", parentNode.retryCount, void 0);
      await this.reconcileAtCheckpoint();
      return {
        returnValue: {
          type: "needs-decision",
          nodeId: parentNode.id,
          request: action.record.payload.request
        },
        eventsProcessed: budget.processedEvents
      };
    }
    if (action.type === "create-follow-up") {
      const evidence = simpleEvidence(
        childTask.id,
        `Large decision ${decisionRecordId(action.record)} was extracted to follow-up task ${action.followUpTaskId}.`
      );
      await this.executionStore.appendEvidence(childTask.id, childReturn.nodeId, evidence);
      await this.markNode(childTask, await this.reloadNode(childTask.id, childReturn.nodeId), "done", 0, void 0);
      await this.workSource.markStatus(childTask.id, "done", evidence);
      await this.reconcileAtCheckpoint();
      return {
        returnValue: { type: "done", nodeId: childReturn.nodeId, evidence },
        eventsProcessed: budget.processedEvents
      };
    }
    const patchedChildTask = await this.workSource.getTask(childTask.id);
    const resumed = await this.executeNode(patchedChildTask, parentNode, budget, action.instruction);
    await this.reconcileAtCheckpoint();
    return resumed;
  }
  async loadSiblingContext(parentNode, sourceTask, conflict) {
    for (const taskId of conflict.affectedTaskIds) {
      const task = await this.workSource.getTask(taskId);
      const evidence = simpleEvidence(
        task.id,
        `Soft sibling impact from ${sourceTask.id}: ${conflict.reason}`
      );
      await this.executionStore.appendEvidence(task.id, nodeIdForTask(task.id), evidence);
      await this.workSource.patchTask(
        task.id,
        {
          body: [
            task.body,
            "",
            "## Daimyo Sibling Context",
            "",
            `Parent ${parentNode.id} detected soft impact from ${sourceTask.id}: ${conflict.reason}`
          ].join("\n"),
          metadata: {
            ...task.metadata ?? {},
            daimyo_last_sibling_context: {
              source_task_id: sourceTask.id,
              conflict: conflict.level,
              reason: conflict.reason
            }
          }
        },
        evidence
      );
    }
  }
  async quiesceAffectedSiblings(activeBySession, conflict, quiesceAttempts) {
    const quiesced = [];
    const affected = new Set(conflict.affectedTaskIds);
    for (const active of activeBySession.values()) {
      if (!affected.has(active.task.id)) continue;
      const attemptKey = `${active.task.id}:${conflict.reason}`;
      const attempts = (quiesceAttempts.get(attemptKey) ?? 0) + 1;
      quiesceAttempts.set(attemptKey, attempts);
      if (attempts > this.maxQuiesceAttempts) continue;
      const interrupt = await this.agentTransport.interruptSession(
        active.session.id,
        `Hard sibling conflict detected by Daimyo parent: ${conflict.reason}`
      );
      if (interrupt.workProduct !== void 0) {
        await this.executionStore.appendEvidence(active.task.id, active.node.id, interrupt.workProduct);
      }
      await this.markNode(active.task, active.node, "pending", active.node.retryCount, active.node.session);
      quiesced.push(active.task);
    }
    return quiesced;
  }
  async handleHardConflict(parentTask, parentNode, sourceTask, conflict, quiescedTasks, budget) {
    if (quiescedTasks.length !== conflict.affectedTaskIds.length) {
      const request = {
        decision_id: asDecisionId(`decision:${parentNode.id}:quiesce:${stablePromptId(conflict.reason)}:${this.now()}`),
        node_id: parentNode.id,
        task_id: parentTask.id,
        surface: "routing",
        prompt: `Hard sibling conflict could not be bounded for resume: ${conflict.reason}`,
        context: {
          sourceTaskId: sourceTask.id,
          affectedTaskIds: [...conflict.affectedTaskIds],
          reason: conflict.reason
        }
      };
      await this.markNode(parentTask, parentNode, "needs-decision", parentNode.retryCount, void 0);
      return {
        returnValue: { type: "needs-decision", nodeId: parentNode.id, request },
        eventsProcessed: budget.processedEvents,
        completed: []
      };
    }
    const completed = [];
    for (const affectedTask of quiescedTasks) {
      const request = {
        decision_id: asDecisionId(`decision:${parentNode.id}:sibling-impact:${affectedTask.id}:${this.now()}`),
        node_id: parentNode.id,
        task_id: parentTask.id,
        surface: "routing",
        prompt: `Patch and resume ${affectedTask.id} after hard sibling impact from ${sourceTask.id}: ${conflict.reason}`,
        context: {
          sourceTaskId: sourceTask.id,
          affectedTaskId: affectedTask.id,
          affectedTaskIds: [...conflict.affectedTaskIds],
          conflict: conflict.level,
          reason: conflict.reason
        }
      };
      const record = await this.decisionProvider.decideRouting(request, {
        agentTransport: this.agentTransport,
        cwd: this.cwd
      });
      await this.persistDecisionRecord(record);
      const action = await this.applyDecisionAction(record, affectedTask, nodeIdForTask(affectedTask.id));
      const childReturn = {
        type: "needs-decision",
        nodeId: nodeIdForTask(affectedTask.id),
        request
      };
      const resumed = await this.handleRoutedAction(
        parentTask,
        parentNode,
        affectedTask,
        childReturn,
        action,
        budget
      );
      if (resumed.returnValue.type !== "done") {
        return { ...resumed, completed };
      }
      completed.push({
        taskId: affectedTask.id,
        done: {
          type: "done",
          nodeId: resumed.returnValue.nodeId,
          evidence: resumed.returnValue.evidence
        }
      });
    }
    return {
      returnValue: {
        type: "done",
        nodeId: parentNode.id,
        evidence: simpleEvidence(
          parentTask.id,
          `Resolved hard sibling conflict from ${sourceTask.id}: ${conflict.reason}`
        )
      },
      eventsProcessed: budget.processedEvents,
      completed
    };
  }
  async applyDecisionAction(record, childTask, affectedNodeId) {
    const selection = selectDecisionAction(record, this.autonomyProfile);
    await this.recordActionDecision(record, selection, affectedNodeId);
    if (selection.type === "await-human") {
      return {
        type: "await-human",
        record,
        affectedNodeId,
        affectedTaskId: childTask.id,
        instruction: selection.reason
      };
    }
    if (selection.type === "create-follow-up") {
      const followUpTaskId = await this.workSource.createTask(selection.task, childTask.parentId);
      await this.executionStore.appendEvidence(
        childTask.id,
        affectedNodeId,
        simpleEvidence(
          childTask.id,
          `Created follow-up task ${followUpTaskId} for large decision ${decisionRecordId(record)}.`
        )
      );
      return {
        type: "create-follow-up",
        record,
        affectedNodeId,
        affectedTaskId: childTask.id,
        followUpTaskId
      };
    }
    const instruction = selection.instruction;
    const patchEvidence = simpleEvidence(
      childTask.id,
      `Applied decision patch ${decisionRecordId(record)}: ${instruction}`
    );
    await this.executionStore.appendEvidence(childTask.id, affectedNodeId, patchEvidence);
    await this.workSource.patchTask(
      childTask.id,
      {
        body: patchedTaskBody(childTask, record, instruction),
        metadata: patchedTaskMetadata(childTask, record)
      },
      patchEvidence
    );
    await this.workSource.markStatus(childTask.id, "active", patchEvidence);
    const affectedNode = await this.reloadNode(childTask.id, affectedNodeId);
    await this.markNode(childTask, affectedNode, "pending", 0, affectedNode.session);
    return {
      type: "patch-and-resume",
      record,
      affectedNodeId,
      affectedTaskId: childTask.id,
      instruction
    };
  }
  async handlePermissionEvent(task, node, event) {
    const request = {
      decision_id: asDecisionId(`decision:${node.id}:permission:${event.correlationId}`),
      node_id: node.id,
      task_id: task.id,
      surface: "permission",
      tool_name: event.toolName,
      arguments: event.arguments,
      prompt: event.prompt ?? `May worker ${node.id} use ${event.toolName}?`,
      ...event.origin === void 0 ? {} : { context: event.origin }
    };
    const record = await this.decisionProvider.decidePermission(request, {
      agentTransport: this.agentTransport,
      cwd: this.cwd
    });
    await this.persistDecisionRecord(record);
    await this.agentTransport.sendCommand(
      event.sessionId,
      permissionCommand(event.correlationId, record)
    );
  }
  async handleInputEvent(task, node, event) {
    const request = {
      decision_id: asDecisionId(`decision:${node.id}:input:${event.correlationId}`),
      node_id: node.id,
      task_id: task.id,
      surface: "routing",
      prompt: event.prompt,
      ...event.options === void 0 ? {} : { options: [...event.options] }
    };
    const record = await this.decisionProvider.decideRouting(request, {
      agentTransport: this.agentTransport,
      cwd: this.cwd
    });
    await this.persistDecisionRecord(record);
    await this.agentTransport.sendCommand(event.sessionId, inputCommand(event.correlationId, event.options, record));
  }
  async startWorkerSession(task, node, resumeInstruction) {
    const evidence = node.evidence;
    const resumeFromSessionId = node.session === void 0 || workerRequiresRestart(node) ? void 0 : node.session.sessionId;
    const request = {
      nodeId: node.id,
      prompt: workerPrompt(task, node, evidence, resumeInstruction, resumeFromSessionId !== void 0),
      cwd: this.cwd,
      ...resumeFromSessionId === void 0 ? {} : { resumeFromSessionId },
      metadata: {
        taskId: task.id,
        nodeType: node.type
      }
    };
    try {
      const session = await this.agentTransport.spawnSession(request);
      await this.markNode(task, node, "running", node.retryCount, {
        sessionId: session.id,
        resumeToken: session.id,
        tokenStatus: "resumable"
      });
      await this.executionStore.setCursor(task.id, {
        nodeId: node.id,
        reason: "running",
        updatedAt: this.now()
      });
      return session;
    } catch (error) {
      if (!(error instanceof AgentSessionResumeRejectedError) || resumeFromSessionId === void 0) {
        throw error;
      }
      await this.executionStore.invalidateResumeToken(task.id, node.id, error.message, this.now());
      const restartedNode = await this.reloadNode(task.id, node.id);
      const restarted = await this.agentTransport.spawnSession({
        nodeId: node.id,
        prompt: workerPrompt(task, restartedNode, restartedNode.evidence, resumeInstruction, false),
        cwd: this.cwd,
        metadata: {
          taskId: task.id,
          nodeType: node.type,
          restartedAfterInvalidResumeToken: true
        }
      });
      await this.markNode(task, restartedNode, "running", restartedNode.retryCount, {
        sessionId: restarted.id,
        resumeToken: restarted.id,
        tokenStatus: "resumable"
      });
      return restarted;
    }
  }
  async reconcileAtCheckpoint() {
    const summaries = await this.workSource.listTasks();
    const executionTaskIds = await this.executionStore.listTaskIds();
    const taskIds = uniqueTaskIds([
      ...summaries.map((summary) => summary.id),
      ...executionTaskIds
    ]);
    const snapshots = await Promise.all(taskIds.map((taskId) => this.executionStore.load(taskId)));
    const nodes = snapshots.flatMap((snapshot) => snapshot.nodes);
    const executionSnapshot = {
      nodes: nodes.map((node) => reconciliationNodeSnapshot(node))
    };
    const workSnapshot = await this.workSourceSnapshot(summaries, nodes);
    const actions = reconcileCheckpoints(workSnapshot, executionSnapshot);
    for (const action of actions) {
      await this.applyReconciliationAction(action, nodes);
    }
  }
  async workSourceSnapshot(summaries, nodes) {
    const parentTaskIds = new Set(
      summaries.map((summary) => summary.parentId).filter((parentId) => parentId !== void 0)
    );
    const tasks = [];
    for (const summary of summaries) {
      const node = nodes.find(
        (candidate) => candidate.taskId === summary.id && candidate.status !== "cancelled" && candidate.status !== "superseded"
      );
      const needsDefinitionRead = node === void 0 || node.workSourceRevision !== summary.revision || node.workDefinitionFingerprint === void 0;
      const definitionFingerprint = needsDefinitionRead ? workDefinitionFingerprint(await this.workSource.getTask(summary.id)) : node.workDefinitionFingerprint;
      tasks.push({
        id: summary.id,
        status: summary.status,
        revision: summary.revision,
        type: parentTaskIds.has(summary.id) ? "inner" : "leaf",
        ...summary.parentId === void 0 ? {} : { parentTaskId: summary.parentId },
        definitionFingerprint
      });
    }
    return { tasks };
  }
  async applyReconciliationAction(action, nodes) {
    if (action.type === "schedule-node") {
      await this.executionStore.upsertNode(action.taskId, {
        id: action.nodeId,
        taskId: action.taskId,
        type: action.nodeType,
        status: "pending",
        retryCount: 0,
        ...action.parentNodeId === void 0 ? {} : { parentId: action.parentNodeId },
        workSourceRevision: action.workSourceRevision,
        ...action.workDefinitionFingerprint === void 0 ? {} : { workDefinitionFingerprint: action.workDefinitionFingerprint }
      });
      return;
    }
    const node = requireReconciliationNode(nodes, action.nodeId);
    if (action.type === "cancel-node") {
      await this.executionStore.upsertNode(action.taskId, {
        ...executionNodeInput(node),
        status: "cancelled"
      });
      await this.executionStore.appendEvidence(
        action.taskId,
        action.nodeId,
        simpleEvidence(
          action.taskId,
          `Checkpoint reconciliation cancelled node ${action.nodeId}: task disappeared from WorkSource.`
        )
      );
      return;
    }
    if (action.type === "drop-from-queue") {
      await this.executionStore.upsertNode(action.taskId, {
        ...executionNodeInput(node),
        status: "done",
        workSourceRevision: action.workSourceRevision,
        ...action.workDefinitionFingerprint === void 0 ? {} : { workDefinitionFingerprint: action.workDefinitionFingerprint }
      });
      await this.executionStore.appendEvidence(
        action.taskId,
        action.nodeId,
        simpleEvidence(
          action.taskId,
          `Checkpoint reconciliation dropped node ${action.nodeId}: task was externally marked done.`
        )
      );
      return;
    }
    if (action.type === "mark-stale") {
      await this.executionStore.upsertNode(action.taskId, {
        ...executionNodeInput(node),
        status: "pending",
        retryCount: 0,
        workSourceRevision: action.workSourceRevision,
        workDefinitionFingerprint: action.workDefinitionFingerprint
      });
      await this.executionStore.appendEvidence(
        action.taskId,
        action.nodeId,
        simpleEvidence(
          action.taskId,
          `Checkpoint reconciliation marked node ${action.nodeId} stale after WorkSource definition changed; existing work product was not reverted.`
        )
      );
      return;
    }
    if (action.type === "refresh-observed-revision") {
      await this.executionStore.upsertNode(action.taskId, {
        ...executionNodeInput(node),
        workSourceRevision: action.workSourceRevision,
        ...action.workDefinitionFingerprint === void 0 ? {} : { workDefinitionFingerprint: action.workDefinitionFingerprint }
      });
      return;
    }
    const interrupt = await this.agentTransport.interruptSession(
      action.sessionId,
      `Checkpoint reconciliation superseded node ${action.nodeId}: ${action.reason}.`
    );
    if (interrupt.workProduct !== void 0) {
      await this.executionStore.appendEvidence(action.taskId, action.nodeId, interrupt.workProduct);
    }
    await this.executionStore.upsertNode(action.taskId, {
      ...executionNodeInput(node),
      status: "superseded"
    });
    await this.executionStore.appendEvidence(
      action.taskId,
      action.nodeId,
      simpleEvidence(
        action.taskId,
        `Checkpoint reconciliation marked node ${action.nodeId} superseded after ${action.reason}.`
      )
    );
    await this.agentTransport.disposeSession(action.sessionId);
    if (action.replacement !== void 0) {
      await this.executionStore.upsertNode(action.taskId, {
        id: action.replacement.nodeId,
        taskId: action.taskId,
        type: action.replacement.nodeType,
        status: "pending",
        retryCount: 0,
        ...node.parentId === void 0 ? {} : { parentId: node.parentId },
        workSourceRevision: action.replacement.workSourceRevision,
        workDefinitionFingerprint: action.replacement.workDefinitionFingerprint
      });
    }
  }
  async ensureNode(task, type, parent) {
    const snapshot = await this.executionStore.load(task.id);
    const existing = snapshot.nodes.find(
      (candidate) => candidate.taskId === task.id && candidate.status !== "cancelled" && candidate.status !== "superseded"
    );
    if (existing !== void 0) {
      if (existing.parentId === void 0 && parent !== void 0) {
        await this.executionStore.upsertNode(task.id, {
          ...executionNodeInput(existing),
          parentId: parent.id
        });
        return await this.reloadNode(task.id, existing.id);
      }
      return existing;
    }
    const input = {
      id: nodeIdForTask(task.id),
      taskId: task.id,
      type,
      status: "pending",
      retryCount: 0,
      ...parent === void 0 ? {} : { parentId: parent.id },
      workSourceRevision: task.revision,
      workDefinitionFingerprint: workDefinitionFingerprint(task)
    };
    await this.executionStore.upsertNode(task.id, input);
    return await this.reloadNode(task.id, input.id);
  }
  async markNode(task, node, status, retryCount, session) {
    await this.executionStore.upsertNode(task.id, {
      id: node.id,
      taskId: task.id,
      type: node.type,
      status,
      retryCount,
      ...node.parentId === void 0 ? {} : { parentId: node.parentId },
      ...session === void 0 ? {} : { session },
      ...node.workSourceRevision === void 0 ? {} : { workSourceRevision: node.workSourceRevision },
      ...node.workDefinitionFingerprint === void 0 ? {} : { workDefinitionFingerprint: node.workDefinitionFingerprint }
    });
  }
  async reloadNode(taskId, nodeId) {
    const snapshot = await this.executionStore.load(taskId);
    const node = snapshot.nodes.find((candidate) => candidate.id === nodeId);
    if (node === void 0) throw new Error(`Supervisor could not reload node ${nodeId}`);
    return node;
  }
  async loadParentNode(parentId) {
    const tasks = await this.workSource.listTasks();
    for (const task of tasks) {
      const snapshot = await this.executionStore.load(task.id);
      const node = snapshot.nodes.find((candidate) => candidate.id === parentId);
      if (node !== void 0) return node;
    }
    return void 0;
  }
  async childTasks(parentId) {
    const tasks = await this.workSource.listTasks();
    return tasks.filter((task) => task.parentId === parentId && task.status !== "done").sort((left, right) => left.id.localeCompare(right.id));
  }
  async nodeOwnsAffectedTasks(parentTaskId, affectedTaskIds) {
    const summaries = await this.workSource.listTasks();
    const byParent = /* @__PURE__ */ new Map();
    for (const summary of summaries) {
      if (summary.parentId === void 0) continue;
      const siblings = byParent.get(summary.parentId) ?? [];
      siblings.push(summary);
      byParent.set(summary.parentId, siblings);
    }
    const owned = /* @__PURE__ */ new Set([parentTaskId]);
    const queue = [parentTaskId];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === void 0) break;
      for (const child of byParent.get(current) ?? []) {
        owned.add(child.id);
        queue.push(child.id);
      }
    }
    return affectedTaskIds.every((taskId) => owned.has(taskId));
  }
  async persistDecisionRecord(record) {
    await this.executionStore.recordDecision(
      asTaskId(record.payload.request.task_id),
      nodeIdForString(record.payload.request.node_id),
      record
    );
  }
  async recordActionDecision(source, selection, affectedNodeId) {
    const record = makeDecisionRecord({
      decision_id: asDecisionId(`${source.payload.decision_id}:action:${selection.type}`),
      request: source.payload.request,
      verdict: source.payload.verdict,
      tier: source.payload.tier,
      rationale: `Decision action ${selection.type} selected for ${affectedNodeId} (${selection.size} decision).`,
      created_at: this.now()
    });
    await this.executionStore.recordDecision(
      asTaskId(source.payload.request.task_id),
      nodeIdForString(source.payload.request.node_id),
      record
    );
  }
};
function nodeIdForTask(taskId) {
  return defaultNodeIdForTask(taskId);
}
function nodeIdForString(nodeId) {
  return asNodeId(nodeId);
}
function uniqueTaskIds(taskIds) {
  return Array.from(new Set(taskIds)).sort((left, right) => left.localeCompare(right));
}
function reconciliationNodeSnapshot(node) {
  const evidence = latestEvidence(node);
  return {
    id: node.id,
    taskId: node.taskId,
    type: node.type,
    status: node.status,
    retryCount: node.retryCount,
    ...node.parentId === void 0 ? {} : { parentId: node.parentId },
    ...node.session === void 0 ? {} : { sessionId: node.session.sessionId },
    ...node.workSourceRevision === void 0 ? {} : { workSourceRevision: node.workSourceRevision },
    ...node.workDefinitionFingerprint === void 0 ? {} : { workDefinitionFingerprint: node.workDefinitionFingerprint },
    ...evidence === void 0 ? {} : { latestEvidence: evidence }
  };
}
function executionNodeInput(node) {
  return {
    id: node.id,
    taskId: node.taskId,
    type: node.type,
    status: node.status,
    retryCount: node.retryCount,
    ...node.parentId === void 0 ? {} : { parentId: node.parentId },
    ...node.session === void 0 ? {} : { session: node.session },
    ...node.workSourceRevision === void 0 ? {} : { workSourceRevision: node.workSourceRevision },
    ...node.workDefinitionFingerprint === void 0 ? {} : { workDefinitionFingerprint: node.workDefinitionFingerprint }
  };
}
function requireReconciliationNode(nodes, nodeId) {
  const node = nodes.find((candidate) => candidate.id === nodeId);
  if (node === void 0) throw new Error(`Reconciliation action referenced unknown node ${nodeId}`);
  return node;
}
function nodeRef(node, status) {
  return {
    id: node.id,
    taskId: node.taskId,
    type: node.type,
    status,
    ...node.parentId === void 0 ? {} : { parentId: node.parentId }
  };
}
function latestEvidence(node) {
  return node.evidence[node.evidence.length - 1];
}
function simpleEvidence(taskId, summary, options = {}) {
  return makeExecutionEvidence({
    taskId,
    summary,
    ...options.producedArtifactRefs === void 0 ? {} : { producedArtifactRefs: options.producedArtifactRefs },
    ...options.producedArtifactIds === void 0 ? {} : { producedArtifactIds: options.producedArtifactIds },
    ...options.report_ref === void 0 ? {} : { report_ref: options.report_ref }
  });
}
function sortedSessionIds(activeBySession) {
  return Array.from(activeBySession.keys()).sort((left, right) => {
    const leftTask = activeBySession.get(left)?.task.id ?? "";
    const rightTask = activeBySession.get(right)?.task.id ?? "";
    return leftTask.localeCompare(rightTask);
  });
}
function ownershipSurface(task) {
  const metadata = task.metadata ?? {};
  return {
    taskId: task.id,
    ownsFiles: readMetadataStringArray(metadata, "owns_files", "ownsFiles"),
    ownsInterfaces: readMetadataStringArray(metadata, "owns_interfaces", "ownsInterfaces"),
    ownsData: readMetadataStringArray(metadata, "owns_data", "ownsData"),
    ownsWorkflowSteps: readMetadataStringArray(metadata, "owns_workflow_steps", "ownsWorkflowSteps"),
    dependsOn: readMetadataStringArray(metadata, "depends_on", "dependsOn")
  };
}
function classifySiblingImpact(sourceTaskId, evidence, ownership) {
  const sourceSurface = ownership.get(sourceTaskId);
  const touchedFiles = uniqueStrings([
    ...evidence.touch_report.touched_files,
    ...evidence.intended_files ?? []
  ]);
  const touchedInterfaces = uniqueStrings([
    ...evidence.touch_report.touched_interfaces,
    ...evidence.intended_interfaces ?? []
  ]);
  const touchedData = uniqueStrings([
    ...evidence.touch_report.touched_data,
    ...evidence.intended_data ?? []
  ]);
  const hardAffected = /* @__PURE__ */ new Set();
  const softAffected = /* @__PURE__ */ new Set();
  const hardReasons = [];
  const softReasons = [];
  for (const [taskId, surface] of ownership) {
    if (taskId === sourceTaskId) continue;
    const fileOverlap = intersection(touchedFiles, surface.ownsFiles);
    const interfaceOverlap = intersection(touchedInterfaces, surface.ownsInterfaces);
    const dataOverlap = intersection(touchedData, surface.ownsData);
    const staticInterfaceOverlap = sourceSurface === void 0 ? [] : intersection(sourceSurface.ownsInterfaces, surface.ownsInterfaces);
    if (fileOverlap.length > 0 || interfaceOverlap.length > 0 || dataOverlap.length > 0 || staticInterfaceOverlap.length > 0) {
      hardAffected.add(taskId);
      hardReasons.push(
        describeOverlap(taskId, "hard", [
          ...fileOverlap.map((value) => `file:${value}`),
          ...interfaceOverlap.map((value) => `interface:${value}`),
          ...dataOverlap.map((value) => `data:${value}`),
          ...staticInterfaceOverlap.map((value) => `shared-interface:${value}`)
        ])
      );
      continue;
    }
    const dependencyImpact = intersection(
      surface.dependsOn,
      uniqueStrings([
        ...touchedFiles,
        ...touchedInterfaces,
        ...touchedData,
        ...sourceSurface?.ownsFiles ?? [],
        ...sourceSurface?.ownsInterfaces ?? [],
        ...sourceSurface?.ownsData ?? []
      ])
    );
    if (dependencyImpact.length > 0) {
      softAffected.add(taskId);
      softReasons.push(describeOverlap(taskId, "soft", dependencyImpact));
    }
  }
  if (hardAffected.size > 0) {
    return {
      level: "hard",
      affectedTaskIds: Array.from(hardAffected).sort((left, right) => left.localeCompare(right)),
      reason: hardReasons.join("; ")
    };
  }
  if (softAffected.size > 0) {
    return {
      level: "soft",
      affectedTaskIds: Array.from(softAffected).sort((left, right) => left.localeCompare(right)),
      reason: softReasons.join("; ")
    };
  }
  return {
    level: "none",
    affectedTaskIds: [],
    reason: "no sibling ownership or dependency overlap"
  };
}
function aggregateChildEvidence(children) {
  const taskId = children[0]?.evidence.touch_report.task_id ?? "wave";
  return makeExecutionEvidence({
    taskId: asTaskId(taskId),
    summary: `Wave children claimed done: ${children.map((child) => child.nodeId).join(", ")}`,
    producedArtifactRefs: uniqueArtifactReferences(children.flatMap((child) => child.evidence.produced_artifact_refs)),
    touchedFiles: uniqueStrings(children.flatMap((child) => child.evidence.touch_report.touched_files)),
    touchedInterfaces: uniqueStrings(children.flatMap((child) => child.evidence.touch_report.touched_interfaces)),
    touchedData: uniqueStrings(children.flatMap((child) => child.evidence.touch_report.touched_data)),
    touchedWorkflowSteps: uniqueStrings(children.flatMap((child) => child.evidence.touch_report.touched_workflow_steps)),
    intendedFiles: uniqueStrings(children.flatMap((child) => child.evidence.intended_files ?? [])),
    intendedInterfaces: uniqueStrings(children.flatMap((child) => child.evidence.intended_interfaces ?? [])),
    intendedData: uniqueStrings(children.flatMap((child) => child.evidence.intended_data ?? []))
  });
}
function decisionAffectedTaskIds(context) {
  if (context === void 0) return [];
  const values = [
    ...jsonStringArray(context.affectedTaskIds),
    ...jsonStringArray(context.affected_task_ids)
  ];
  const single = context.affectedTaskId ?? context.affected_task_id;
  if (typeof single === "string") values.push(single);
  return uniqueStrings(values).map((value) => asTaskId(value));
}
function readMetadataStringArray(metadata, snakeKey, camelKey) {
  return uniqueStrings([...jsonStringArray(metadata[snakeKey]), ...jsonStringArray(metadata[camelKey])]);
}
function jsonStringArray(value) {
  if (value === void 0) return [];
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => typeof entry === "string");
}
function intersection(left, right) {
  const rightSet = new Set(right);
  return uniqueStrings(left.filter((value) => rightSet.has(value)));
}
function uniqueStrings(values) {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}
function uniqueArtifactReferences(values) {
  const byId = /* @__PURE__ */ new Map();
  for (const value of values) {
    byId.set(`${value.ref_type}:${value.id}:${value.relation ?? ""}`, value);
  }
  return Array.from(byId.values()).sort((left, right) => left.id.localeCompare(right.id));
}
function describeOverlap(taskId, level, values) {
  return `${level} impact on ${taskId}${values.length === 0 ? "" : ` via ${values.join(", ")}`}`;
}
function patchedTaskBody(task, record, instruction) {
  return [
    task.body,
    "",
    "## Daimyo Decision Patch",
    "",
    `Decision ${decisionRecordId(record)}: ${instruction}`
  ].join("\n");
}
function patchedTaskMetadata(task, record) {
  return {
    ...task.metadata ?? {},
    daimyo_last_decision_patch: {
      decision_id: decisionRecordId(record),
      action: "patch-and-resume",
      instruction: verdictInstruction(record.payload.verdict)
    }
  };
}
function childFailed(nodeId, error, retryable, evidence) {
  return {
    type: "failed",
    nodeId,
    error,
    retryable,
    ...evidence === void 0 ? {} : { evidence }
  };
}
function budgetExhausted(budget) {
  return budget.maxEvents !== void 0 && budget.processedEvents >= budget.maxEvents;
}
function childReturnToRunStatus(value) {
  if (value.type === "done") return "done";
  if (value.type === "needs-decision") return "needs-decision";
  return value.retryable ? "paused" : "failed";
}
function permissionCommand(correlationId, record) {
  const choice = record.payload.verdict.suggested_choice;
  if (record.payload.verdict.type === "access" && (choice === "allow" || choice === "approve" || choice === "approved")) {
    return {
      type: "approve",
      correlationId,
      reason: record.payload.verdict.suggested_response ?? record.payload.rationale
    };
  }
  return {
    type: "deny",
    correlationId,
    reason: record.payload.verdict.suggested_response ?? record.payload.rationale
  };
}
function inputCommand(correlationId, options, record) {
  const choice = record.payload.verdict.suggested_choice;
  if (choice !== null && options?.includes(choice) === true) {
    return {
      type: "choose_option",
      correlationId,
      option: choice
    };
  }
  return {
    type: "respond",
    correlationId,
    response: record.payload.verdict.suggested_response ?? choice ?? record.payload.rationale
  };
}
function workerPrompt(task, node, evidence, resumeInstruction, resuming) {
  return [
    `Daimyo ${resuming ? "resume" : "start"} for leaf node ${node.id}.`,
    "You are a disposable worker. Implement only this task, run local checks, and return only JSON.",
    `Task: ${task.title}`,
    task.body,
    `Acceptance criteria:
${task.acceptanceCriteria.map((criterion) => `- ${criterion}`).join("\n")}`,
    `Ownership surface:
${JSON.stringify(ownershipSurface(task))}`,
    resumeInstruction === void 0 ? "" : `Parent decision/retry instruction:
${resumeInstruction}`,
    evidence.length === 0 ? "Prior evidence: none" : `Prior evidence:
${evidence.map((item) => `- ${item.summary}`).join("\n")}`,
    "Return contract JSON:",
    '{"type":"done","evidence":{"summary":"...","produced_artifact_refs":[],"touch_report":{"touched_files":[],"touched_interfaces":[],"touched_data":[],"touched_workflow_steps":[]},"intended_files":[],"intended_interfaces":[],"intended_data":[]}}',
    '{"type":"needs-decision","prompt":"...","options":[],"context":{}}',
    '{"type":"failed","error":"...","retryable":true,"evidence":{"summary":"..."}}'
  ].filter((part) => part.length > 0).join("\n\n");
}
function parseWorkerReturn(result, nodeId, taskId) {
  const parsed = JSON.parse(result);
  const object = readObjectValue2(parsed, "worker return");
  const type = readString3(object, "type");
  if (type === "done") {
    return {
      type,
      nodeId,
      evidence: readEvidence2(readObject2(object, "evidence"), taskId)
    };
  }
  if (type === "needs-decision") {
    const options = readOptionalStringArray3(object, "options");
    const context = readOptionalObject2(object, "context");
    const decisionId = asDecisionId(`decision:${nodeId}:worker:${stablePromptId(readString3(object, "prompt"))}`);
    return {
      type,
      nodeId,
      request: {
        decision_id: decisionId,
        node_id: nodeId,
        task_id: taskId,
        surface: "routing",
        prompt: readString3(object, "prompt"),
        ...options === void 0 ? {} : { options: [...options] },
        ...context === void 0 ? {} : { context }
      }
    };
  }
  if (type === "failed") {
    const evidence = readOptionalObject2(object, "evidence");
    return {
      type,
      nodeId,
      error: readString3(object, "error"),
      retryable: readBoolean4(object, "retryable"),
      ...evidence === void 0 ? {} : { evidence: readEvidence2(evidence, taskId) }
    };
  }
  throw new Error(`Unknown worker return type: ${type}`);
}
function stablePromptId(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "request";
}
function readEvidence2(value, taskId) {
  const touchReport = readOptionalObject2(value, "touch_report");
  const touchedFiles = touchReport === void 0 ? readOptionalStringArray3(value, "touchedFiles") : readOptionalStringArray3(touchReport, "touched_files");
  const touchedInterfaces = touchReport === void 0 ? readOptionalStringArray3(value, "touchedInterfaces") : readOptionalStringArray3(touchReport, "touched_interfaces");
  const touchedData = touchReport === void 0 ? readOptionalStringArray3(value, "touchedData") : readOptionalStringArray3(touchReport, "touched_data");
  const touchedWorkflowSteps = touchReport === void 0 ? [] : readOptionalStringArray3(touchReport, "touched_workflow_steps") ?? [];
  const intendedFiles = readOptionalStringArray3(value, "intended_files") ?? readOptionalStringArray3(value, "intendedFiles");
  const intendedInterfaces = readOptionalStringArray3(value, "intended_interfaces") ?? readOptionalStringArray3(value, "intendedInterfaces");
  const intendedData = readOptionalStringArray3(value, "intended_data") ?? readOptionalStringArray3(value, "intendedData");
  const reportRef = readOptionalString3(value, "report_ref");
  const touchReportTaskId = touchReport === void 0 ? taskId : asTaskId(readOptionalString3(touchReport, "task_id") ?? taskId);
  return makeExecutionEvidence({
    taskId: touchReportTaskId,
    summary: readString3(value, "summary"),
    ...readOptionalArtifactReferences(value, "produced_artifact_refs") === void 0 ? {} : { producedArtifactRefs: readOptionalArtifactReferences(value, "produced_artifact_refs") ?? [] },
    ...readOptionalStringArray3(value, "artifacts") === void 0 ? {} : { producedArtifactIds: readOptionalStringArray3(value, "artifacts") ?? [] },
    ...touchedFiles === void 0 ? {} : { touchedFiles },
    ...touchedInterfaces === void 0 ? {} : { touchedInterfaces },
    ...touchedData === void 0 ? {} : { touchedData },
    touchedWorkflowSteps,
    ...intendedFiles === void 0 ? {} : { intendedFiles },
    ...intendedInterfaces === void 0 ? {} : { intendedInterfaces },
    ...intendedData === void 0 ? {} : { intendedData },
    ...reportRef === void 0 ? {} : { report_ref: reportRef }
  });
}
function readObject2(source, key) {
  return readObjectValue2(source[key], key);
}
function readOptionalObject2(source, key) {
  const value = source[key];
  if (value === void 0) return void 0;
  return readObjectValue2(value, key);
}
function readObjectValue2(value, label) {
  if (isJsonObject6(value)) return value;
  throw new Error(`Expected ${label} to be an object`);
}
function isJsonObject6(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function readString3(source, key) {
  const value = source[key];
  if (typeof value === "string") return value;
  throw new Error(`Expected ${key} to be a string`);
}
function readOptionalString3(source, key) {
  const value = source[key];
  if (value === void 0) return void 0;
  if (typeof value === "string") return value;
  throw new Error(`Expected ${key} to be a string`);
}
function readBoolean4(source, key) {
  const value = source[key];
  if (typeof value === "boolean") return value;
  throw new Error(`Expected ${key} to be a boolean`);
}
function readOptionalStringArray3(source, key) {
  const value = source[key];
  if (value === void 0) return void 0;
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new Error(`Expected ${key} to be a string array`);
  }
  return value;
}
function readOptionalArtifactReferences(source, key) {
  const value = source[key];
  if (value === void 0) return void 0;
  if (!Array.isArray(value)) throw new Error(`Expected ${key} to be an artifact reference array`);
  return value.map((entry) => {
    const object = readObjectValue2(entry, "artifact reference");
    const relation = readOptionalString3(object, "relation");
    return makeArtifactReference(
      readString3(object, "id"),
      relation === "read" || relation === "derived_from" || relation === "validates" || relation === "produces" || relation === "supersedes" || relation === "patches" || relation === "blocks" ? relation : "produces"
    );
  });
}

// src/standalone/composition.ts
function createStandaloneDaimyo(options) {
  const cwd = resolve(options.cwd ?? process.cwd());
  const workspaceDir = resolve(options.workspaceDir ?? cwd);
  const modelClient = options.modelClient ?? createDefaultModelClient(options.model);
  const executionStore = options.executionStore ?? new JsonlExecutionStore({ workspaceDir });
  const agentTransport = options.agentTransport ?? new ClaudeSdkAgentTransport();
  const workSource = options.workSource ?? createStandaloneWorkSource(options.plan);
  const notifier = options.notifier ?? new ConsoleHumanDecisionNotifier();
  const validation = options.validation ?? new BuiltInValidation({
    executionStore,
    modelClient
  });
  const rolesPlanning = options.rolesPlanning ?? new NoRolesPlanning();
  const autonomyProfile = options.autonomyProfile ?? DEFAULT_AUTONOMY_PROFILE;
  const decisionProvider = options.decisionProvider ?? new TieredDecisionProvider({
    executionStore,
    autonomyProfile,
    modelClient,
    tier1Prompt: options.tier1Prompt === void 0 ? DEFAULT_TIER1_DECISION_PROMPT : options.tier1Prompt,
    notifier,
    ...options.staticRules === void 0 ? {} : { staticRules: options.staticRules }
  });
  return {
    supervisor: new Supervisor({
      agentTransport,
      workSource,
      executionStore,
      validation,
      decisionProvider,
      cwd,
      autonomyProfile,
      ...options.maxRetries === void 0 ? {} : { maxRetries: options.maxRetries },
      ...options.maxConcurrency === void 0 ? {} : { maxConcurrency: options.maxConcurrency },
      ...options.stallAfterMs === void 0 ? {} : { stallAfterMs: options.stallAfterMs }
    }),
    agentTransport,
    workSource,
    executionStore,
    validation,
    rolesPlanning,
    decisionProvider,
    notifier
  };
}
function createStandaloneWorkSource(plan) {
  if (plan === void 0) {
    throw new Error("Standalone Daimyo requires a plan file or an injected WorkSource.");
  }
  const filePath = resolve(plan.filePath);
  const type = plan.type ?? inferPlanType(filePath);
  if (type === "markdown") return new MarkdownChecklistWorkSource({ filePath });
  return new JsonWorkSource({ filePath });
}
function inferPlanType(filePath) {
  const extension = extname(filePath).toLowerCase();
  if (extension === ".md" || extension === ".markdown") return "markdown";
  if (extension === ".json") return "json";
  throw new Error(`Cannot infer WorkSource type from ${filePath}; pass --type markdown or --type json.`);
}
function defaultWorkspaceDirForPlan(filePath) {
  return dirname3(resolve(filePath));
}
function createDefaultModelClient(options) {
  const envName = options?.apiKeyEnv ?? "ANTHROPIC_API_KEY";
  const apiKey = options?.apiKey ?? process.env[envName];
  if (apiKey === void 0 || apiKey.length === 0) {
    return new UnavailableModelClient(envName);
  }
  const endpoint = options?.endpoint ?? process.env.DAIMYO_MODEL_ENDPOINT;
  return new AnthropicStructuredModelClient({
    apiKey,
    model: options?.model ?? process.env.DAIMYO_MODEL ?? "claude-sonnet-4-5",
    ...endpoint === void 0 ? {} : { endpoint }
  });
}
var UnavailableModelClient = class {
  constructor(envName) {
    this.envName = envName;
  }
  envName;
  async call() {
    throw new Error(
      `Structured model call unavailable. Set ${this.envName} or inject a modelClient.`
    );
  }
};
var NoRolesPlanning = class {
  async plan(_request) {
    return {
      tasks: [],
      decisions: []
    };
  }
};
export {
  AgentCommandRejectedError,
  AgentSessionResumeRejectedError,
  AgentTransportTier2InvestigationHook,
  AnthropicStructuredModelClient,
  BuiltInValidation,
  ClaudeSdkAgentTransport,
  ConsoleHumanDecisionNotifier,
  DEFAULT_AUTONOMY_PROFILE,
  DEFAULT_TIER1_DECISION_PROMPT,
  JsonWorkSource,
  JsonlExecutionStore,
  MARKDOWN_CHECKLIST_ID_SCHEME,
  MarkdownChecklistWorkSource,
  PROTOCOL_SCHEMA_VERSION,
  PROTOCOL_VERSION,
  StructuredModelCallError,
  StructuredModelClient,
  Supervisor,
  TieredDecisionProvider,
  WORK_STATUSES,
  asAgentSessionId,
  asDecisionId,
  asNodeId,
  asScore0To10,
  asTaskId,
  asTransportCorrelationId,
  assertWorkStatus,
  classifyDecisionSize,
  createStandaloneDaimyo,
  createStandaloneWorkSource,
  decisionPolicyContext,
  decisionRecordId,
  decisionRequestId,
  decisionRequestNodeId,
  decisionRequestTaskId,
  decisionVerdictSchema,
  decisionVerdictToRoleResult,
  defaultNodeIdForTask,
  defaultWorkspaceDirForPlan,
  evaluateAutonomyThreshold,
  inferPlanType,
  isJsonObject4 as isJsonObject,
  isWorkStatus,
  jsonWorkSourceStatusMapping,
  makeArtifactReference,
  makeDecisionRecord,
  makeExecutionEvidence,
  makeTaskReference,
  makeTouchReport,
  makeValidationReport,
  markdownChecklistStatusMapping,
  parseJson,
  rebuildExecutionNodeTree,
  reconcileCheckpoints,
  requireJsonObject,
  roleResultToDecisionVerdict,
  runDeclaredCommand,
  selectDecisionAction,
  validationReportRef,
  verdictInstruction,
  workDefinitionFingerprint,
  workerRequiresRestart
};
