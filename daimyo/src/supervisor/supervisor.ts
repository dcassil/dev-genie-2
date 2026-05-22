import type {
  ChildDone,
  ChildFailed,
  ChildNeedsDecision,
  ChildReturn,
  DecisionRecord,
  ExecutionEvidence,
  JsonObject,
  JsonValue,
  NodeId,
  NodeRef,
  TaskId,
} from "../core/domain.js";
import {
  asDecisionId,
} from "../core/domain.js";
import type {
  ExecutionNodeInput,
  ExecutionNodeState,
  ExecutionStore,
} from "../core/execution-store.js";
import { workerRequiresRestart } from "../core/execution-store.js";
import {
  defaultNodeIdForTask,
  reconcileCheckpoints,
  workDefinitionFingerprint,
  type ExecutionStoreReconciliationSnapshot,
  type ReconciliationAction,
  type ReconciliationNodeSnapshot,
  type ReconciliationWorkTaskSnapshot,
  type WorkSourceReconciliationSnapshot,
} from "../core/reconciliation.js";
import type {
  AgentCommand,
  AgentEvent,
  AgentSession,
  AgentSessionRequest,
  AgentTransport,
  TransportCorrelationId,
} from "../core/ports/agent-transport.js";
import { AgentSessionResumeRejectedError } from "../core/ports/agent-transport.js";
import type { Validation } from "../core/ports/capabilities.js";
import type { DecisionProvider } from "../core/ports/decision-provider.js";
import type { WorkSource, WorkTask, WorkTaskSummary } from "../core/ports/work-source.js";
import {
  DEFAULT_AUTONOMY_PROFILE,
  type AutonomyProfile,
} from "../decision/autonomy.js";
import {
  selectDecisionAction,
  verdictInstruction,
  type DecisionActionSelection,
} from "./decision-actions.js";

export interface SupervisorOptions {
  readonly agentTransport: AgentTransport;
  readonly workSource: WorkSource;
  readonly executionStore: ExecutionStore;
  readonly validation: Validation;
  readonly decisionProvider: DecisionProvider;
  readonly cwd: string;
  readonly maxRetries?: number;
  readonly stallAfterMs?: number;
  readonly autonomyProfile?: AutonomyProfile;
  readonly now?: () => string;
}

export interface SupervisorRunOptions {
  readonly maxEvents?: number;
}

export type SupervisorRunStatus =
  | "done"
  | "failed"
  | "needs-decision"
  | "awaiting-human"
  | "paused";

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

interface RunBudget {
  processedEvents: number;
  readonly maxEvents?: number;
}

interface NodeExecutionResult {
  readonly returnValue: ChildReturn;
  readonly eventsProcessed: number;
}

const DEFAULT_MAX_RETRIES = 1;

export class Supervisor {
  private readonly agentTransport: AgentTransport;
  private readonly workSource: WorkSource;
  private readonly executionStore: ExecutionStore;
  private readonly validation: Validation;
  private readonly decisionProvider: DecisionProvider;
  private readonly cwd: string;
  private readonly maxRetries: number;
  private readonly stallAfterMs: number | undefined;
  private readonly autonomyProfile: AutonomyProfile;
  private readonly now: () => string;

