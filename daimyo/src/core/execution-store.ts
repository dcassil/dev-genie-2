import type { AgentSessionId } from "./ports/agent-transport.js";
import type {
  DecisionId,
  DecisionRecord,
  ExecutionEvidence,
  NodeId,
  NodeStatus,
  NodeType,
  TaskId,
  ValidationReport,
} from "./domain.js";

export type ResumeTokenStatus = "resumable" | "restart-required";

export interface WorkerSessionState {
  readonly sessionId: AgentSessionId;
  readonly resumeToken: string;
  readonly tokenStatus: ResumeTokenStatus;
  readonly restartReason?: string;
  readonly invalidatedAt?: string;
}

export interface ExecutionNodeInput {
  readonly id: NodeId;
  readonly taskId: TaskId;
  readonly type: NodeType;
  readonly status: NodeStatus;
  readonly parentId?: NodeId;
  readonly retryCount: number;
  readonly session?: WorkerSessionState;
}

export interface ExecutionNodeState extends ExecutionNodeInput {
  readonly decisionRecordIds: readonly DecisionId[];
  readonly validationReportRefs: readonly string[];
  readonly evidence: readonly ExecutionEvidence[];
}

export type ExecutionCursorReason =
  | "scheduled"
  | "running"
  | "awaiting-decision"
  | "recovering";

export interface ExecutionCursor {
  readonly nodeId: NodeId;
  readonly reason: ExecutionCursorReason;
  readonly updatedAt: string;
}

export interface ExecutionSnapshot {
  readonly taskId: TaskId;
  readonly nodes: readonly ExecutionNodeState[];
  readonly decisions: readonly DecisionRecord[];
  readonly validationReports: readonly ValidationReport[];
  readonly cursor?: ExecutionCursor;
}

export interface ExecutionNodeTree {
  readonly node: ExecutionNodeState;
  readonly children: readonly ExecutionNodeTree[];
}

export interface ExecutionStore {
  upsertNode(taskId: TaskId, node: ExecutionNodeInput): Promise<void>;
  recordDecision(taskId: TaskId, nodeId: NodeId, record: DecisionRecord): Promise<void>;
  recordValidationReport(
    taskId: TaskId,
    nodeId: NodeId,
    report: ValidationReport,
  ): Promise<void>;
  appendEvidence(taskId: TaskId, nodeId: NodeId, evidence: ExecutionEvidence): Promise<void>;
  setCursor(taskId: TaskId, cursor: ExecutionCursor | null): Promise<void>;
  invalidateResumeToken(
    taskId: TaskId,
    nodeId: NodeId,
    reason: string,
    invalidatedAt: string,
  ): Promise<void>;
  load(taskId: TaskId): Promise<ExecutionSnapshot>;
}

export function workerRequiresRestart(node: ExecutionNodeState): boolean {
  return node.session?.tokenStatus === "restart-required";
}

export function rebuildExecutionNodeTree(
  snapshot: ExecutionSnapshot,
): readonly ExecutionNodeTree[] {
  const childrenByParent = new Map<NodeId, ExecutionNodeState[]>();
  const roots: ExecutionNodeState[] = [];

  for (const node of snapshot.nodes) {
    if (node.parentId === undefined) {
      roots.push(node);
      continue;
    }

    const children = childrenByParent.get(node.parentId) ?? [];
    children.push(node);
    childrenByParent.set(node.parentId, children);
  }

  const buildTree = (node: ExecutionNodeState): ExecutionNodeTree => ({
    node,
    children: (childrenByParent.get(node.id) ?? []).map(buildTree),
  });

  return roots.map(buildTree);
}
