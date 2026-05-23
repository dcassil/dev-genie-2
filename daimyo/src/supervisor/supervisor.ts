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
  asNodeId,
  asTaskId,
  decisionRecordId,
  makeArtifactReference,
  makeDecisionRecord,
  makeExecutionEvidence,
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
  readonly maxConcurrency?: number;
  readonly maxQuiesceAttempts?: number;
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

interface ActiveWorker {
  readonly task: WorkTask;
  readonly node: ExecutionNodeState;
  readonly session: AgentSession;
}

type WorkerEventResult =
  | {
      readonly type: "continue";
      readonly node: ExecutionNodeState;
    }
  | {
      readonly type: "done";
      readonly returnValue: ChildDone;
      readonly node: ExecutionNodeState;
    }
  | {
      readonly type: "needs-decision";
      readonly returnValue: ChildNeedsDecision;
      readonly node: ExecutionNodeState;
    }
  | {
      readonly type: "failed";
      readonly returnValue: ChildFailed;
      readonly node: ExecutionNodeState;
    };

interface OwnershipSurface {
  readonly taskId: TaskId;
  readonly ownsFiles: readonly string[];
  readonly ownsInterfaces: readonly string[];
  readonly ownsData: readonly string[];
  readonly ownsWorkflowSteps: readonly string[];
  readonly dependsOn: readonly string[];
}

interface ConflictClassification {
  readonly level: "hard" | "soft" | "none";
  readonly affectedTaskIds: readonly TaskId[];
  readonly reason: string;
}

const DEFAULT_MAX_RETRIES = 1;
const DEFAULT_MAX_CONCURRENCY = 4;
const DEFAULT_MAX_QUIESCE_ATTEMPTS = 2;

export class Supervisor {
  private readonly agentTransport: AgentTransport;
  private readonly workSource: WorkSource;
  private readonly executionStore: ExecutionStore;
  private readonly validation: Validation;
  private readonly decisionProvider: DecisionProvider;
  private readonly cwd: string;
  private readonly maxRetries: number;
  private readonly maxConcurrency: number;
  private readonly maxQuiesceAttempts: number;
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
    this.maxConcurrency = options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
    if (this.maxConcurrency < 1) throw new Error("Supervisor maxConcurrency must be at least 1");
    this.maxQuiesceAttempts = options.maxQuiesceAttempts ?? DEFAULT_MAX_QUIESCE_ATTEMPTS;
    if (this.maxQuiesceAttempts < 1) {
      throw new Error("Supervisor maxQuiesceAttempts must be at least 1");
    }
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
    await this.workSource.markStatus(
      task.id,
      "active",
      simpleEvidence(task.id, `Daimyo inner node ${node.id} started governing children.`),
    );

    const waveResult = await this.executeChildWave(task, node, childSummaries, budget);
    if (waveResult.returnValue.type !== "done") return waveResult;