  constructor(options: SupervisorOptions) {
    this.agentTransport = options.agentTransport;
    this.workSource = options.workSource;
    this.executionStore = options.executionStore;
    this.validation = options.validation;
    this.decisionProvider = options.decisionProvider;
    this.cwd = options.cwd;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.stallAfterMs = options.stallAfterMs;
    this.autonomyProfile = options.autonomyProfile ?? DEFAULT_AUTONOMY_PROFILE;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async run(taskId: TaskId, options: SupervisorRunOptions = {}): Promise<SupervisorRunResult> {
    await this.reconcileAtCheckpoint();
    const task = await this.workSource.getTask(taskId);
    const budget: RunBudget = {
      processedEvents: 0,
      ...(options.maxEvents === undefined ? {} : { maxEvents: options.maxEvents }),
    };
    const result = await this.executeNode(task, undefined, budget, undefined);
    return {
      status: childReturnToRunStatus(result.returnValue),
      nodeId: result.returnValue.nodeId,
      taskId,
      eventsProcessed: result.eventsProcessed,
    };
  }

  private async executeNode(
    task: WorkTask,
    parent: ExecutionNodeState | undefined,
    budget: RunBudget,
    resumeInstruction: string | undefined,
  ): Promise<NodeExecutionResult> {
    await this.reconcileAtCheckpoint();
    const childTasks = await this.childTasks(task.id);
    if (childTasks.length > 0) {
      return await this.executeInnerNode(task, childTasks, parent, budget);
    }
    return await this.executeLeafNode(task, parent, budget, resumeInstruction);
  }

  private async executeInnerNode(
    task: WorkTask,
    childSummaries: readonly WorkTaskSummary[],
    parent: ExecutionNodeState | undefined,
    budget: RunBudget,
  ): Promise<NodeExecutionResult> {
    const node = await this.ensureNode(task, "inner", parent);
    await this.markNode(task, node, "running", node.retryCount, undefined);
    await this.workSource.markStatus(task.id, "active", {
      summary: `Daimyo inner node ${node.id} started governing children.`,
    });

    for (const childSummary of childSummaries) {
      const childTask = await this.workSource.getTask(childSummary.id);
      const childResult = await this.executeNode(childTask, node, budget, undefined);
      const childReturn = childResult.returnValue;

      if (childReturn.type === "done") {
        const handled = await this.verifyChildDone(task, node, childTask, childReturn, budget);
        await this.reconcileAtCheckpoint();
        if (handled.returnValue.type !== "done") return handled;
        continue;
      }

      if (childReturn.type === "needs-decision") {
        const action = await this.routeNeedsDecision(task, node, childTask, childReturn);
        if (action.type === "await-human") {
          await this.markNode(task, node, "awaiting-human", node.retryCount, undefined);
          await this.reconcileAtCheckpoint();
          return {
            returnValue: {
              type: "needs-decision",
              nodeId: node.id,
              request: action.record.request,
            },
            eventsProcessed: budget.processedEvents,
          };
        }

        if (action.type === "create-follow-up") {
          const evidence: ExecutionEvidence = {
            summary: `Large decision ${action.record.id} was extracted to follow-up task ${action.followUpTaskId}.`,
          };
          await this.executionStore.appendEvidence(childTask.id, childReturn.nodeId, evidence);
          await this.markNode(childTask, await this.reloadNode(childTask.id, childReturn.nodeId), "done", 0, undefined);
          await this.workSource.markStatus(childTask.id, "done", evidence);
          await this.reconcileAtCheckpoint();
          continue;
        }

        const patchedChildTask = await this.workSource.getTask(childTask.id);
        const resumed = await this.executeNode(patchedChildTask, node, budget, action.instruction);
        await this.reconcileAtCheckpoint();
        if (resumed.returnValue.type !== "done") return resumed;
        const handled = await this.verifyChildDone(task, node, childTask, resumed.returnValue, budget);
        await this.reconcileAtCheckpoint();
        if (handled.returnValue.type !== "done") return handled;
        continue;
      }

      const handled = await this.handleChildFailure(task, node, childTask, childReturn, budget);
      await this.reconcileAtCheckpoint();
      if (handled.returnValue.type !== "done") return handled;
    }

    const doneEvidence: ExecutionEvidence = {
      summary: `Inner node ${node.id} completed all sequential children.`,
    };
    await this.executionStore.appendEvidence(task.id, node.id, doneEvidence);
    await this.markNode(task, node, "done", node.retryCount, undefined);
    await this.executionStore.setCursor(task.id, null);
    await this.workSource.markStatus(task.id, "done", doneEvidence);
    return {
      returnValue: { type: "done", nodeId: node.id, evidence: doneEvidence },
      eventsProcessed: budget.processedEvents,
    };
  }

  private async executeLeafNode(
    task: WorkTask,
    parent: ExecutionNodeState | undefined,
    budget: RunBudget,
    resumeInstruction: string | undefined,
  ): Promise<NodeExecutionResult> {
    const node = await this.ensureNode(task, "leaf", parent);
    if (node.status === "done") {
      return {
        returnValue: {
          type: "done",
          nodeId: node.id,
          evidence: latestEvidence(node) ?? { summary: `Node ${node.id} already done.` },
        },
        eventsProcessed: budget.processedEvents,
      };
    }
    if (node.status === "failed") {
      return {
        returnValue: childFailed(
          node.id,
          `Node ${node.id} is already failed.`,
          false,
          latestEvidence(node),
        ),
        eventsProcessed: budget.processedEvents,
      };
    }

    await this.workSource.markStatus(task.id, "active", {
      summary: `Daimyo leaf node ${node.id} started worker execution.`,
    });
    const session = await this.startWorkerSession(task, node, resumeInstruction);
    let currentNode = await this.reloadNode(task.id, node.id);

    while (true) {
      if (budgetExhausted(budget)) {
        return {
          returnValue: childFailed(
            node.id,
            "Supervisor event budget exhausted before a terminal worker return.",
            true,
            latestEvidence(currentNode),
          ),
          eventsProcessed: budget.processedEvents,
        };
      }

      const event = await this.agentTransport.readEvent(
        session.id,
        this.stallAfterMs === undefined ? undefined : { stallAfterMs: this.stallAfterMs },
      );
      budget.processedEvents += 1;

      if (event.type === "log") {
        continue;
      }

      if (event.type === "needs_permission") {
        await this.handlePermissionEvent(task, currentNode, event);
        currentNode = await this.reloadNode(task.id, node.id);
        continue;
      }

      if (event.type === "needs_input") {
        await this.handleInputEvent(task, currentNode, event);
        currentNode = await this.reloadNode(task.id, node.id);
        continue;
      }

      if (event.type === "stalled") {
        await this.agentTransport.sendCommand(event.sessionId, {
          type: "interrupt",
          correlationId: event.correlationId,
          reason: `Daimyo interrupted stalled node ${node.id}: ${event.reason}`,
        });
        continue;
      }

      if (event.type === "exited") {
        const failed = childFailed(
          node.id,
          `Worker exited (${event.reason}): ${event.message ?? "no message"}`,
          event.reason !== "closed",
          latestEvidence(currentNode),
        );
        return await this.handleLeafFailure(task, currentNode, failed, budget);
      }

      const parsed = parseWorkerReturn(event.result, node.id, task.id);
      if (parsed.type === "done") {
        const validation = await this.validation.validate({
          task,
          node: nodeRef(currentNode, "running"),
          scope: "leaf",
          evidence: parsed.evidence,
        });
        if (validation.status === "pass") {
          await this.executionStore.appendEvidence(task.id, node.id, parsed.evidence);
          await this.markNode(task, currentNode, "done", currentNode.retryCount, undefined);
          await this.executionStore.setCursor(task.id, null);
          if (currentNode.parentId === undefined) {
            await this.workSource.markStatus(task.id, "done", parsed.evidence);
          }
          await this.agentTransport.disposeSession(session.id);
          return { returnValue: parsed, eventsProcessed: budget.processedEvents };
        }
        const failed: ChildFailed = {
          type: "failed",
          nodeId: node.id,
          retryable: true,
          error: `Leaf validation failed: ${validation.reasons.join("; ")}`,
          evidence: {
            summary: "Leaf validation rejected worker completion claim.",
            artifacts: [validation.report_ref],
          },
        };
        return await this.handleLeafFailure(task, currentNode, failed, budget);
      }

      if (parsed.type === "needs-decision") {
        await this.markNode(task, currentNode, "needs-decision", currentNode.retryCount, undefined);
        await this.executionStore.setCursor(task.id, {
          nodeId: node.id,
          reason: "awaiting-decision",
          updatedAt: this.now(),
        });
        await this.agentTransport.disposeSession(session.id);
        return { returnValue: parsed, eventsProcessed: budget.processedEvents };
      }

      return await this.handleLeafFailure(task, currentNode, parsed, budget);
    }
  }

  private async handleLeafFailure(
    task: WorkTask,
    node: ExecutionNodeState,
    failed: ChildFailed,
    budget: RunBudget,
  ): Promise<NodeExecutionResult> {
    if (failed.evidence !== undefined) {
      await this.executionStore.appendEvidence(task.id, node.id, failed.evidence);
    }
    if (node.session !== undefined) {
      await this.agentTransport.disposeSession(node.session.sessionId);
    }

    if (failed.retryable && node.retryCount < this.maxRetries) {
      const retryCount = node.retryCount + 1;
      await this.markNode(task, node, "pending", retryCount, undefined);
      await this.executionStore.setCursor(task.id, {
        nodeId: node.id,
        reason: "recovering",
        updatedAt: this.now(),
      });
      return await this.executeLeafNode(
        task,
        node.parentId === undefined ? undefined : await this.loadParentNode(node.parentId),
        budget,
        `Retry after failure: ${failed.error}`,
      );
    }

    const exhausted = childFailed(node.id, failed.error, false, failed.evidence);
    await this.markNode(task, node, "failed", node.retryCount, undefined);
    await this.executionStore.setCursor(task.id, null);
    await this.workSource.markStatus(task.id, "blocked", {
      summary: failed.error,
      ...(failed.evidence === undefined ? {} : { artifacts: failed.evidence.artifacts }),
    });
    return { returnValue: exhausted, eventsProcessed: budget.processedEvents };
  }

  private async verifyChildDone(
    parentTask: WorkTask,
    parentNode: ExecutionNodeState,
    childTask: WorkTask,
    childDone: ChildDone,
    budget: RunBudget,
  ): Promise<NodeExecutionResult> {
    const parentValidation = await this.validation.validate({
      task: parentTask,
      node: nodeRef(parentNode, "running"),
      scope: "parent",
      evidence: childDone.evidence,
    });
    if (parentValidation.status === "pass") {
      await this.workSource.markStatus(childTask.id, "done", childDone.evidence);
      return {
        returnValue: childDone,
        eventsProcessed: budget.processedEvents,
      };
    }

    const failed: ChildFailed = {
      type: "failed",
      nodeId: childDone.nodeId,
      retryable: true,
      error: `Parent validation failed: ${parentValidation.reasons.join("; ")}`,
      evidence: {
        summary: "Parent validation rejected child completion claim.",
        artifacts: [parentValidation.report_ref],
      },
    };
    return await this.handleChildFailure(parentTask, parentNode, childTask, failed, budget);
  }

  private async handleChildFailure(
    parentTask: WorkTask,
    parentNode: ExecutionNodeState,
    childTask: WorkTask,
    failed: ChildFailed,
    budget: RunBudget,
  ): Promise<NodeExecutionResult> {
    const childNode = await this.reloadNode(childTask.id, failed.nodeId);
    if (failed.retryable && childNode.retryCount < this.maxRetries) {
      const retryCount = childNode.retryCount + 1;
      await this.markNode(childTask, childNode, "pending", retryCount, undefined);
      return await this.executeNode(childTask, parentNode, budget, `Retry after failure: ${failed.error}`);
    }

    await this.markNode(childTask, childNode, "failed", childNode.retryCount, undefined);
    const request = {
      id: asDecisionId(`decision:${parentNode.id}:failed:${failed.nodeId}:${this.now()}`),
      nodeId: parentNode.id,
      taskId: parentTask.id,
      surface: "routing" as const,
      prompt: `Child ${failed.nodeId} failed after bounded retries: ${failed.error}`,
      context: {
        affectedNodeId: failed.nodeId,
        affectedTaskId: childTask.id,
        childError: failed.error,
      },
    };
    const record = await this.decisionProvider.decideRouting(request, {
      agentTransport: this.agentTransport,
      cwd: this.cwd,
    });
    await this.persistDecisionRecord(record);
    await this.markNode(parentTask, parentNode, "needs-decision", parentNode.retryCount, undefined);
    return {
      returnValue: {
        type: "needs-decision",
        nodeId: parentNode.id,
        request,
      },
      eventsProcessed: budget.processedEvents,
    };
  }

  private async routeNeedsDecision(
    parentTask: WorkTask,
    parentNode: ExecutionNodeState,
    childTask: WorkTask,
    childReturn: ChildNeedsDecision,
  ): Promise<RoutedDecisionAction> {
    const request = {
      id: asDecisionId(`decision:${parentNode.id}:routing:${childReturn.nodeId}:${this.now()}`),
      nodeId: parentNode.id,
      taskId: parentTask.id,
      surface: "routing" as const,
      prompt: childReturn.request.prompt,
      ...(childReturn.request.surface === "routing" && childReturn.request.options !== undefined
        ? { options: childReturn.request.options }
        : {}),
      context: {
        affectedNodeId: childReturn.nodeId,
        affectedTaskId: childTask.id,
        originalDecisionId: childReturn.request.id,
        ...(childReturn.request.context === undefined ? {} : childReturn.request.context),
      },
    };
    const record = await this.decisionProvider.decideRouting(request, {
      agentTransport: this.agentTransport,
      cwd: this.cwd,
    });
    await this.persistDecisionRecord(record);
    return await this.applyDecisionAction(record, childTask, childReturn.nodeId);
  }

  private async applyDecisionAction(
    record: DecisionRecord,
    childTask: WorkTask,
    affectedNodeId: NodeId,
  ): Promise<RoutedDecisionAction> {
    const selection = selectDecisionAction(record, this.autonomyProfile);
    await this.recordActionDecision(record, selection, affectedNodeId);

    if (selection.type === "await-human") {
      return {
        type: "await-human",
        record,
        affectedNodeId,
        affectedTaskId: childTask.id,
        instruction: selection.reason,
      };
    }

    if (selection.type === "create-follow-up") {
      const followUpTaskId = await this.workSource.createTask(selection.task, childTask.parentId);
      await this.executionStore.appendEvidence(childTask.id, affectedNodeId, {
        summary: `Created follow-up task ${followUpTaskId} for large decision ${record.id}.`,
      });
      return {
        type: "create-follow-up",
        record,
        affectedNodeId,
        affectedTaskId: childTask.id,
        followUpTaskId,
      };
    }

    const instruction = selection.instruction;
    const patchEvidence: ExecutionEvidence = {
      summary: `Applied decision patch ${record.id}: ${instruction}`,
    };
    await this.executionStore.appendEvidence(childTask.id, affectedNodeId, patchEvidence);
    await this.workSource.patchTask(
      childTask.id,
      {
        body: patchedTaskBody(childTask, record, instruction),
        metadata: patchedTaskMetadata(childTask, record),
      },
      patchEvidence,
    );
    await this.workSource.markStatus(childTask.id, "active", patchEvidence);
    await this.markNode(childTask, await this.reloadNode(childTask.id, affectedNodeId), "pending", 0, undefined);
    return {
      type: "patch-and-resume",
      record,
      affectedNodeId,
      affectedTaskId: childTask.id,
      instruction,
    };
  }

  private async handlePermissionEvent(
    task: WorkTask,
    node: ExecutionNodeState,
    event: Extract<AgentEvent, { readonly type: "needs_permission" }>,
  ): Promise<void> {
    const request = {
      id: asDecisionId(`decision:${node.id}:permission:${event.correlationId}`),
      nodeId: node.id,
      taskId: task.id,
      surface: "permission" as const,
      toolName: event.toolName,
      arguments: event.arguments,
      prompt: event.prompt ?? `May worker ${node.id} use ${event.toolName}?`,
      ...(event.origin === undefined ? {} : { context: event.origin }),
    };
    const record = await this.decisionProvider.decidePermission(request, {
      agentTransport: this.agentTransport,
      cwd: this.cwd,
    });
    await this.persistDecisionRecord(record);
    await this.agentTransport.sendCommand(
      event.sessionId,
      permissionCommand(event.correlationId, record),
    );
  }

  private async handleInputEvent(
    task: WorkTask,
    node: ExecutionNodeState,
    event: Extract<AgentEvent, { readonly type: "needs_input" }>,
  ): Promise<void> {
    const request = {
      id: asDecisionId(`decision:${node.id}:input:${event.correlationId}`),
      nodeId: node.id,
      taskId: task.id,
      surface: "routing" as const,
      prompt: event.prompt,
      ...(event.options === undefined ? {} : { options: event.options }),
    };
    const record = await this.decisionProvider.decideRouting(request, {
      agentTransport: this.agentTransport,
      cwd: this.cwd,
    });
    await this.persistDecisionRecord(record);
    await this.agentTransport.sendCommand(event.sessionId, inputCommand(event.correlationId, event.options, record));
  }

  private async startWorkerSession(
    task: WorkTask,
    node: ExecutionNodeState,
    resumeInstruction: string | undefined,
  ): Promise<AgentSession> {
    const evidence = node.evidence;
    const resumeFromSessionId =
      node.session === undefined || workerRequiresRestart(node)
        ? undefined
        : node.session.sessionId;
    const request: AgentSessionRequest = {
      nodeId: node.id,
      prompt: workerPrompt(task, node, evidence, resumeInstruction, resumeFromSessionId !== undefined),
      cwd: this.cwd,
      ...(resumeFromSessionId === undefined ? {} : { resumeFromSessionId }),
      metadata: {
        taskId: task.id,
        nodeType: node.type,
      },
    };

    try {
      const session = await this.agentTransport.spawnSession(request);
      await this.markNode(task, node, "running", node.retryCount, {
        sessionId: session.id,
        resumeToken: session.id,
        tokenStatus: "resumable",
      });
      await this.executionStore.setCursor(task.id, {
        nodeId: node.id,
        reason: "running",
        updatedAt: this.now(),
      });
      return session;
    } catch (error) {
      if (!(error instanceof AgentSessionResumeRejectedError) || resumeFromSessionId === undefined) {
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
          restartedAfterInvalidResumeToken: true,
        },
      });
      await this.markNode(task, restartedNode, "running", restartedNode.retryCount, {
        sessionId: restarted.id,
        resumeToken: restarted.id,
        tokenStatus: "resumable",
      });
      return restarted;
    }
  }

  private async reconcileAtCheckpoint(): Promise<void> {
    const summaries = await this.workSource.listTasks();
    const executionTaskIds = await this.executionStore.listTaskIds();
    const taskIds = uniqueTaskIds([
      ...summaries.map((summary) => summary.id),
      ...executionTaskIds,
    ]);
    const snapshots = await Promise.all(taskIds.map((taskId) => this.executionStore.load(taskId)));
    const nodes = snapshots.flatMap((snapshot) => snapshot.nodes);
    const executionSnapshot: ExecutionStoreReconciliationSnapshot = {
      nodes: nodes.map((node) => reconciliationNodeSnapshot(node)),
    };
    const workSnapshot = await this.workSourceSnapshot(summaries, nodes);
    const actions = reconcileCheckpoints(workSnapshot, executionSnapshot);
    for (const action of actions) {
      await this.applyReconciliationAction(action, nodes);
    }
  }

  private async workSourceSnapshot(
    summaries: readonly WorkTaskSummary[],
    nodes: readonly ExecutionNodeState[],
  ): Promise<WorkSourceReconciliationSnapshot> {
    const parentTaskIds = new Set(
      summaries
        .map((summary) => summary.parentId)
        .filter((parentId) => parentId !== undefined),
    );
    const tasks: ReconciliationWorkTaskSnapshot[] = [];

    for (const summary of summaries) {
      const node = nodes.find((candidate) =>
        candidate.taskId === summary.id &&
        candidate.status !== "cancelled" &&
        candidate.status !== "superseded"
      );
      const needsDefinitionRead =
        node === undefined ||
        node.workSourceRevision !== summary.revision ||
        node.workDefinitionFingerprint === undefined;
      const definitionFingerprint = needsDefinitionRead
        ? workDefinitionFingerprint(await this.workSource.getTask(summary.id))
        : node.workDefinitionFingerprint;
      tasks.push({
        id: summary.id,
        status: summary.status,
        revision: summary.revision,
        type: parentTaskIds.has(summary.id) ? "inner" : "leaf",
        ...(summary.parentId === undefined ? {} : { parentTaskId: summary.parentId }),
        definitionFingerprint,
      });
    }

    return { tasks };
  }

  private async applyReconciliationAction(
    action: ReconciliationAction,
    nodes: readonly ExecutionNodeState[],
  ): Promise<void> {
    if (action.type === "schedule-node") {
      await this.executionStore.upsertNode(action.taskId, {
        id: action.nodeId,
        taskId: action.taskId,
        type: action.nodeType,
        status: "pending",
        retryCount: 0,
        ...(action.parentNodeId === undefined ? {} : { parentId: action.parentNodeId }),
        workSourceRevision: action.workSourceRevision,
        ...(action.workDefinitionFingerprint === undefined
          ? {}
          : { workDefinitionFingerprint: action.workDefinitionFingerprint }),
      });
      return;
    }

    const node = requireReconciliationNode(nodes, action.nodeId);

    if (action.type === "cancel-node") {
      await this.executionStore.upsertNode(action.taskId, {
        ...executionNodeInput(node),
        status: "cancelled",
      });
      await this.executionStore.appendEvidence(action.taskId, action.nodeId, {
        summary: `Checkpoint reconciliation cancelled node ${action.nodeId}: task disappeared from WorkSource.`,
      });
      return;
    }

    if (action.type === "drop-from-queue") {
      await this.executionStore.upsertNode(action.taskId, {
        ...executionNodeInput(node),
        status: "done",
        workSourceRevision: action.workSourceRevision,
        ...(action.workDefinitionFingerprint === undefined
          ? {}
          : { workDefinitionFingerprint: action.workDefinitionFingerprint }),
      });
      await this.executionStore.appendEvidence(action.taskId, action.nodeId, {
        summary: `Checkpoint reconciliation dropped node ${action.nodeId}: task was externally marked done.`,
      });
      return;
    }

    if (action.type === "mark-stale") {
      await this.executionStore.upsertNode(action.taskId, {
        ...executionNodeInput(node),
        status: "pending",
        retryCount: 0,
        workSourceRevision: action.workSourceRevision,
        workDefinitionFingerprint: action.workDefinitionFingerprint,
      });
      await this.executionStore.appendEvidence(action.taskId, action.nodeId, {
        summary: `Checkpoint reconciliation marked node ${action.nodeId} stale after WorkSource definition changed; existing work product was not reverted.`,
      });
      return;
    }

    if (action.type === "refresh-observed-revision") {
      await this.executionStore.upsertNode(action.taskId, {
        ...executionNodeInput(node),
        workSourceRevision: action.workSourceRevision,
        ...(action.workDefinitionFingerprint === undefined
          ? {}
          : { workDefinitionFingerprint: action.workDefinitionFingerprint }),
      });
      return;
    }

    const interrupt = await this.agentTransport.interruptSession(
      action.sessionId,
      `Checkpoint reconciliation superseded node ${action.nodeId}: ${action.reason}.`,
    );
    if (interrupt.workProduct !== undefined) {
      await this.executionStore.appendEvidence(action.taskId, action.nodeId, interrupt.workProduct);
    }
    await this.executionStore.upsertNode(action.taskId, {
      ...executionNodeInput(node),
      status: "superseded",
    });
    await this.executionStore.appendEvidence(action.taskId, action.nodeId, {
      summary: `Checkpoint reconciliation marked node ${action.nodeId} superseded after ${action.reason}.`,
    });
    await this.agentTransport.disposeSession(action.sessionId);

    if (action.replacement !== undefined) {
      await this.executionStore.upsertNode(action.taskId, {
        id: action.replacement.nodeId,
        taskId: action.taskId,
        type: action.replacement.nodeType,
        status: "pending",
        retryCount: 0,
        ...(node.parentId === undefined ? {} : { parentId: node.parentId }),
        workSourceRevision: action.replacement.workSourceRevision,
        workDefinitionFingerprint: action.replacement.workDefinitionFingerprint,
      });
    }
  }

  private async ensureNode(
    task: WorkTask,
    type: "leaf" | "inner",
    parent: ExecutionNodeState | undefined,
  ): Promise<ExecutionNodeState> {
    const snapshot = await this.executionStore.load(task.id);
    const existing = snapshot.nodes.find((candidate) =>
      candidate.taskId === task.id && candidate.status !== "cancelled" && candidate.status !== "superseded"
    );
    if (existing !== undefined) {
      if (existing.parentId === undefined && parent !== undefined) {
        await this.executionStore.upsertNode(task.id, {
          ...executionNodeInput(existing),
          parentId: parent.id,
        });
        return await this.reloadNode(task.id, existing.id);
      }
      return existing;
    }

    const input: ExecutionNodeInput = {
      id: nodeIdForTask(task.id),
      taskId: task.id,
      type,
      status: "pending",
      retryCount: 0,
      ...(parent === undefined ? {} : { parentId: parent.id }),
      workSourceRevision: task.revision,
      workDefinitionFingerprint: workDefinitionFingerprint(task),
    };
    await this.executionStore.upsertNode(task.id, input);
    return await this.reloadNode(task.id, input.id);
  }

  private async markNode(
    task: WorkTask,
    node: ExecutionNodeState,
    status: ExecutionNodeInput["status"],
    retryCount: number,
    session: ExecutionNodeInput["session"],
  ): Promise<void> {
    await this.executionStore.upsertNode(task.id, {
      id: node.id,
      taskId: task.id,
      type: node.type,
      status,
      retryCount,
      ...(node.parentId === undefined ? {} : { parentId: node.parentId }),
      ...(session === undefined ? {} : { session }),
      ...(node.workSourceRevision === undefined
        ? {}
        : { workSourceRevision: node.workSourceRevision }),
      ...(node.workDefinitionFingerprint === undefined
        ? {}
        : { workDefinitionFingerprint: node.workDefinitionFingerprint }),
    });
  }

  private async reloadNode(taskId: TaskId, nodeId: NodeId): Promise<ExecutionNodeState> {
    const snapshot = await this.executionStore.load(taskId);
    const node = snapshot.nodes.find((candidate) => candidate.id === nodeId);
    if (node === undefined) throw new Error(`Supervisor could not reload node ${nodeId}`);
    return node;
  }

  private async loadParentNode(parentId: NodeId): Promise<ExecutionNodeState | undefined> {
    const tasks = await this.workSource.listTasks();
    for (const task of tasks) {
      const snapshot = await this.executionStore.load(task.id);
      const node = snapshot.nodes.find((candidate) => candidate.id === parentId);
      if (node !== undefined) return node;
    }
    return undefined;
  }

  private async childTasks(parentId: TaskId): Promise<readonly WorkTaskSummary[]> {
    const tasks = await this.workSource.listTasks();
    return tasks
      .filter((task) => task.parentId === parentId && task.status !== "done")
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  private async persistDecisionRecord(record: DecisionRecord): Promise<void> {
    await this.executionStore.recordDecision(record.request.taskId, record.request.nodeId, record);
  }

  private async recordActionDecision(
    source: DecisionRecord,
    selection: DecisionActionSelection,
    affectedNodeId: NodeId,
  ): Promise<void> {
    const record: DecisionRecord = {
      id: asDecisionId(`${source.id}:action:${selection.type}`),
      request: source.request,
      verdict: source.verdict,
      tier: source.tier,
      rationale: `Decision action ${selection.type} selected for ${affectedNodeId} (${selection.size} decision).`,
      createdAt: this.now(),
    };
    await this.executionStore.recordDecision(source.request.taskId, source.request.nodeId, record);
  }
}

