import type {
  DecisionRecord,
  DecisionRequest,
  ExecutionEvidence,
  TaskId,
} from "../core/domain.js";
import { asDecisionId } from "../core/domain.js";
import type {
  AgentCommand,
  AgentEvent,
  AgentEventReadOptions,
  AgentSession,
  AgentSessionId,
  AgentSessionRequest,
  AgentTransport,
} from "../core/ports/agent-transport.js";
import { asAgentSessionId } from "../core/ports/agent-transport.js";
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
  readonly commands: { readonly sessionId: AgentSessionId; readonly command: AgentCommand }[] =
    [];
  private readonly events: AgentEvent[] = [];

  constructor(events: readonly AgentEvent[] = []) {
    this.events.push(...events);
  }

  async spawnSession(request: AgentSessionRequest): Promise<AgentSession> {
    const session: AgentSession = {
      id: asAgentSessionId(`fake-session-${this.sessions.length + 1}`),
      nodeId: request.nodeId,
    };
    this.sessions.push(session);
    return session;
  }

  async nextEvent(
    sessionId: AgentSessionId,
    _options?: AgentEventReadOptions,
  ): Promise<AgentEvent> {
    const event = this.events.shift();
    if (event !== undefined) return event;
    return {
      type: "stalled",
      sessionId,
      elapsedMs: 0,
      reason: "fake transport event queue exhausted",
    };
  }

  async sendCommand(sessionId: AgentSessionId, command: AgentCommand): Promise<void> {
    this.commands.push({ sessionId, command });
  }

  pushEvent(event: AgentEvent): void {
    this.events.push(event);
  }
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

  async decide(request: DecisionRequest): Promise<DecisionRecord> {
    this.requests.push(request);
    const record = this.records.shift();
    if (record !== undefined) return record;
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