    const doneEvidence = simpleEvidence(
      task.id,
      `Inner node ${node.id} completed ${childSummaries.length} children after parent-scope validation.`,
    );
    await this.executionStore.appendEvidence(task.id, node.id, doneEvidence);
    await this.markNode(task, node, "done", node.retryCount, undefined);
    await this.executionStore.setCursor(task.id, null);
    await this.workSource.markStatus(task.id, "done", doneEvidence);
    await this.reconcileAtCheckpoint();
    return {
      returnValue: { type: "done", nodeId: node.id, evidence: doneEvidence },
      eventsProcessed: budget.processedEvents,
    };
  }

  private async executeChildWave(
    parentTask: WorkTask,
    parentNode: ExecutionNodeState,
    childSummaries: readonly WorkTaskSummary[],
    budget: RunBudget,
  ): Promise<NodeExecutionResult> {
    const remaining = [...childSummaries].sort((left, right) => left.id.localeCompare(right.id));
    const activeBySession = new Map<AgentSession["id"], ActiveWorker>();
    const completed = new Map<TaskId, ChildDone>();
    const ownership = new Map<TaskId, OwnershipSurface>();
    const quiesceAttempts = new Map<string, number>();

    for (const summary of remaining) {
      ownership.set(summary.id, ownershipSurface(await this.workSource.getTask(summary.id)));
    }

    while (remaining.length > 0 || activeBySession.size > 0) {
      while (remaining.length > 0 && activeBySession.size < this.maxConcurrency) {
        const next = remaining.shift();
        if (next === undefined) break;
        const childTask = await this.workSource.getTask(next.id);
        const grandchildren = await this.childTasks(childTask.id);
        if (grandchildren.length > 0) {
          const childResult = await this.executeNode(childTask, parentNode, budget, undefined);
          if (childResult.returnValue.type === "done") {
            completed.set(childTask.id, childResult.returnValue);
            continue;
          }
          if (childResult.returnValue.type === "needs-decision") {
            const affectedTaskIds = decisionAffectedTaskIds(childResult.returnValue.request.context);
            if (
              affectedTaskIds.length > 0 &&
              !(await this.nodeOwnsAffectedTasks(parentTask.id, affectedTaskIds))
            ) {
              return childResult;
            }
            const action = await this.routeNeedsDecision(parentTask, parentNode, childTask, childResult.returnValue);
            const resumed = await this.handleRoutedAction(
              parentTask,
              parentNode,
              childTask,
              childResult.returnValue,
              action,
              budget,
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
            budget,
          );
          if (handled.returnValue.type !== "done") return handled;
          completed.set(childTask.id, handled.returnValue);
          continue;
        }
        const active = await this.startLeafWorker(childTask, parentNode, undefined);
        activeBySession.set(active.session.id, active);
      }

      if (activeBySession.size === 0) continue;

      if (budgetExhausted(budget)) {
        return {
          returnValue: childFailed(
            parentNode.id,
            "Supervisor event budget exhausted before the child wave reached a terminal state.",
            true,
            latestEvidence(parentNode),
          ),
          eventsProcessed: budget.processedEvents,
        };
      }

      const readSessionId = sortedSessionIds(activeBySession)[0];
      if (readSessionId === undefined) throw new Error("Wave had active workers but no session id");
      const event = await this.agentTransport.readEvent(
        readSessionId,
        this.stallAfterMs === undefined ? undefined : { stallAfterMs: this.stallAfterMs },
      );
      budget.processedEvents += 1;

      const active = activeBySession.get(event.sessionId);
      if (active === undefined) {
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
          budget,
        );
        await this.reconcileAtCheckpoint();
        if (handled.returnValue.type !== "done") return handled;
        completed.set(active.task.id, handled.returnValue);
        continue;
      }

      if (processed.type === "needs-decision") {
        const affectedTaskIds = decisionAffectedTaskIds(processed.returnValue.request.context);
        if (
          affectedTaskIds.length > 0 &&
          !(await this.nodeOwnsAffectedTasks(parentTask.id, affectedTaskIds))
        ) {
          await this.markNode(parentTask, parentNode, "needs-decision", parentNode.retryCount, undefined);
          return {
            returnValue: {
              type: "needs-decision",
              nodeId: parentNode.id,
              request: processed.returnValue.request,
            },
            eventsProcessed: budget.processedEvents,
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
        quiesceAttempts,
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
        budget,
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
      evidence: aggregateEvidence,
    });
    if (parentValidation.status !== "pass") {
      const failed: ChildFailed = {
        type: "failed",
        nodeId: parentNode.id,
        retryable: true,
        error: `Parent validation failed: ${parentValidation.reasons.join("; ")}`,
          evidence: simpleEvidence(parentTask.id, "Parent validation rejected wave completion claims.", {
            producedArtifactIds: [parentValidation.report_ref],
            report_ref: parentValidation.report_ref,
          }),
      };
      for (const [childTaskId, childDone] of completed) {
        const childTask = await this.workSource.getTask(childTaskId);
        const childNode = await this.reloadNode(childTaskId, childDone.nodeId);
        await this.markNode(childTask, childNode, "failed", childNode.retryCount, undefined);
      }
      await this.markNode(parentTask, parentNode, "needs-decision", parentNode.retryCount, undefined);
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
              validationReport: parentValidation.report_ref,
            },
          },
        },
        eventsProcessed: budget.processedEvents,
      };
    }

    for (const [childTaskId, done] of completed) {
      await this.workSource.markStatus(childTaskId, "done", done.evidence);
    }

    return {
      returnValue: { type: "done", nodeId: parentNode.id, evidence: aggregateEvidence },
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
          evidence: latestEvidence(node) ?? simpleEvidence(task.id, `Node ${node.id} already done.`),
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

    const active = await this.startLeafWorker(task, parent, resumeInstruction);
    let currentNode = active.node;

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
        active.session.id,
        this.stallAfterMs === undefined ? undefined : { stallAfterMs: this.stallAfterMs },
      );
      budget.processedEvents += 1;
      const processed = await this.processLeafEvent(
        task,
        currentNode,
        active.session,
        event,
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

  private async startLeafWorker(
    task: WorkTask,
    parent: ExecutionNodeState | undefined,
    resumeInstruction: string | undefined,
  ): Promise<ActiveWorker> {
    const node = await this.ensureNode(task, "leaf", parent);
    await this.workSource.markStatus(
      task.id,
      "active",
      simpleEvidence(task.id, `Daimyo leaf node ${node.id} started worker execution.`),
    );
    const session = await this.startWorkerSession(task, node, resumeInstruction);
    return {
      task,
      node: await this.reloadNode(task.id, node.id),
      session,
    };
  }

  private async processLeafEvent(
    task: WorkTask,
    node: ExecutionNodeState,
    session: AgentSession,
    event: AgentEvent,
  ): Promise<WorkerEventResult> {
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
        reason: `Daimyo interrupted stalled node ${node.id}: ${event.reason}`,
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
          latestEvidence(node),
        ),
      };
    }

    const parsed = parseWorkerReturn(event.result, node.id, task.id);
    if (parsed.type === "done") {
      const validation = await this.validation.validate({
        task,
        node: nodeRef(node, "running"),
        scope: "leaf",
        evidence: parsed.evidence,
      });
      if (validation.status === "pass") {
        await this.executionStore.appendEvidence(task.id, node.id, parsed.evidence);
        await this.markNode(task, node, "done", node.retryCount, undefined);
        await this.executionStore.setCursor(task.id, null);
        if (node.parentId === undefined) {
          await this.workSource.markStatus(task.id, "done", parsed.evidence);
        }
        await this.agentTransport.disposeSession(session.id);
        return {
          type: "done",
          node: await this.reloadNode(task.id, node.id),
          returnValue: parsed,
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
            report_ref: validation.report_ref,
          }),
        },
      };
    }

    if (parsed.type === "needs-decision") {
      await this.markNode(task, node, "needs-decision", node.retryCount, undefined);
      await this.executionStore.setCursor(task.id, {
        nodeId: node.id,
        reason: "awaiting-decision",
        updatedAt: this.now(),
      });
      await this.agentTransport.disposeSession(session.id);
      return {
        type: "needs-decision",
        node: await this.reloadNode(task.id, node.id),
        returnValue: parsed,
      };
    }

    return {
      type: "failed",
      node,
      returnValue: parsed,
    };
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
    await this.workSource.markStatus(
      task.id,
      "blocked",
      simpleEvidence(
        task.id,
        failed.error,
        failed.evidence === undefined
          ? {}
          : { producedArtifactRefs: failed.evidence.produced_artifact_refs },
      ),
    );
    return { returnValue: exhausted, eventsProcessed: budget.processedEvents };
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
      decision_id: asDecisionId(`decision:${parentNode.id}:failed:${failed.nodeId}:${this.now()}`),
      node_id: parentNode.id,
      task_id: parentTask.id,
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
      decision_id: asDecisionId(`decision:${parentNode.id}:routing:${childReturn.nodeId}:${this.now()}`),
      node_id: parentNode.id,
      task_id: parentTask.id,
      surface: "routing" as const,
      prompt: childReturn.request.prompt,
      ...(childReturn.request.surface === "routing" && childReturn.request.options !== undefined
        ? { options: childReturn.request.options }
        : {}),
      context: {
        affectedNodeId: childReturn.nodeId,
        affectedTaskId: childTask.id,
        originalDecisionId: childReturn.request.decision_id,
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

  private async handleRoutedAction(
    parentTask: WorkTask,
    parentNode: ExecutionNodeState,
    childTask: WorkTask,
    childReturn: ChildNeedsDecision,
    action: RoutedDecisionAction,
    budget: RunBudget,
  ): Promise<NodeExecutionResult> {
    if (action.type === "await-human") {
      await this.markNode(parentTask, parentNode, "awaiting-human", parentNode.retryCount, undefined);
      await this.reconcileAtCheckpoint();
      return {
        returnValue: {
          type: "needs-decision",
          nodeId: parentNode.id,
          request: action.record.payload.request,
        },
        eventsProcessed: budget.processedEvents,
      };
    }

    if (action.type === "create-follow-up") {
      const evidence = simpleEvidence(
        childTask.id,
        `Large decision ${decisionRecordId(action.record)} was extracted to follow-up task ${action.followUpTaskId}.`,
      );
      await this.executionStore.appendEvidence(childTask.id, childReturn.nodeId, evidence);
      await this.markNode(childTask, await this.reloadNode(childTask.id, childReturn.nodeId), "done", 0, undefined);
      await this.workSource.markStatus(childTask.id, "done", evidence);
      await this.reconcileAtCheckpoint();
      return {
        returnValue: { type: "done", nodeId: childReturn.nodeId, evidence },
        eventsProcessed: budget.processedEvents,
      };
    }

    const patchedChildTask = await this.workSource.getTask(childTask.id);
    const resumed = await this.executeNode(patchedChildTask, parentNode, budget, action.instruction);
    await this.reconcileAtCheckpoint();
    return resumed;
  }

  private async loadSiblingContext(
    parentNode: ExecutionNodeState,
    sourceTask: WorkTask,
    conflict: ConflictClassification,
  ): Promise<void> {
    for (const taskId of conflict.affectedTaskIds) {
      const task = await this.workSource.getTask(taskId);
      const evidence = simpleEvidence(
        task.id,
        `Soft sibling impact from ${sourceTask.id}: ${conflict.reason}`,
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
            `Parent ${parentNode.id} detected soft impact from ${sourceTask.id}: ${conflict.reason}`,
          ].join("\n"),
          metadata: {
            ...(task.metadata ?? {}),
            daimyo_last_sibling_context: {
              source_task_id: sourceTask.id,
              conflict: conflict.level,
              reason: conflict.reason,
            },
          },
        },
        evidence,
      );
    }
  }

  private async quiesceAffectedSiblings(
    activeBySession: ReadonlyMap<AgentSession["id"], ActiveWorker>,
    conflict: ConflictClassification,
    quiesceAttempts: Map<string, number>,
  ): Promise<readonly WorkTask[]> {
    const quiesced: WorkTask[] = [];
    const affected = new Set(conflict.affectedTaskIds);
    for (const active of activeBySession.values()) {
      if (!affected.has(active.task.id)) continue;
      const attemptKey = `${active.task.id}:${conflict.reason}`;
      const attempts = (quiesceAttempts.get(attemptKey) ?? 0) + 1;
      quiesceAttempts.set(attemptKey, attempts);
      if (attempts > this.maxQuiesceAttempts) continue;
      const interrupt = await this.agentTransport.interruptSession(
        active.session.id,
        `Hard sibling conflict detected by Daimyo parent: ${conflict.reason}`,
      );
      if (interrupt.workProduct !== undefined) {
        await this.executionStore.appendEvidence(active.task.id, active.node.id, interrupt.workProduct);
      }
      await this.markNode(active.task, active.node, "pending", active.node.retryCount, active.node.session);
      quiesced.push(active.task);
    }
    return quiesced;
  }

  private async handleHardConflict(
    parentTask: WorkTask,
    parentNode: ExecutionNodeState,
    sourceTask: WorkTask,
    conflict: ConflictClassification,
    quiescedTasks: readonly WorkTask[],
    budget: RunBudget,
  ): Promise<NodeExecutionResult & { readonly completed: readonly { readonly taskId: TaskId; readonly done: ChildDone }[] }> {
    if (quiescedTasks.length !== conflict.affectedTaskIds.length) {
      const request = {
        decision_id: asDecisionId(`decision:${parentNode.id}:quiesce:${stablePromptId(conflict.reason)}:${this.now()}`),
        node_id: parentNode.id,
        task_id: parentTask.id,
        surface: "routing" as const,
        prompt: `Hard sibling conflict could not be bounded for resume: ${conflict.reason}`,
        context: {
          sourceTaskId: sourceTask.id,
          affectedTaskIds: [...conflict.affectedTaskIds],
          reason: conflict.reason,
        },
      };
      await this.markNode(parentTask, parentNode, "needs-decision", parentNode.retryCount, undefined);
      return {
        returnValue: { type: "needs-decision", nodeId: parentNode.id, request },
        eventsProcessed: budget.processedEvents,
        completed: [],
      };
    }

    const completed: { readonly taskId: TaskId; readonly done: ChildDone }[] = [];
    for (const affectedTask of quiescedTasks) {
      const request = {
        decision_id: asDecisionId(`decision:${parentNode.id}:sibling-impact:${affectedTask.id}:${this.now()}`),
        node_id: parentNode.id,
        task_id: parentTask.id,
        surface: "routing" as const,
        prompt: `Patch and resume ${affectedTask.id} after hard sibling impact from ${sourceTask.id}: ${conflict.reason}`,
        context: {
          sourceTaskId: sourceTask.id,
          affectedTaskId: affectedTask.id,
          affectedTaskIds: [...conflict.affectedTaskIds],
          conflict: conflict.level,
          reason: conflict.reason,
        },
      };
      const record = await this.decisionProvider.decideRouting(request, {
        agentTransport: this.agentTransport,
        cwd: this.cwd,
      });
      await this.persistDecisionRecord(record);
      const action = await this.applyDecisionAction(record, affectedTask, nodeIdForTask(affectedTask.id));
      const childReturn: ChildNeedsDecision = {
        type: "needs-decision",
        nodeId: nodeIdForTask(affectedTask.id),
        request,
      };
      const resumed = await this.handleRoutedAction(
        parentTask,
        parentNode,
        affectedTask,
        childReturn,
        action,
        budget,
      );
      if (resumed.returnValue.type !== "done") {
        return { ...resumed, completed };
      }
      completed.push({
        taskId: affectedTask.id,
        done: {
          type: "done",
          nodeId: resumed.returnValue.nodeId,
          evidence: resumed.returnValue.evidence,
        },
      });
    }
    return {
      returnValue: {
        type: "done",
        nodeId: parentNode.id,
        evidence: simpleEvidence(
          parentTask.id,
          `Resolved hard sibling conflict from ${sourceTask.id}: ${conflict.reason}`,
        ),
      },
      eventsProcessed: budget.processedEvents,
      completed,
    };
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
      await this.executionStore.appendEvidence(
        childTask.id,
        affectedNodeId,
        simpleEvidence(
          childTask.id,
          `Created follow-up task ${followUpTaskId} for large decision ${decisionRecordId(record)}.`,
        ),
      );
      return {
        type: "create-follow-up",
        record,
        affectedNodeId,
        affectedTaskId: childTask.id,
        followUpTaskId,
      };
    }

    const instruction = selection.instruction;
    const patchEvidence = simpleEvidence(
      childTask.id,
      `Applied decision patch ${decisionRecordId(record)}: ${instruction}`,
    );
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
    const affectedNode = await this.reloadNode(childTask.id, affectedNodeId);
    await this.markNode(childTask, affectedNode, "pending", 0, affectedNode.session);
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
      decision_id: asDecisionId(`decision:${node.id}:permission:${event.correlationId}`),
      node_id: node.id,
      task_id: task.id,
      surface: "permission" as const,
      tool_name: event.toolName,
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
      decision_id: asDecisionId(`decision:${node.id}:input:${event.correlationId}`),
      node_id: node.id,
      task_id: task.id,
      surface: "routing" as const,
      prompt: event.prompt,
      ...(event.options === undefined ? {} : { options: [...event.options] }),
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
      await this.executionStore.appendEvidence(
        action.taskId,
        action.nodeId,
        simpleEvidence(
          action.taskId,
          `Checkpoint reconciliation cancelled node ${action.nodeId}: task disappeared from WorkSource.`,
        ),
      );
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
      await this.executionStore.appendEvidence(
        action.taskId,
        action.nodeId,
        simpleEvidence(
          action.taskId,
          `Checkpoint reconciliation dropped node ${action.nodeId}: task was externally marked done.`,
        ),
      );
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
      await this.executionStore.appendEvidence(
        action.taskId,
        action.nodeId,
        simpleEvidence(
          action.taskId,
          `Checkpoint reconciliation marked node ${action.nodeId} stale after WorkSource definition changed; existing work product was not reverted.`,
        ),
      );
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
    await this.executionStore.appendEvidence(
      action.taskId,
      action.nodeId,
      simpleEvidence(
        action.taskId,
        `Checkpoint reconciliation marked node ${action.nodeId} superseded after ${action.reason}.`,
      ),
    );
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

  private async nodeOwnsAffectedTasks(
    parentTaskId: TaskId,
    affectedTaskIds: readonly TaskId[],
  ): Promise<boolean> {
    const summaries = await this.workSource.listTasks();
    const byParent = new Map<TaskId, WorkTaskSummary[]>();
    for (const summary of summaries) {
      if (summary.parentId === undefined) continue;
      const siblings = byParent.get(summary.parentId) ?? [];
      siblings.push(summary);
      byParent.set(summary.parentId, siblings);
    }
    const owned = new Set<TaskId>([parentTaskId]);
    const queue: TaskId[] = [parentTaskId];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) break;
      for (const child of byParent.get(current) ?? []) {
        owned.add(child.id);
        queue.push(child.id);
      }
    }
    return affectedTaskIds.every((taskId) => owned.has(taskId));
  }

  private async persistDecisionRecord(record: DecisionRecord): Promise<void> {
    await this.executionStore.recordDecision(
      asTaskId(record.payload.request.task_id),
      nodeIdForString(record.payload.request.node_id),
      record,
    );
  }

  private async recordActionDecision(
    source: DecisionRecord,
    selection: DecisionActionSelection,
    affectedNodeId: NodeId,
  ): Promise<void> {
    const record = makeDecisionRecord({
      decision_id: asDecisionId(`${source.payload.decision_id}:action:${selection.type}`),
      request: source.payload.request,
      verdict: source.payload.verdict,
      tier: source.payload.tier,
      rationale: `Decision action ${selection.type} selected for ${affectedNodeId} (${selection.size} decision).`,
      created_at: this.now(),
    });
    await this.executionStore.recordDecision(
      asTaskId(source.payload.request.task_id),
      nodeIdForString(source.payload.request.node_id),
      record,
    );
  }
}