function nodeIdForTask(taskId: TaskId): NodeId {
  return defaultNodeIdForTask(taskId);
}

function uniqueTaskIds(taskIds: readonly TaskId[]): readonly TaskId[] {
  return Array.from(new Set(taskIds)).sort((left, right) => left.localeCompare(right));
}

function reconciliationNodeSnapshot(node: ExecutionNodeState): ReconciliationNodeSnapshot {
  const evidence = latestEvidence(node);
  return {
    id: node.id,
    taskId: node.taskId,
    type: node.type,
    status: node.status,
    retryCount: node.retryCount,
    ...(node.parentId === undefined ? {} : { parentId: node.parentId }),
    ...(node.session === undefined ? {} : { sessionId: node.session.sessionId }),
    ...(node.workSourceRevision === undefined
      ? {}
      : { workSourceRevision: node.workSourceRevision }),
    ...(node.workDefinitionFingerprint === undefined
      ? {}
      : { workDefinitionFingerprint: node.workDefinitionFingerprint }),
    ...(evidence === undefined ? {} : { latestEvidence: evidence }),
  };
}

function executionNodeInput(node: ExecutionNodeState): ExecutionNodeInput {
  return {
    id: node.id,
    taskId: node.taskId,
    type: node.type,
    status: node.status,
    retryCount: node.retryCount,
    ...(node.parentId === undefined ? {} : { parentId: node.parentId }),
    ...(node.session === undefined ? {} : { session: node.session }),
    ...(node.workSourceRevision === undefined
      ? {}
      : { workSourceRevision: node.workSourceRevision }),
    ...(node.workDefinitionFingerprint === undefined
      ? {}
      : { workDefinitionFingerprint: node.workDefinitionFingerprint }),
  };
}

