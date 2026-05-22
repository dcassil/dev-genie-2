import type {
  DecisionRecord,
  DecisionRequest,
  ExecutionEvidence,
  PermissionDecisionRequest,
  RoutingDecisionRequest,
  TaskId,
} from "../core/domain.js";
import { asDecisionId } from "../core/domain.js";
import type {
  AgentCommand,
  AgentCommandRejectedError,
  AgentEvent,
  AgentEventReadOptions,
  AgentPendingCorrelation,
  AgentSession,
  AgentSessionId,
  AgentSessionRequest,
  AgentTransport,
  TransportCorrelationId,
} from "../core/ports/agent-transport.js";
import {
  AgentCommandRejectedError as CommandRejectedError,
  AgentSessionResumeRejectedError,
  asAgentSessionId,
  asTransportCorrelationId,
} from "../core/ports/agent-transport.js";
import type { DecisionProvider } from "../core/ports/decision-provider.js";
import type {
  CreateTaskInput,
  WorkSource,
  WorkStatus,
  WorkTask,
  WorkTaskSummary,
} from "../core/ports/work-source.js";
import { asTaskId } from "../core/domain.js";

export class FakeAgentTransport implements AgentTransport {
  readonly sessions: AgentSession[] = [];
  readonly spawnRequests: AgentSessionRequest[] = [];
  readonly commands: { readonly sessionId: AgentSessionId; readonly command: AgentCommand }[] =
    [];
  readonly disposedSessionIds: AgentSessionId[] = [];
  private readonly events: AgentEvent[] = [];
  private readonly pending = new Map<string, AgentPendingCorrelation>();
  private readonly rejectedResumeSessionIds = new Set<string>();

  constructor(events: readonly AgentEvent[] = []) {
    this.events.push(...events);
  }

  async spawnSession(request: AgentSessionRequest): Promise<AgentSession> {
    this.spawnRequests.push(request);
    if (
      request.resumeFromSessionId !== undefined &&
      this.rejectedResumeSessionIds.has(request.resumeFromSessionId)
    ) {
      throw new AgentSessionResumeRejectedError(
        `Fake rejected resume token for ${request.resumeFromSessionId}`,
        request.resumeFromSessionId,
      );
    }
    const session: AgentSession = {
      id:
        request.resumeFromSessionId ??
        asAgentSessionId(`fake-session-${this.sessions.length + 1}`),
      nodeId: request.nodeId,
    };
    this.sessions.push(session);
    return session;
  }

  async readEvent(
    sessionId: AgentSessionId,
    _options?: AgentEventReadOptions,
  ): Promise<AgentEvent> {
    const event =
      this.events.shift() ??
      ({
        type: "stalled",
        sessionId,
        correlationId: asTransportCorrelationId(`fake-stalled-${this.commands.length + 1}`),
        elapsedMs: 0,
        lastProgressAt: new Date(0).toISOString(),
        reason: "fake transport event queue exhausted",
      } satisfies AgentEvent);
    this.recordPending(event);
    return event;
  }

  async sendCommand(sessionId: AgentSessionId, command: AgentCommand): Promise<void> {
    this.resolvePending(sessionId, command);
    this.commands.push({ sessionId, command });
  }

  async disposeSession(sessionId: AgentSessionId): Promise<void> {
    this.pending.delete(sessionId);
    this.disposedSessionIds.push(sessionId);
  }

  pushEvent(event: AgentEvent): void {
    this.events.push(event);
  }

  rejectResumeFor(sessionId: AgentSessionId): void {
    this.rejectedResumeSessionIds.add(sessionId);
  }

  pendingCorrelations(): readonly AgentPendingCorrelation[] {
    return Array.from(this.pending.values());
  }

