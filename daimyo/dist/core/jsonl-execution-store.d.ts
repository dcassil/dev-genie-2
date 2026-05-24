import type { DecisionRecord, ExecutionEvidence, NodeId, TaskId, ValidationReport } from "./domain.js";
import type { ExecutionCursor, ExecutionNodeInput, ExecutionSnapshot, ExecutionStore } from "./execution-store.js";
export interface JsonlExecutionStoreOptions {
    readonly workspaceDir: string;
}
/**
 * JSONL is the first durable adapter because Supervisor state is naturally an
 * append-only stream of loop events. A single fsynced JSON line per operation
 * makes crash recovery simple and inspectable; sqlite can replace this class
 * later without changing the ExecutionStore contract.
 */
export declare class JsonlExecutionStore implements ExecutionStore {
    private readonly executionDir;
    constructor(options: JsonlExecutionStoreOptions);
    taskLogPath(taskId: TaskId): string;
    upsertNode(taskId: TaskId, node: ExecutionNodeInput): Promise<void>;
    recordDecision(taskId: TaskId, nodeId: NodeId, record: DecisionRecord): Promise<void>;
    recordValidationReport(taskId: TaskId, nodeId: NodeId, report: ValidationReport): Promise<void>;
    appendEvidence(taskId: TaskId, nodeId: NodeId, evidence: ExecutionEvidence): Promise<void>;
    setCursor(taskId: TaskId, cursor: ExecutionCursor | null): Promise<void>;
    invalidateResumeToken(taskId: TaskId, nodeId: NodeId, reason: string, invalidatedAt: string): Promise<void>;
    listTaskIds(): Promise<readonly TaskId[]>;
    load(taskId: TaskId): Promise<ExecutionSnapshot>;
    private appendEvent;
}