function requireReconciliationNode(
  nodes: readonly ExecutionNodeState[],
  nodeId: NodeId,
): ExecutionNodeState {
  const node = nodes.find((candidate) => candidate.id === nodeId);
  if (node === undefined) throw new Error(`Reconciliation action referenced unknown node ${nodeId}`);
  return node;
}

function nodeRef(node: ExecutionNodeState, status: NodeRef["status"]): NodeRef {
  return {
    id: node.id,
    taskId: node.taskId,
    type: node.type,
    status,
    ...(node.parentId === undefined ? {} : { parentId: node.parentId }),
  };
}

function latestEvidence(node: ExecutionNodeState): ExecutionEvidence | undefined {
  return node.evidence[node.evidence.length - 1];
}

function patchedTaskBody(task: WorkTask, record: DecisionRecord, instruction: string): string {
  return [
    task.body,
    "",
    "## Daimyo Decision Patch",
    "",
    `Decision ${record.id}: ${instruction}`,
  ].join("\n");
}

function patchedTaskMetadata(task: WorkTask, record: DecisionRecord): JsonObject {
  return {
    ...(task.metadata ?? {}),
    daimyo_last_decision_patch: {
      decision_id: record.id,
      action: "patch-and-resume",
      instruction: verdictInstruction(record.verdict),
    },
  };
}