function nodeIdForTask(taskId: TaskId): NodeId {
  return defaultNodeIdForTask(taskId);
}

function nodeIdForString(nodeId: string): NodeId {
  return asNodeId(nodeId);
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

function simpleEvidence(
  taskId: TaskId,
  summary: string,
  options: {
    readonly producedArtifactRefs?: readonly ReturnType<typeof makeArtifactReference>[];
    readonly producedArtifactIds?: readonly string[];
    readonly report_ref?: string;
  } = {},
): ExecutionEvidence {
  return makeExecutionEvidence({
    taskId,
    summary,
    ...(options.producedArtifactRefs === undefined
      ? {}
      : { producedArtifactRefs: options.producedArtifactRefs }),
    ...(options.producedArtifactIds === undefined
      ? {}
      : { producedArtifactIds: options.producedArtifactIds }),
    ...(options.report_ref === undefined ? {} : { report_ref: options.report_ref }),
  });
}

function sortedSessionIds(activeBySession: ReadonlyMap<AgentSession["id"], ActiveWorker>): readonly AgentSession["id"][] {
  return Array.from(activeBySession.keys()).sort((left, right) => {
    const leftTask = activeBySession.get(left)?.task.id ?? "";
    const rightTask = activeBySession.get(right)?.task.id ?? "";
    return leftTask.localeCompare(rightTask);
  });
}

function ownershipSurface(task: WorkTask): OwnershipSurface {
  const metadata = task.metadata ?? {};
  return {
    taskId: task.id,
    ownsFiles: readMetadataStringArray(metadata, "owns_files", "ownsFiles"),
    ownsInterfaces: readMetadataStringArray(metadata, "owns_interfaces", "ownsInterfaces"),
    ownsData: readMetadataStringArray(metadata, "owns_data", "ownsData"),
    ownsWorkflowSteps: readMetadataStringArray(metadata, "owns_workflow_steps", "ownsWorkflowSteps"),
    dependsOn: readMetadataStringArray(metadata, "depends_on", "dependsOn"),
  };
}

function classifySiblingImpact(
  sourceTaskId: TaskId,
  evidence: ExecutionEvidence,
  ownership: ReadonlyMap<TaskId, OwnershipSurface>,
): ConflictClassification {
  const sourceSurface = ownership.get(sourceTaskId);
  const touchedFiles = uniqueStrings([
    ...evidence.touch_report.touched_files,
    ...(evidence.intended_files ?? []),
  ]);
  const touchedInterfaces = uniqueStrings([
    ...evidence.touch_report.touched_interfaces,
    ...(evidence.intended_interfaces ?? []),
  ]);
  const touchedData = uniqueStrings([
    ...evidence.touch_report.touched_data,
    ...(evidence.intended_data ?? []),
  ]);
  const hardAffected = new Set<TaskId>();
  const softAffected = new Set<TaskId>();
  const hardReasons: string[] = [];
  const softReasons: string[] = [];

  for (const [taskId, surface] of ownership) {
    if (taskId === sourceTaskId) continue;
    const fileOverlap = intersection(touchedFiles, surface.ownsFiles);
    const interfaceOverlap = intersection(touchedInterfaces, surface.ownsInterfaces);
    const dataOverlap = intersection(touchedData, surface.ownsData);
    const staticInterfaceOverlap =
      sourceSurface === undefined ? [] : intersection(sourceSurface.ownsInterfaces, surface.ownsInterfaces);

    if (
      fileOverlap.length > 0 ||
      interfaceOverlap.length > 0 ||
      dataOverlap.length > 0 ||
      staticInterfaceOverlap.length > 0
    ) {
      hardAffected.add(taskId);
      hardReasons.push(
        describeOverlap(taskId, "hard", [
          ...fileOverlap.map((value) => `file:${value}`),
          ...interfaceOverlap.map((value) => `interface:${value}`),
          ...dataOverlap.map((value) => `data:${value}`),
          ...staticInterfaceOverlap.map((value) => `shared-interface:${value}`),
        ]),
      );
      continue;
    }

    const dependencyImpact = intersection(
      surface.dependsOn,
      uniqueStrings([
        ...touchedFiles,
        ...touchedInterfaces,
        ...touchedData,
        ...(sourceSurface?.ownsFiles ?? []),
        ...(sourceSurface?.ownsInterfaces ?? []),
        ...(sourceSurface?.ownsData ?? []),
      ]),
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
      reason: hardReasons.join("; "),
    };
  }
  if (softAffected.size > 0) {
    return {
      level: "soft",
      affectedTaskIds: Array.from(softAffected).sort((left, right) => left.localeCompare(right)),
      reason: softReasons.join("; "),
    };
  }
  return {
    level: "none",
    affectedTaskIds: [],
    reason: "no sibling ownership or dependency overlap",
  };
}

function aggregateChildEvidence(children: readonly ChildDone[]): ExecutionEvidence {
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
    intendedData: uniqueStrings(children.flatMap((child) => child.evidence.intended_data ?? [])),
  });
}