  private recordPending(event: AgentEvent): void {
    if (event.type === "needs_permission") {
      this.pending.set(event.sessionId, {
        correlationId: event.correlationId,
        eventType: event.type,
        acceptedCommands: ["approve", "deny"],
      });
      return;
    }
    if (event.type === "needs_input") {
      this.pending.set(event.sessionId, {
        correlationId: event.correlationId,
        eventType: event.type,
        acceptedCommands:
          event.options === undefined ? ["respond"] : ["respond", "choose_option"],
      });
      return;
    }
    if (event.type === "stalled") {
      this.pending.set(event.sessionId, {
        correlationId: event.correlationId,
        eventType: event.type,
        acceptedCommands: ["interrupt", "resume"],
      });
      return;
    }
    if (event.type === "turn_ended" || event.type === "exited") {
      this.pending.delete(event.sessionId);
    }
  }

  private resolvePending(sessionId: AgentSessionId, command: AgentCommand): void {
    const pending = this.pending.get(sessionId);
    if (pending === undefined) {
      throw rejected(command.correlationId, command.type, "No pending correlated event");
    }
    if (pending.correlationId !== command.correlationId) {
      throw rejected(command.correlationId, command.type, `Pending correlation is ${pending.correlationId}`);
    }
    if (!pending.acceptedCommands.includes(command.type)) {
      throw rejected(command.correlationId, command.type, `${command.type} cannot answer ${pending.eventType}`);
    }
    this.pending.delete(sessionId);
  }
}

function rejected(
  correlationId: TransportCorrelationId,
  commandType: AgentCommand["type"],
  message: string,
): AgentCommandRejectedError {
  return new CommandRejectedError(message, correlationId, commandType);
}

export class FakeWorkSource implements WorkSource {
  private readonly tasks = new Map<string, WorkTask>();

  constructor(tasks: readonly WorkTask[] = []) {
    for (const task of tasks) {
      this.tasks.set(task.id, task);
    }
  }

  async listTasks(): Promise<readonly WorkTaskSummary[]> {
    return Array.from(this.tasks.values()).map((task) => {
      const summary: WorkTaskSummary = {
        id: task.id,
        title: task.title,
        status: task.status,
        revision: task.revision,
        ...(task.parentId === undefined ? {} : { parentId: task.parentId }),
      };
      return summary;
    });
  }

  async getTask(id: TaskId): Promise<WorkTask> {
    const task = this.tasks.get(id);
    if (task === undefined) throw new Error(`Fake task not found: ${id}`);
    return task;
  }

  async markStatus(
    id: TaskId,
    status: WorkStatus,
    _evidence: ExecutionEvidence,
  ): Promise<WorkTask> {
    const task = await this.getTask(id);
    const updated: WorkTask = {
      ...task,
      status,
      revision: `${Number.parseInt(task.revision, 10) + 1}`,
    };
    this.tasks.set(id, updated);
    return updated;
  }

  async createTask(input: CreateTaskInput, parentId?: TaskId): Promise<TaskId> {
    const id = asTaskId(`fake-task-${this.tasks.size + 1}`);
    const task: WorkTask = {
      id,
      title: input.title,
      body: input.body,
      acceptanceCriteria: input.acceptanceCriteria ?? [],
      status: "todo",
      revision: "1",
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
      ...(parentId === undefined ? {} : { parentId }),
    };
    this.tasks.set(id, task);
    return id;
  }
}

export class FakeDecisionProvider implements DecisionProvider {
  readonly requests: DecisionRequest[] = [];
  private readonly records: DecisionRecord[];

  constructor(records: readonly DecisionRecord[] = []) {
    this.records = [...records];
  }

  async decidePermission(request: PermissionDecisionRequest): Promise<DecisionRecord> {
    return this.decide(request);
  }

  async decideRouting(request: RoutingDecisionRequest): Promise<DecisionRecord> {
    return this.decide(request);
  }

  private decide(request: DecisionRequest): DecisionRecord {
    this.requests.push(request);
    const record = this.records.shift();
    if (record !== undefined) return { ...record, request };
    return {
      id: asDecisionId(`fake-decision-${this.requests.length}`),
      request,
      tier: 0,
      rationale: "fake deterministic decision",
      createdAt: new Date(0).toISOString(),
      verdict: {
        type: "human",
        suggested_choice: null,
        suggested_response: null,
        confidence: 0,
        risk: 10,
        block_trigger: true,
      },
    };
  }
}