function childFailed(
  nodeId: NodeId,
  error: string,
  retryable: boolean,
  evidence: ExecutionEvidence | undefined,
): ChildFailed {
  return {
    type: "failed",
    nodeId,
    error,
    retryable,
    ...(evidence === undefined ? {} : { evidence }),
  };
}

function budgetExhausted(budget: RunBudget): boolean {
  return budget.maxEvents !== undefined && budget.processedEvents >= budget.maxEvents;
}

function childReturnToRunStatus(value: ChildReturn): SupervisorRunStatus {
  if (value.type === "done") return "done";
  if (value.type === "needs-decision") return "needs-decision";
  return value.retryable ? "paused" : "failed";
}

function permissionCommand(
  correlationId: TransportCorrelationId,
  record: DecisionRecord,
): AgentCommand {
  const choice = record.verdict.suggested_choice;
  if (
    record.verdict.type === "access" &&
    (choice === "allow" || choice === "approve" || choice === "approved")
  ) {
    return {
      type: "approve",
      correlationId,
      reason: record.verdict.suggested_response ?? record.rationale,
    };
  }
  return {
    type: "deny",
    correlationId,
    reason: record.verdict.suggested_response ?? record.rationale,
  };
}

function inputCommand(
  correlationId: TransportCorrelationId,
  options: readonly string[] | undefined,
  record: DecisionRecord,
): AgentCommand {
  const choice = record.verdict.suggested_choice;
  if (choice !== null && options?.includes(choice) === true) {
    return {
      type: "choose_option",
      correlationId,
      option: choice,
    };
  }
  return {
    type: "respond",
    correlationId,
    response: record.verdict.suggested_response ?? choice ?? record.rationale,
  };
}