function decisionAffectedTaskIds(context: JsonObject | undefined): readonly TaskId[] {
  if (context === undefined) return [];
  const values = [
    ...jsonStringArray(context.affectedTaskIds),
    ...jsonStringArray(context.affected_task_ids),
  ];
  const single = context.affectedTaskId ?? context.affected_task_id;
  if (typeof single === "string") values.push(single);
  return uniqueStrings(values).map((value) => asTaskId(value));
}

function readMetadataStringArray(
  metadata: JsonObject,
  snakeKey: string,
  camelKey: string,
): readonly string[] {
  return uniqueStrings([...jsonStringArray(metadata[snakeKey]), ...jsonStringArray(metadata[camelKey])]);
}

function jsonStringArray(value: JsonValue | undefined): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => typeof entry === "string");
}

function intersection(left: readonly string[], right: readonly string[]): readonly string[] {
  const rightSet = new Set(right);
  return uniqueStrings(left.filter((value) => rightSet.has(value)));
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function uniqueArtifactReferences(values: readonly ReturnType<typeof makeArtifactReference>[]): readonly ReturnType<typeof makeArtifactReference>[] {
  const byId = new Map<string, ReturnType<typeof makeArtifactReference>>();
  for (const value of values) {
    byId.set(`${value.ref_type}:${value.id}:${value.relation ?? ""}`, value);
  }
  return Array.from(byId.values()).sort((left, right) => left.id.localeCompare(right.id));
}

function describeOverlap(taskId: TaskId, level: "hard" | "soft", values: readonly string[]): string {
  return `${level} impact on ${taskId}${values.length === 0 ? "" : ` via ${values.join(", ")}`}`;
}

function patchedTaskBody(task: WorkTask, record: DecisionRecord, instruction: string): string {
  return [
    task.body,
    "",
    "## Daimyo Decision Patch",
    "",
    `Decision ${decisionRecordId(record)}: ${instruction}`,
  ].join("\n");
}

function patchedTaskMetadata(task: WorkTask, record: DecisionRecord): JsonObject {
  return {
    ...(task.metadata ?? {}),
    daimyo_last_decision_patch: {
      decision_id: decisionRecordId(record),
      action: "patch-and-resume",
      instruction: verdictInstruction(record.payload.verdict),
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
  const choice = record.payload.verdict.suggested_choice;
  if (
    record.payload.verdict.type === "access" &&
    (choice === "allow" || choice === "approve" || choice === "approved")
  ) {
    return {
      type: "approve",
      correlationId,
      reason: record.payload.verdict.suggested_response ?? record.payload.rationale,
    };
  }
  return {
    type: "deny",
    correlationId,
    reason: record.payload.verdict.suggested_response ?? record.payload.rationale,
  };
}

function inputCommand(
  correlationId: TransportCorrelationId,
  options: readonly string[] | undefined,
  record: DecisionRecord,
): AgentCommand {
  const choice = record.payload.verdict.suggested_choice;
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
    response: record.payload.verdict.suggested_response ?? choice ?? record.payload.rationale,
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
    `Ownership surface:\n${JSON.stringify(ownershipSurface(task))}`,
    resumeInstruction === undefined ? "" : `Parent decision/retry instruction:\n${resumeInstruction}`,
    evidence.length === 0
      ? "Prior evidence: none"
      : `Prior evidence:\n${evidence.map((item) => `- ${item.summary}`).join("\n")}`,
    "Return contract JSON:",
    '{"type":"done","evidence":{"summary":"...","produced_artifact_refs":[],"touch_report":{"touched_files":[],"touched_interfaces":[],"touched_data":[],"touched_workflow_steps":[]},"intended_files":[],"intended_interfaces":[],"intended_data":[]}}',
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
      evidence: readEvidence(readObject(object, "evidence"), taskId),
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
        decision_id: decisionId,
        node_id: nodeId,
        task_id: taskId,
        surface: "routing",
        prompt: readString(object, "prompt"),
        ...(options === undefined ? {} : { options: [...options] }),
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
      ...(evidence === undefined ? {} : { evidence: readEvidence(evidence, taskId) }),
    };
  }
  throw new Error(`Unknown worker return type: ${type}`);
}

function stablePromptId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "request";
}

