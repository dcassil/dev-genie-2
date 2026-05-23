import type {
  ExecutionEvidence,
  JsonObject,
  JsonValue,
  NodeId,
  NodeStatus,
  NodeType,
  TaskId,
} from "./domain.js";
import { asNodeId } from "./domain.js";
import type { AgentSessionId } from "./ports/agent-transport.js";
import type { WorkStatus, WorkTask } from "./ports/work-source.js";

export interface ReconciliationWorkTaskSnapshot {
  readonly id: TaskId;
  readonly status: WorkStatus;
  readonly revision: string;
  readonly type: NodeType;
  readonly parentTaskId?: TaskId;
  readonly definitionFingerprint?: string;
}

export interface ReconciliationNodeSnapshot {
  readonly id: NodeId;
  readonly taskId: TaskId;
  readonly type: NodeType;
  readonly status: NodeStatus;
  readonly retryCount: number;
  readonly parentId?: NodeId;
  readonly sessionId?: AgentSessionId;
  readonly workSourceRevision?: string;
  readonly workDefinitionFingerprint?: string;
  readonly latestEvidence?: ExecutionEvidence;
}

export interface WorkSourceReconciliationSnapshot {
  readonly tasks: readonly ReconciliationWorkTaskSnapshot[];
}

export interface ExecutionStoreReconciliationSnapshot {
  readonly nodes: readonly ReconciliationNodeSnapshot[];
}

export type ReconciliationAction =
  | {
      readonly type: "schedule-node";
      readonly taskId: TaskId;
      readonly nodeId: NodeId;
      readonly nodeType: NodeType;
      readonly parentNodeId?: NodeId;
      readonly workSourceRevision: string;
      readonly workDefinitionFingerprint?: string;
    }
  | {
      readonly type: "cancel-node";
      readonly taskId: TaskId;
      readonly nodeId: NodeId;
      readonly reason: "missing-from-work-source";
    }
  | {
      readonly type: "drop-from-queue";
      readonly taskId: TaskId;
      readonly nodeId: NodeId;
      readonly workSourceRevision: string;
      readonly workDefinitionFingerprint?: string;
      readonly reason: "externally-done";
    }
  | {
      readonly type: "mark-stale";
      readonly taskId: TaskId;
      readonly nodeId: NodeId;
      readonly workSourceRevision: string;
      readonly workDefinitionFingerprint: string;
      readonly reason: "definition-changed";
    }
  | {
      readonly type: "refresh-observed-revision";
      readonly taskId: TaskId;
      readonly nodeId: NodeId;
      readonly workSourceRevision: string;
      readonly workDefinitionFingerprint?: string;
      readonly reason: "non-definition-change";
    }
  | {
      readonly type: "interrupt-and-supersede";
      readonly taskId: TaskId;
      readonly nodeId: NodeId;
      readonly sessionId: AgentSessionId;
      readonly reason: "missing-from-work-source" | "definition-changed" | "externally-done";
      readonly replacement?: {
        readonly nodeId: NodeId;
        readonly nodeType: NodeType;
        readonly workSourceRevision: string;
        readonly workDefinitionFingerprint: string;
      };
    };

const RETIRED_STATUSES: readonly NodeStatus[] = ["cancelled", "superseded"];

export function reconcileCheckpoints(
  workSourceSnapshot: WorkSourceReconciliationSnapshot,
  executionStoreSnapshot: ExecutionStoreReconciliationSnapshot,
): readonly ReconciliationAction[] {
  assertStableTaskIds(workSourceSnapshot.tasks);
  assertUniqueNodeIds(executionStoreSnapshot.nodes);

  const tasksById = new Map<TaskId, ReconciliationWorkTaskSnapshot>();
  for (const task of workSourceSnapshot.tasks) {
    tasksById.set(task.id, task);
  }

  const activeNodesByTask = latestActiveNodesByTask(executionStoreSnapshot.nodes);
  const actions: ReconciliationAction[] = [];

  for (const task of workSourceSnapshot.tasks) {
    const node = activeNodesByTask.get(task.id);
    if (node === undefined) {
      if (task.status !== "done") {
        actions.push(scheduleNode(task));
      }
      continue;
    }

    if (task.status === "done") {
      if (isInFlight(node)) {
        actions.push(interruptAndSupersede(node, "externally-done", undefined));
      } else if (node.status !== "done") {
        actions.push({
          type: "drop-from-queue",
          taskId: task.id,
          nodeId: node.id,
          workSourceRevision: task.revision,
          ...(task.definitionFingerprint === undefined
            ? {}
            : { workDefinitionFingerprint: task.definitionFingerprint }),
          reason: "externally-done",
        });
      }
      continue;
    }

    if (task.revision === node.workSourceRevision) continue;

    if (
      task.definitionFingerprint !== undefined &&
      node.workDefinitionFingerprint !== undefined &&
      task.definitionFingerprint !== node.workDefinitionFingerprint
    ) {
      if (isInFlight(node)) {
        actions.push(
          interruptAndSupersede(node, "definition-changed", {
            nodeId: replacementNodeId(task.id, task.revision),
            nodeType: task.type,
            workSourceRevision: task.revision,
            workDefinitionFingerprint: task.definitionFingerprint,
          }),
        );
      } else {
        actions.push({
          type: "mark-stale",
          taskId: task.id,
          nodeId: node.id,
          workSourceRevision: task.revision,
          workDefinitionFingerprint: task.definitionFingerprint,
          reason: "definition-changed",
        });
      }
      continue;
    }

    actions.push({
      type: "refresh-observed-revision",
      taskId: task.id,
      nodeId: node.id,
      workSourceRevision: task.revision,
      ...(task.definitionFingerprint === undefined
        ? {}
        : { workDefinitionFingerprint: task.definitionFingerprint }),
      reason: "non-definition-change",
    });
  }

  for (const node of activeNodesByTask.values()) {
    if (tasksById.has(node.taskId)) continue;
    if (isInFlight(node)) {
      actions.push(interruptAndSupersede(node, "missing-from-work-source", undefined));
      continue;
    }
    actions.push({
      type: "cancel-node",
      taskId: node.taskId,
      nodeId: node.id,
      reason: "missing-from-work-source",
    });
  }

  return actions;
}