function workerPrompt(
  task: WorkTask,
  node: ExecutionNodeState,
  evidence: readonly ExecutionEvidence[],
  resumeInstruction: string | undefined,
  resuming: boolean,
): string {
  return [
    `Daimyo ${resuming ? "resume" : "start"} for leaf node ${node.id}.`,
    "You are a disposable worker. Implement only this task, run local checks, and return only JSON.",
    `Task: ${task.title}`,
    task.body,
    `Acceptance criteria:\n${task.acceptanceCriteria.map((criterion) => `- ${criterion}`).join("\n")}`,
    resumeInstruction === undefined ? "" : `Parent decision/retry instruction:\n${resumeInstruction}`,
    evidence.length === 0
      ? "Prior evidence: none"
      : `Prior evidence:\n${evidence.map((item) => `- ${item.summary}`).join("\n")}`,
    "Return contract JSON:",
    '{"type":"done","evidence":{"summary":"...","artifacts":[],"touchedFiles":[]}}',
    '{"type":"needs-decision","prompt":"...","options":[],"context":{}}',
    '{"type":"failed","error":"...","retryable":true,"evidence":{"summary":"..."}}',
  ]
    .filter((part) => part.length > 0)
    .join("\n\n");
}

function parseWorkerReturn(result: string, nodeId: NodeId, taskId: TaskId): ChildReturn {
  const parsed: JsonValue = JSON.parse(result);
  const object = readObjectValue(parsed, "worker return");
  const type = readString(object, "type");
  if (type === "done") {
    return {
      type,
      nodeId,
      evidence: readEvidence(readObject(object, "evidence")),
    };
  }
  if (type === "needs-decision") {
    const options = readOptionalStringArray(object, "options");
    const context = readOptionalObject(object, "context");
    const decisionId = asDecisionId(`decision:${nodeId}:worker:${stablePromptId(readString(object, "prompt"))}`);
    return {
      type,
      nodeId,
      request: {
        id: decisionId,
        nodeId,
        taskId,
        surface: "routing",
        prompt: readString(object, "prompt"),
        ...(options === undefined ? {} : { options }),
        ...(context === undefined ? {} : { context }),
      },
    };
  }
  if (type === "failed") {
    const evidence = readOptionalObject(object, "evidence");
    return {
      type,
      nodeId,
      error: readString(object, "error"),
      retryable: readBoolean(object, "retryable"),
      ...(evidence === undefined ? {} : { evidence: readEvidence(evidence) }),
    };
  }
  throw new Error(`Unknown worker return type: ${type}`);
}

function stablePromptId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "request";
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

function readBoolean(source: JsonObject, key: string): boolean {
  const value = source[key];
  if (typeof value === "boolean") return value;
  throw new Error(`Expected ${key} to be a boolean`);
}

function readOptionalStringArray(
  source: JsonObject,
  key: string,
): readonly string[] | undefined {
  const value = source[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new Error(`Expected ${key} to be a string array`);
  }
  return value;
}