function readEvidence(value: JsonObject, taskId: TaskId): ExecutionEvidence {
  const touchReport = readOptionalObject(value, "touch_report");
  const touchedFiles = touchReport === undefined
    ? readOptionalStringArray(value, "touchedFiles")
    : readOptionalStringArray(touchReport, "touched_files");
  const touchedInterfaces = touchReport === undefined
    ? readOptionalStringArray(value, "touchedInterfaces")
    : readOptionalStringArray(touchReport, "touched_interfaces");
  const touchedData = touchReport === undefined
    ? readOptionalStringArray(value, "touchedData")
    : readOptionalStringArray(touchReport, "touched_data");
  const touchedWorkflowSteps = touchReport === undefined
    ? []
    : readOptionalStringArray(touchReport, "touched_workflow_steps") ?? [];
  const intendedFiles = readOptionalStringArray(value, "intended_files") ?? readOptionalStringArray(value, "intendedFiles");
  const intendedInterfaces = readOptionalStringArray(value, "intended_interfaces") ?? readOptionalStringArray(value, "intendedInterfaces");
  const intendedData = readOptionalStringArray(value, "intended_data") ?? readOptionalStringArray(value, "intendedData");
  const reportRef = readOptionalString(value, "report_ref");
  const touchReportTaskId = touchReport === undefined ? taskId : asTaskId(readOptionalString(touchReport, "task_id") ?? taskId);
  return makeExecutionEvidence({
    taskId: touchReportTaskId,
    summary: readString(value, "summary"),
    ...(readOptionalArtifactReferences(value, "produced_artifact_refs") === undefined
      ? {}
      : { producedArtifactRefs: readOptionalArtifactReferences(value, "produced_artifact_refs") ?? [] }),
    ...(readOptionalStringArray(value, "artifacts") === undefined
      ? {}
      : { producedArtifactIds: readOptionalStringArray(value, "artifacts") ?? [] }),
    ...(touchedFiles === undefined ? {} : { touchedFiles }),
    ...(touchedInterfaces === undefined ? {} : { touchedInterfaces }),
    ...(touchedData === undefined ? {} : { touchedData }),
    touchedWorkflowSteps,
    ...(intendedFiles === undefined ? {} : { intendedFiles }),
    ...(intendedInterfaces === undefined ? {} : { intendedInterfaces }),
    ...(intendedData === undefined ? {} : { intendedData }),
    ...(reportRef === undefined ? {} : { report_ref: reportRef }),
  });
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

function readOptionalArtifactReferences(
  source: JsonObject,
  key: string,
): readonly ReturnType<typeof makeArtifactReference>[] | undefined {
  const value = source[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error(`Expected ${key} to be an artifact reference array`);
  return value.map((entry) => {
    const object = readObjectValue(entry, "artifact reference");
    const relation = readOptionalString(object, "relation");
    return makeArtifactReference(
      readString(object, "id"),
      relation === "read" ||
        relation === "derived_from" ||
        relation === "validates" ||
        relation === "produces" ||
        relation === "supersedes" ||
        relation === "patches" ||
        relation === "blocks"
        ? relation
        : "produces",
    );
  });
}