export function workDefinitionFingerprint(task: WorkTask): string {
  return stableStringify({
    acceptanceCriteria: [...task.acceptanceCriteria],
    dependencies: dependencyMetadata(task.metadata),
  });
}

export function defaultNodeIdForTask(taskId: TaskId): NodeId {
  return asNodeId(`node:${taskId}`);
}

function scheduleNode(task: ReconciliationWorkTaskSnapshot): ReconciliationAction {
  return {
    type: "schedule-node",
    taskId: task.id,
    nodeId: defaultNodeIdForTask(task.id),
    nodeType: task.type,
    ...(task.parentTaskId === undefined ? {} : { parentNodeId: defaultNodeIdForTask(task.parentTaskId) }),
    workSourceRevision: task.revision,
    ...(task.definitionFingerprint === undefined
      ? {}
      : { workDefinitionFingerprint: task.definitionFingerprint }),
  };
}

function interruptAndSupersede(
  node: ReconciliationNodeSnapshot,
  reason: Extract<ReconciliationAction, { readonly type: "interrupt-and-supersede" }>["reason"],
  replacement:
    | Extract<ReconciliationAction, { readonly type: "interrupt-and-supersede" }>["replacement"]
    | undefined,
): ReconciliationAction {
  if (node.sessionId === undefined) {
    throw new Error(`Cannot interrupt in-flight node without a session id: ${node.id}`);
  }
  return {
    type: "interrupt-and-supersede",
    taskId: node.taskId,
    nodeId: node.id,
    sessionId: node.sessionId,
    reason,
    ...(replacement === undefined ? {} : { replacement }),
  };
}

function isInFlight(node: ReconciliationNodeSnapshot): boolean {
  return node.status === "running";
}

function latestActiveNodesByTask(
  nodes: readonly ReconciliationNodeSnapshot[],
): ReadonlyMap<TaskId, ReconciliationNodeSnapshot> {
  const byTask = new Map<TaskId, ReconciliationNodeSnapshot>();
  for (const node of nodes) {
    if (RETIRED_STATUSES.includes(node.status)) continue;
    if (!byTask.has(node.taskId)) byTask.set(node.taskId, node);
  }
  return byTask;
}

function assertStableTaskIds(tasks: readonly ReconciliationWorkTaskSnapshot[]): void {
  const seen = new Set<string>();
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

function assertUniqueNodeIds(nodes: readonly ReconciliationNodeSnapshot[]): void {
  const seen = new Set<string>();
  for (const node of nodes) {
    if (seen.has(node.id)) {
      throw new Error(`ExecutionStore returned duplicate node id ${node.id}`);
    }
    seen.add(node.id);
  }
}

function replacementNodeId(taskId: TaskId, revision: string): NodeId {
  return asNodeId(`node:${taskId}:reconciled:${safeRevisionSegment(revision)}`);
}

function safeRevisionSegment(revision: string): string {
  const segment = revision.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
  return segment.length === 0 ? "revision" : segment;
}

function dependencyMetadata(metadata: JsonObject | undefined): JsonValue {
  if (metadata === undefined) return null;
  return {
    blockedBy: metadata.blockedBy ?? null,
    blocked_by: metadata.blocked_by ?? null,
    dependencies: metadata.dependencies ?? null,
    dependsOn: metadata.dependsOn ?? null,
    depends_on: metadata.depends_on ?? null,
  };
}

function stableStringify(value: JsonValue): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(",")}}`;
}
