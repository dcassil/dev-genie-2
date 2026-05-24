import type { DecisionRecord, DecisionRequest, ExecutionEvidence, PermissionDecisionRequest, RoutingDecisionRequest, TaskId } from "../core/domain.js";
import type { AgentCommand, AgentEvent, AgentEventReadOptions, AgentInterruptResult, AgentPendingCorrelation, AgentSession, AgentSessionId, AgentSessionRequest, AgentTransport } from "../core/ports/agent-transport.js";
import type { DecisionProvider } from "../core/ports/decision-provider.js";
import type { CreateTaskInput, PatchTaskInput, WorkSource, WorkStatus, WorkTask, WorkTaskSummary } from "../core/ports/work-source.js";
export declare class FakeAgentTransport implements AgentTransport {
    readonly sessions: AgentSession[];
    readonly spawnRequests: AgentSessionRequest[];
    readonly commands: {
        readonly sessionId: AgentSessionId;
        readonly command: AgentCommand;
    }[];
    readonly interrupts: {
        readonly sessionId: AgentSessionId;
        readonly reason: string;
    }[];
    readonly disposedSessionIds: AgentSessionId[];
    private readonly events;
    private readonly pending;
    private readonly rejectedResumeSessionIds;
    private readonly interruptResults;
    constructor(events?: readonly AgentEvent[]);
    spawnSession(request: AgentSessionRequest): Promise<AgentSession>;
    readEvent(sessionId: AgentSessionId, _options?: AgentEventReadOptions): Promise<AgentEvent>;
    sendCommand(sessionId: AgentSessionId, command: AgentCommand): Promise<void>;
    interruptSession(sessionId: AgentSessionId, reason: string): Promise<AgentInterruptResult>;
    disposeSession(sessionId: AgentSessionId): Promise<void>;
    pushEvent(event: AgentEvent): void;
    rejectResumeFor(sessionId: AgentSessionId): void;
    setInterruptResult(sessionId: AgentSessionId, result: AgentInterruptResult): void;
    pendingCorrelations(): readonly AgentPendingCorrelation[];
    private recordPending;
    private resolvePending;
}
export declare class FakeWorkSource implements WorkSource {
    readonly statusMarks: {
        readonly id: TaskId;
        readonly status: WorkStatus;
        readonly evidence: ExecutionEvidence;
    }[];
    readonly patches: {
        readonly id: TaskId;
        readonly patch: PatchTaskInput;
        readonly evidence: ExecutionEvidence;
    }[];
    readonly createdTasks: {
        readonly input: CreateTaskInput;
        readonly parentId?: TaskId;
        readonly id: TaskId;
    }[];
    private readonly tasks;
    constructor(tasks?: readonly WorkTask[]);
    listTasks(): Promise<readonly WorkTaskSummary[]>;
    getTask(id: TaskId): Promise<WorkTask>;
    markStatus(id: TaskId, status: WorkStatus, evidence: ExecutionEvidence): Promise<WorkTask>;
    patchTask(id: TaskId, patch: PatchTaskInput, evidence: ExecutionEvidence): Promise<WorkTask>;
    createTask(input: CreateTaskInput, parentId?: TaskId): Promise<TaskId>;
}
export declare class FakeDecisionProvider implements DecisionProvider {
    readonly requests: DecisionRequest[];
    private readonly records;
    constructor(records?: readonly DecisionRecord[]);
    decidePermission(request: PermissionDecisionRequest): Promise<DecisionRecord>;
    decideRouting(request: RoutingDecisionRequest): Promise<DecisionRecord>;
    private decide;
}
