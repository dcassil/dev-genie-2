import { describe, expect, it } from "vitest";
import {
  asAgentSessionId,
  asNodeId,
  asTaskId,
  reconcileCheckpoints,
  workDefinitionFingerprint,
} from "../../src/core/index.js";
import type {
  ExecutionStoreReconciliationSnapshot,
  ReconciliationNodeSnapshot,
  ReconciliationWorkTaskSnapshot,
  WorkSourceReconciliationSnapshot,
} from "../../src/core/index.js";
import type { WorkTask } from "../../src/core/ports/work-source.js";

describe("checkpoint reconciliation", () => {
  it("schedules a node for a new WorkSource id", () => {
    expect(actions([workTask("task-new")], [])).toEqual([
      {
        type: "schedule-node",
        taskId: asTaskId("task-new"),
        nodeId: asNodeId("node:task-new"),
        nodeType: "leaf",
        workSourceRevision: "r1",
        workDefinitionFingerprint: "fp-task-new-r1",
      },
    ]);
  });

  it("cancels an idle node whose task id disappeared", () => {
    expect(actions([], [node("task-gone", "pending")])).toEqual([
      {
        type: "cancel-node",
        taskId: asTaskId("task-gone"),
        nodeId: asNodeId("node:task-gone"),
        reason: "missing-from-work-source",
      },
    ]);
  });

  it("marks an idle node stale when acceptance/dependency fingerprint changes", () => {
    expect(
      actions(
        [workTask("task-stale", { revision: "r2", fingerprint: "new-definition" })],
        [
          node("task-stale", "pending", {
            revision: "r1",
            fingerprint: "old-definition",
          }),
        ],
      ),
    ).toEqual([
      {
        type: "mark-stale",
        taskId: asTaskId("task-stale"),
        nodeId: asNodeId("node:task-stale"),
        workSourceRevision: "r2",
        workDefinitionFingerprint: "new-definition",
        reason: "definition-changed",
      },
    ]);
  });

  it("drops an externally completed task from the queue", () => {
    expect(
      actions(
        [workTask("task-done", { status: "done", revision: "r2" })],
        [node("task-done", "pending", { revision: "r1" })],
      ),
    ).toEqual([
      {
        type: "drop-from-queue",
        taskId: asTaskId("task-done"),
        nodeId: asNodeId("node:task-done"),
        workSourceRevision: "r2",
        workDefinitionFingerprint: "fp-task-done-r2",
        reason: "externally-done",
      },
    ]);
  });

  it("interrupts and supersedes an in-flight worker when its definition changes", () => {
    expect(
      actions(
        [workTask("task-flight", { revision: "r2", fingerprint: "new-definition" })],
        [
          node("task-flight", "running", {
            revision: "r1",
            fingerprint: "old-definition",
            sessionId: "session-flight",
          }),
        ],
      ),
    ).toEqual([
      {
        type: "interrupt-and-supersede",
        taskId: asTaskId("task-flight"),
        nodeId: asNodeId("node:task-flight"),
        sessionId: asAgentSessionId("session-flight"),
        reason: "definition-changed",
        replacement: {
          nodeId: asNodeId("node:task-flight:reconciled:r2"),
          nodeType: "leaf",
          workSourceRevision: "r2",
          workDefinitionFingerprint: "new-definition",
        },
      },
    ]);
  });

  it("fails loudly when WorkSource ids cannot support stable diffing", () => {
    expect(() =>
      actions(
        [
          workTask("task-duplicate"),
          workTask("task-duplicate", { revision: "r2" }),
        ],
        [],
      ),
    ).toThrow(/duplicate task id/);
  });

  it("fingerprints acceptance criteria and dependency metadata only", () => {
    const base = fullTask("task-fingerprint", "r1", ["same"], {
      depends_on: ["task-a"],
      unrelated: "old",
    });
    const bodyOnlyChange = {
      ...base,
      body: "changed body",
      metadata: { depends_on: ["task-a"], unrelated: "new" },
    } satisfies WorkTask;
    const dependencyChange = {
      ...base,
      metadata: { depends_on: ["task-b"], unrelated: "old" },
    } satisfies WorkTask;

    expect(workDefinitionFingerprint(bodyOnlyChange)).toBe(workDefinitionFingerprint(base));
    expect(workDefinitionFingerprint(dependencyChange)).not.toBe(workDefinitionFingerprint(base));
  });
});

function actions(
  tasks: readonly ReconciliationWorkTaskSnapshot[],
  nodes: readonly ReconciliationNodeSnapshot[],
) {
  const workSnapshot: WorkSourceReconciliationSnapshot = { tasks };
  const executionSnapshot: ExecutionStoreReconciliationSnapshot = { nodes };
  return reconcileCheckpoints(workSnapshot, executionSnapshot);
}

function workTask(
  id: string,
  options: {
    readonly status?: ReconciliationWorkTaskSnapshot["status"];
    readonly revision?: string;
    readonly fingerprint?: string;
  } = {},
): ReconciliationWorkTaskSnapshot {
  const revision = options.revision ?? "r1";
  return {
    id: asTaskId(id),
    status: options.status ?? "todo",
    revision,
    type: "leaf",
    definitionFingerprint: options.fingerprint ?? `fp-${id}-${revision}`,
  };
}

function node(
  taskId: string,
  status: ReconciliationNodeSnapshot["status"],
  options: {
    readonly revision?: string;
    readonly fingerprint?: string;
    readonly sessionId?: string;
  } = {},
): ReconciliationNodeSnapshot {
  return {
    id: asNodeId(`node:${taskId}`),
    taskId: asTaskId(taskId),
    type: "leaf",
    status,
    retryCount: 0,
    workSourceRevision: options.revision ?? "r1",
    workDefinitionFingerprint: options.fingerprint ?? `fp-${taskId}-${options.revision ?? "r1"}`,
    ...(options.sessionId === undefined
      ? {}
      : { sessionId: asAgentSessionId(options.sessionId) }),
  };
}

function fullTask(
  id: string,
  revision: string,
  acceptanceCriteria: readonly string[],
  metadata: WorkTask["metadata"],
): WorkTask {
  return {
    id: asTaskId(id),
    title: id,
    body: "body",
    acceptanceCriteria,
    status: "todo",
    revision,
    ...(metadata === undefined ? {} : { metadata }),
  };
}
