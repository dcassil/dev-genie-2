import { appendFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  asDecisionId,
  asNodeId,
  asTaskId,
  JsonlExecutionStore,
  makeDecisionRecord,
  makeExecutionEvidence,
  rebuildExecutionNodeTree,
  workerRequiresRestart,
} from "../../src/core/index.js";
import type {
  DecisionRecord,
  ExecutionCursor,
  ExecutionNodeState,
} from "../../src/core/index.js";
import { FakeAgentTransport, FakeWorkSource } from "../../src/test-support/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  const dirs = tempDirs.splice(0);
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("JsonlExecutionStore", () => {
  it("reconstructs the node tree, statuses, retry counts, decisions, and cursor after process loss", async () => {
    const workspaceDir = await makeWorkspace();
    const store = new JsonlExecutionStore({ workspaceDir });
    const transport = new FakeAgentTransport();
    const rootTaskId = asTaskId("task-root");
    const rootNodeId = asNodeId("node-root");
    const childNodeId = asNodeId("node-child");
    const session = await transport.spawnSession({
      nodeId: childNodeId,
      prompt: "work on child",
      cwd: workspaceDir,
    });
    const cursor: ExecutionCursor = {
      nodeId: childNodeId,
      reason: "running",
      updatedAt: "2026-05-22T20:00:00.000Z",
    };

    await store.upsertNode(rootTaskId, {
      id: rootNodeId,
      taskId: rootTaskId,
      type: "inner",
      status: "running",
      retryCount: 0,
    });
    await store.upsertNode(rootTaskId, {
      id: childNodeId,
      taskId: asTaskId("task-child"),
      parentId: rootNodeId,
      type: "leaf",
      status: "needs-decision",
      retryCount: 2,
      session: {
        sessionId: session.id,
        resumeToken: "resume-token-1",
        tokenStatus: "resumable",
      },
    });
    const childTaskId = asTaskId("task-child");
    const record = makeTestDecisionRecord(childNodeId, childTaskId);
    await store.recordDecision(rootTaskId, childNodeId, record);
    const evidence = makeExecutionEvidence({
      taskId: childTaskId,
      summary: "child produced a partial patch",
      touchedFiles: ["src/example.ts"],
    });
    await store.appendEvidence(rootTaskId, childNodeId, evidence);
    await store.setCursor(rootTaskId, cursor);

    const freshStore = new JsonlExecutionStore({ workspaceDir });
    const snapshot = await freshStore.load(rootTaskId);
    const tree = rebuildExecutionNodeTree(snapshot);
    const root = requireValue(tree[0], "root tree");
    const child = requireValue(root.children[0], "child tree").node;

    expect(snapshot.cursor).toEqual(cursor);
    expect(root.node.status).toBe("running");
    expect(child.status).toBe("needs-decision");
    expect(child.retryCount).toBe(2);
    expect(child.session?.resumeToken).toBe("resume-token-1");
    expect(child.decisionRecordIds).toEqual([asDecisionId(record.payload.decision_id)]);
    expect(snapshot.decisions).toEqual([record]);
    expect(child.evidence).toEqual([evidence]);
  });

  it("keeps mid-decision execution state out of WorkSource status", async () => {
    const workspaceDir = await makeWorkspace();
    const store = new JsonlExecutionStore({ workspaceDir });
    const taskId = asTaskId("task-needs-decision");
    const nodeId = asNodeId("node-needs-decision");
    const workSource = new FakeWorkSource([
      {
        id: taskId,
        title: "Task",
        body: "Do work",
        acceptanceCriteria: [],
        status: "active",
        revision: "1",
      },
    ]);

    await store.upsertNode(taskId, {
      id: nodeId,
      taskId,
      type: "leaf",
      status: "needs-decision",
      retryCount: 0,
    });
    await store.recordDecision(taskId, nodeId, makeTestDecisionRecord(nodeId, taskId));

    const snapshot = await store.load(taskId);
    const summaries = await workSource.listTasks();
    const summary = requireValue(summaries[0], "work summary");

    expect(findNode(snapshot.nodes, nodeId).status).toBe("needs-decision");
    expect(summary.status).toBe("active");
  });

  it("flags an invalid resume token for restart instead of resume", async () => {
    const workspaceDir = await makeWorkspace();
    const store = new JsonlExecutionStore({ workspaceDir });
    const transport = new FakeAgentTransport();
    const taskId = asTaskId("task-restart");
    const nodeId = asNodeId("node-restart");
    const session = await transport.spawnSession({
      nodeId,
      prompt: "work",
      cwd: workspaceDir,
    });

    await store.upsertNode(taskId, {
      id: nodeId,
      taskId,
      type: "leaf",
      status: "running",
      retryCount: 1,
      session: {
        sessionId: session.id,
        resumeToken: "expired-token",
        tokenStatus: "resumable",
      },
    });
    const evidence = makeExecutionEvidence({
      taskId,
      summary: "validation output captured before process loss",
    });
    await store.appendEvidence(taskId, nodeId, evidence);
    await store.invalidateResumeToken(
      taskId,
      nodeId,
      "transport rejected token after retention window",
      "2026-05-22T20:10:00.000Z",
    );

    const freshStore = new JsonlExecutionStore({ workspaceDir });
    const node = findNode((await freshStore.load(taskId)).nodes, nodeId);

    expect(workerRequiresRestart(node)).toBe(true);
    expect(node.session).toEqual({
      sessionId: session.id,
      resumeToken: "expired-token",
      tokenStatus: "restart-required",
      restartReason: "transport rejected token after retention window",
      invalidatedAt: "2026-05-22T20:10:00.000Z",
    });
    expect(node.evidence).toEqual([evidence]);
  });

  it("ignores and repairs an interrupted trailing write before later appends", async () => {
    const workspaceDir = await makeWorkspace();
    const store = new JsonlExecutionStore({ workspaceDir });
    const taskId = asTaskId("task-crash");
    const nodeId = asNodeId("node-crash");

    await store.upsertNode(taskId, {
      id: nodeId,
      taskId,
      type: "leaf",
      status: "running",
      retryCount: 0,
    });
    await appendFile(store.taskLogPath(taskId), "{\"type\":\"node_upsert\"", "utf8");

    const freshStore = new JsonlExecutionStore({ workspaceDir });
    expect(findNode((await freshStore.load(taskId)).nodes, nodeId).retryCount).toBe(0);

    await freshStore.upsertNode(taskId, {
      id: nodeId,
      taskId,
      type: "leaf",
      status: "running",
      retryCount: 1,
    });

    const repairedContent = await readFile(store.taskLogPath(taskId), "utf8");
    expect(repairedContent).not.toContain("{\"type\":\"node_upsert\"{\"type\"");
    expect(findNode((await freshStore.load(taskId)).nodes, nodeId).retryCount).toBe(1);
  });
});

async function makeWorkspace(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "daimyo-execution-store-"));
  tempDirs.push(dir);
  return dir;
}

function makeTestDecisionRecord(nodeId: ReturnType<typeof asNodeId>, taskId: ReturnType<typeof asTaskId>): DecisionRecord {
  const decisionId = asDecisionId(`decision-${nodeId}`);
  return makeDecisionRecord({
    decision_id: decisionId,
    request: {
      decision_id: decisionId,
      node_id: nodeId,
      task_id: taskId,
      surface: "routing",
      prompt: "Choose an approach",
      options: ["a", "b"],
    },
    verdict: {
      type: "human",
      suggested_choice: null,
      suggested_response: null,
      confidence: 0,
      risk: 10,
      block_trigger: true,
    },
    tier: 3,
    rationale: "fake decision record",
    created_at: "2026-05-22T20:00:01.000Z",
  });
}

function findNode(
  nodes: readonly ExecutionNodeState[],
  nodeId: ReturnType<typeof asNodeId>,
): ExecutionNodeState {
  const node = nodes.find((candidate) => candidate.id === nodeId);
  return requireValue(node, `node ${nodeId}`);
}

function requireValue<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing ${label}`);
  return value;
}
