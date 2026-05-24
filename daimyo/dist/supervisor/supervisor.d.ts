import type { DecisionRecord, NodeId, TaskId } from "../core/domain.js";
import type { ExecutionStore } from "../core/execution-store.js";
import type { AgentTransport } from "../core/ports/agent-transport.js";
import type { Validation } from "../core/ports/capabilities.js";
import type { DecisionProvider } from "../core/ports/decision-provider.js";
import type { WorkSource } from "../core/ports/work-source.js";
import { type AutonomyProfile } from "../decision/autonomy.js";
export interface SupervisorOptions {
    readonly agentTransport: AgentTransport;
    readonly workSource: WorkSource;
    readonly executionStore: ExecutionStore;
    readonly validation: Validation;
    readonly decisionProvider: DecisionProvider;
    readonly cwd: string;
    readonly maxRetries?: number;
    readonly maxConcurrency?: number;
    readonly maxQuiesceAttempts?: number;
    readonly stallAfterMs?: number;
    readonly autonomyProfile?: AutonomyProfile;
    readonly now?: () => string;
}
export interface SupervisorRunOptions {
    readonly maxEvents?: number;
}
export type SupervisorRunStatus = "done" | "failed" | "needs-decision" | "awaiting-human" | "paused";
export interface SupervisorRunResult {
    readonly status: SupervisorRunStatus;
    readonly nodeId: NodeId;
    readonly taskId: TaskId;
    readonly eventsProcessed: number;
}
export interface RoutedDecisionAction {
    readonly type: "patch-and-resume" | "create-follow-up" | "await-human";
    readonly record: DecisionRecord;
    readonly affectedNodeId: NodeId;
    readonly affectedTaskId: TaskId;
    readonly instruction?: string;
    readonly followUpTaskId?: TaskId;
}
export declare class Supervisor {
    private readonly agentTransport;
    private readonly workSource;
    private readonly executionStore;
    private readonly validation;
    private readonly decisionProvider;
    private readonly cwd;
    private readonly maxRetries;
    private readonly maxConcurrency;
    private readonly maxQuiesceAttempts;
    private readonly stallAfterMs;
    private readonly autonomyProfile;
    private readonly now;
    constructor(options: SupervisorOptions);
    run(taskId: TaskId, options?: SupervisorRunOptions): Promise<SupervisorRunResult>;
    private executeNode;
    private executeInnerNode;
    private executeChildWave;
    private executeLeafNode;
    private startLeafWorker;
    private processLeafEvent;
    private handleLeafFailure;
    private handleChildFailure;
    private routeNeedsDecision;
    private handleRoutedAction;
    private loadSiblingContext;
    private quiesceAffectedSiblings;
    private handleHardConflict;
    private applyDecisionAction;
    private handlePermissionEvent;
    private handleInputEvent;
    private startWorkerSession;
    private reconcileAtCheckpoint;
    private workSourceSnapshot;
    private applyReconciliationAction;
    private ensureNode;
    private markNode;
    private reloadNode;
    private loadParentNode;
    private childTasks;
    private nodeOwnsAffectedTasks;
    private persistDecisionRecord;
    private recordActionDecision;
}
