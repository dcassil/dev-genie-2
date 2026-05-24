import type { ExecutionEvidence, NodeId, NodeStatus, NodeType, TaskId } from "./domain.js";
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
export type ReconciliationAction = {
    readonly type: "schedule-node";
    readonly taskId: TaskId;
    readonly nodeId: NodeId;
    readonly nodeType: NodeType;
    readonly parentNodeId?: NodeId;
    readonly workSourceRevision: string;
    readonly workDefinitionFingerprint?: string;
} | {
    readonly type: "cancel-node";
    readonly taskId: TaskId;
    readonly nodeId: NodeId;
    readonly reason: "missing-from-work-source";
} | {
    readonly type: "drop-from-queue";
    readonly taskId: TaskId;
    readonly nodeId: NodeId;
    readonly workSourceRevision: string;
    readonly workDefinitionFingerprint?: string;
    readonly reason: "externally-done";
} | {
    readonly type: "mark-stale";
    readonly taskId: TaskId;
    readonly nodeId: NodeId;
    readonly workSourceRevision: string;
    readonly workDefinitionFingerprint: string;
    readonly reason: "definition-changed";
} | {
    readonly type: "refresh-observed-revision";
    readonly taskId: TaskId;
    readonly nodeId: NodeId;
    readonly workSourceRevision: string;
    readonly workDefinitionFingerprint?: string;
    readonly reason: "non-definition-change";
} | {
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
export declare function reconcileCheckpoints(workSourceSnapshot: WorkSourceReconciliationSnapshot, executionStoreSnapshot: ExecutionStoreReconciliationSnapshot): readonly ReconciliationAction[];
export declare function workDefinitionFingerprint(task: WorkTask): string;
export declare function defaultNodeIdForTask(taskId: TaskId): NodeId;
