import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type {
  DecisionRecord,
  DecisionVerdict,
  JsonObject,
  TaskId,
  StructuredModelRequest,
  ValidationRequest,
  ValidationResult,
} from "../../src/index.js";
import {
  asAgentSessionId,
  asDecisionId,
  asNodeId,
  asTaskId,
  asTransportCorrelationId,
  JsonlExecutionStore,
  Supervisor,
  TieredDecisionProvider,
  workDefinitionFingerprint,
} from "../../src/index.js";
import {
  FakeAgentTransport,
  FakeDecisionProvider,
  FakeWorkSource,
} from "../../src/test-support/index.js";
import type { Validation } from "../../src/core/ports/capabilities.js";
import type { AgentEvent } from "../../src/core/ports/agent-transport.js";
import type { WorkTask } from "../../src/core/ports/work-source.js";

const tempDirs: string[] = [];
const fixedNow = (): string => "2026-05-22T22:00:00.000Z";
let decisionSequence = 0;

afterEach(async () => {
  const dirs = tempDirs.splice(0);
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("Supervisor", () => {
  it("resumes a running leaf from the execution store after a fresh supervisor is constructed", async () => {
    const harness = await makeHarness({
      tasks: [task("task-restart", "Restartable leaf")],
      events: [
        logEvent("fake-session-1", "worker made progress"),
        turnEnded("fake-session-1", doneResult("patch complete")),
      ],
      validation: validationScript(["pass"]),
    });

    const firstRun = await harness.supervisor.run(asTaskId("task-restart"), { maxEvents: 1 });
    const restartedSupervisor = makeSupervisor(harness);
    const secondRun = await restartedSupervisor.run(asTaskId("task-restart"));
    const snapshot = await harness.store.load(asTaskId("task-restart"));

    expect(firstRun.status).toBe("paused");
    expect(secondRun.status).toBe("done");
    expect(harness.transport.spawnRequests[1]?.resumeFromSessionId).toBe(
      asAgentSessionId("fake-session-1"),
    );
    expect(snapshot.nodes[0]?.status).toBe("done");
    expect(snapshot.nodes[0]?.session).toBeUndefined();
    expect(harness.transport.disposedSessionIds).toEqual([asAgentSessionId("fake-session-1")]);
    await expect(harness.workSource.getTask(asTaskId("task-restart"))).resolves.toMatchObject({
      status: "done",
    });
  });

  it("retries a failed leaf with the retry count persisted in the execution store", async () => {
    const harness = await makeHarness({
      tasks: [task("task-retry", "Retry leaf")],
      events: [
        turnEnded("fake-session-1", failedResult("first attempt failed", true)),
        turnEnded("fake-session-2", doneResult("retry complete")),
      ],
      validation: validationScript(["pass"]),
    });

    const result = await harness.supervisor.run(asTaskId("task-retry"));
    const snapshot = await harness.store.load(asTaskId("task-retry"));

    expect(result.status).toBe("done");
    expect(snapshot.nodes[0]?.retryCount).toBe(1);
    expect(snapshot.nodes[0]?.status).toBe("done");
    expect(harness.transport.sessions.map((session) => session.id)).toEqual([
      asAgentSessionId("fake-session-1"),
      asAgentSessionId("fake-session-2"),
    ]);
    expect(harness.transport.disposedSessionIds).toEqual([
      asAgentSessionId("fake-session-1"),
      asAgentSessionId("fake-session-2"),
    ]);
  });

  it("patches and resumes a leaf after needs-decision is resolved", async () => {
    const root = task("task-root", "Root inner");
    const child = task("task-child", "Child leaf", root.id);
    const harness = await makeHarness({
      tasks: [root, child],
      events: [
        turnEnded("fake-session-1", needsDecisionResult("Choose API shape", ["a", "b"])),
        turnEnded("fake-session-2", doneResult("decision applied")),
      ],
      validation: validationScript(["pass", "pass"]),
      decisionProvider: new FakeDecisionProvider([
        decisionTemplate(decisionVerdict("decision", "a", "Use option a.")),
      ]),
    });

    const result = await harness.supervisor.run(root.id);
    const rootSnapshot = await harness.store.load(root.id);
    const childSnapshot = await harness.store.load(child.id);

    expect(result.status).toBe("done");
    expect(harness.decisionProvider.requests).toHaveLength(1);
    expect(harness.decisionProvider.requests[0]).toMatchObject({
      surface: "routing",
      nodeId: asNodeId("node:task-root"),
      taskId: root.id,
      prompt: "Choose API shape",
    });
    expect(harness.transport.spawnRequests[1]?.prompt).toContain("Use option a.");
    expect(harness.workSource.patches).toHaveLength(1);
    expect(harness.workSource.patches[0]).toMatchObject({
      id: child.id,
      patch: {
        body: expect.stringContaining("Daimyo Decision Patch"),
      },
    });
    expect(harness.workSource.statusMarks).toContainEqual({
      id: child.id,
      status: "active",
      evidence: {
        summary: expect.stringContaining("Applied decision patch"),
      },
    });
    expect(rootSnapshot.decisions.map((decision) => decision.rationale)).toEqual([
      "queued fake decision",
      expect.stringContaining("Decision action patch-and-resume selected"),
    ]);
    expect(childSnapshot.nodes[0]?.evidence).toContainEqual({
      summary: expect.stringContaining("Applied decision patch"),
    });
    await expect(harness.workSource.getTask(root.id)).resolves.toMatchObject({ status: "done" });
    await expect(harness.workSource.getTask(child.id)).resolves.toMatchObject({ status: "done" });
  });

  it("creates a follow-up for a large below-threshold decision and schedules it on the next checkpoint", async () => {
    const root = task("task-large-root", "Large root");
    const child = task("task-large-child", "Large child", root.id);
    const harness = await makeHarness({
      tasks: [root, child],
      events: [
        turnEnded(
          "fake-session-1",
          needsDecisionResult("Extract follow-up", ["create"], {
            domain: "engineering",
            scope: "local",
            decision_size: "large",
          }),
        ),
      ],
      validation: validationScript(["pass", "pass"]),
      decisionProvider: new FakeDecisionProvider([
        decisionTemplate(decisionVerdict("decision", "create", "Create the follow-up task.")),
      ]),
    });

    const firstRun = await harness.supervisor.run(root.id);
    const createdTaskId = harness.workSource.createdTasks[0]?.id;
    if (createdTaskId === undefined) throw new Error("Expected fake follow-up task to be created");
    harness.transport.pushEvent(turnEnded("fake-session-2", doneResult("follow-up complete")));
    const secondRun = await harness.supervisor.run(root.id);

    expect(firstRun.status).toBe("done");
    expect(harness.workSource.createdTasks).toHaveLength(1);
    expect(harness.workSource.createdTasks[0]).toMatchObject({
      parentId: root.id,
      input: {
        title: expect.stringContaining("Follow up: Extract follow-up"),
      },
    });
    await expect(harness.workSource.getTask(createdTaskId)).resolves.toMatchObject({
      status: "done",
      parentId: root.id,
    });
    expect(secondRun.status).toBe("done");
    expect(harness.transport.spawnRequests[1]).toMatchObject({
      metadata: {
        taskId: createdTaskId,
        nodeType: "leaf",
      },
    });
  });

  it("requires human sign-off before creating a large follow-up above the autonomy threshold", async () => {
    const root = task("task-large-human-root", "Large human root");
    const child = task("task-large-human-child", "Large human child", root.id);
    const harness = await makeHarness({
      tasks: [root, child],
      events: [
        turnEnded(
          "fake-session-1",
          needsDecisionResult("Major architecture decision", ["create"], {
            domain: "engineering",
            scope: "major",
          }),
        ),
      ],
      validation: validationScript([]),
      decisionProvider: new FakeDecisionProvider([
        decisionTemplate(decisionVerdict("decision", "create", "Create the architecture task.")),
      ]),
    });

    const result = await harness.supervisor.run(root.id);
    const rootSnapshot = await harness.store.load(root.id);

    expect(result.status).toBe("needs-decision");
    expect(harness.workSource.createdTasks).toHaveLength(0);
    expect(rootSnapshot.nodes[0]?.status).toBe("awaiting-human");
    expect(rootSnapshot.decisions.map((decision) => decision.rationale)).toEqual([
      "queued fake decision",
      expect.stringContaining("Decision action await-human selected"),
    ]);
  });

  it("lets a Tier 2 read-only investigation improve a low-confidence verdict before patch-and-resume", async () => {
    const root = task("task-tier2-root", "Tier2 root");
    const child = task("task-tier2-child", "Tier2 child", root.id);
    const workspaceDir = await makeWorkspace();
    const store = new JsonlExecutionStore({ workspaceDir });
    const transport = new FakeAgentTransport([
      turnEnded(
        "fake-session-1",
        needsDecisionResult("Choose safe adapter", ["unsafe", "safe"], {
          domain: "engineering",
          scope: "moderate",
        }),
      ),
      turnEnded("fake-session-2", decisionVerdictWithScores("decision", "safe", "Use safe.", 8, 3)),
      turnEnded("fake-session-3", doneResult("safe adapter applied")),
    ]);
    const workSource = new FakeWorkSource([root, child]);
    const validation = validationScript(["pass", "pass"]);
    const decisionProvider = new TieredDecisionProvider({
      executionStore: store,
      modelClient: new FakeDecisionModelClient(
        decisionVerdictWithScores("decision", "unsafe", "Use unsafe.", 4, 6),
      ),
      clock: fixedNow,
    });
    const supervisor = new Supervisor({
      agentTransport: transport,
      workSource,
      executionStore: store,
      validation,
      decisionProvider,
      cwd: workspaceDir,
      now: fixedNow,
    });

    const result = await supervisor.run(root.id);
    const rootSnapshot = await store.load(root.id);

    expect(result.status).toBe("done");
    expect(rootSnapshot.decisions.map((decision) => decision.tier)).toEqual([2, 2]);
    expect(workSource.patches[0]?.patch.body).toContain("Use safe.");
    expect(transport.spawnRequests[1]).toMatchObject({
      metadata: {
        tier: 2,
        mode: "read-only",
      },
    });
    expect(transport.spawnRequests[2]?.prompt).toContain("Use safe.");
  });

  it("keeps completion authority with parent validation when a child claims done", async () => {
    const root = task("task-parent-gate", "Parent gate");
    const child = task("task-child-gate", "Child claim", root.id);
    const harness = await makeHarness({
      tasks: [root, child],
      events: [turnEnded("fake-session-1", doneResult("child claims done"))],
      validation: validationScript(["pass", "fail"]),
      maxRetries: 0,
    });

    const result = await harness.supervisor.run(root.id);
    const rootSnapshot = await harness.store.load(root.id);
    const childSnapshot = await harness.store.load(child.id);

    expect(result.status).toBe("needs-decision");
    expect(harness.validation.requests.map((request) => request.scope)).toEqual([
      "leaf",
      "parent",
    ]);
    expect(rootSnapshot.nodes[0]?.status).toBe("needs-decision");
    expect(childSnapshot.nodes[0]?.status).toBe("failed");
    await expect(harness.workSource.getTask(root.id)).resolves.not.toMatchObject({
      status: "done",
    });
    await expect(harness.workSource.getTask(child.id)).resolves.not.toMatchObject({
      status: "done",
    });
  });

  it("answers permission events through DecisionProvider with the matching correlation id", async () => {
    const correlationId = asTransportCorrelationId("permission-1");
    const harness = await makeHarness({
      tasks: [task("task-permission", "Permission leaf")],
      events: [
        {
          type: "needs_permission",
          sessionId: asAgentSessionId("fake-session-1"),
          correlationId,
          toolName: "Bash",
          arguments: { command: "npm test" },
        },
        turnEnded("fake-session-1", doneResult("permission path complete")),
      ],
      validation: validationScript(["pass"]),
      decisionProvider: new FakeDecisionProvider([
        decisionTemplate(accessVerdict("allow", "Allowed by fake policy.")),
      ]),
    });

    const result = await harness.supervisor.run(asTaskId("task-permission"));

    expect(result.status).toBe("done");
    expect(harness.transport.commands).toEqual([
      {
        sessionId: asAgentSessionId("fake-session-1"),
        command: {
          type: "approve",
          correlationId,
          reason: "Allowed by fake policy.",
        },
      },
    ]);
    expect(harness.decisionProvider.requests[0]).toMatchObject({
      surface: "permission",
      toolName: "Bash",
    });
  });

  it("interrupts stalled workers and retries through the normal failed return path", async () => {
    const stalledCorrelation = asTransportCorrelationId("stalled-1");
    const harness = await makeHarness({
      tasks: [task("task-stalled", "Stalled leaf")],
      events: [
        {
          type: "stalled",
          sessionId: asAgentSessionId("fake-session-1"),
          correlationId: stalledCorrelation,
          elapsedMs: 1000,
          lastProgressAt: "2026-05-22T21:59:00.000Z",
          reason: "quiet",
        },
        {
          type: "exited",
          sessionId: asAgentSessionId("fake-session-1"),
          exitCode: null,
          reason: "interrupted",
          message: "interrupted by supervisor",
        },
        turnEnded("fake-session-2", doneResult("retry after stall")),
      ],
      validation: validationScript(["pass"]),
    });

    const result = await harness.supervisor.run(asTaskId("task-stalled"));
    const snapshot = await harness.store.load(asTaskId("task-stalled"));

    expect(result.status).toBe("done");
    expect(harness.transport.commands[0]).toEqual({
      sessionId: asAgentSessionId("fake-session-1"),
      command: {
        type: "interrupt",
        correlationId: stalledCorrelation,
        reason: expect.stringContaining("Daimyo interrupted stalled node"),
      },
    });
    expect(snapshot.nodes[0]?.retryCount).toBe(1);
  });

  it("recycles every worker across many sequential children", async () => {
    const root = task("task-many-root", "Many root");
    const children = Array.from({ length: 8 }, (_, index) =>
      task(`task-many-${index}`, `Child ${index}`, root.id),
    );
    const harness = await makeHarness({
      tasks: [root, ...children],
      events: children.map((child, index) =>
        turnEnded(`fake-session-${index + 1}`, doneResult(`${child.title} done`)),
      ),
      validation: validationScript(Array.from({ length: children.length * 2 }, () => "pass")),
    });

    const result = await harness.supervisor.run(root.id);

    expect(result.status).toBe("done");
    expect(harness.transport.sessions).toHaveLength(children.length);
    expect(harness.transport.disposedSessionIds).toHaveLength(children.length);
    expect(harness.transport.pendingCorrelations()).toHaveLength(0);
  });

  it("runs independent siblings in the same bounded wave without conflict", async () => {
    const root = task("task-wave-root", "Wave root");
    const left = task("task-wave-left", "Left sibling", root.id, {
      owns_files: ["src/left.ts"],
    });
    const right = task("task-wave-right", "Right sibling", root.id, {
      owns_files: ["src/right.ts"],
    });
    const harness = await makeHarness({
      tasks: [root, left, right],
      events: [
        turnEnded("fake-session-2", doneResult("right done", { touchedFiles: ["src/right.ts"] })),
        turnEnded("fake-session-1", doneResult("left done", { touchedFiles: ["src/left.ts"] })),
      ],
      validation: validationScript(["pass", "pass", "pass"]),
      maxConcurrency: 2,
    });

    const result = await harness.supervisor.run(root.id);

    expect(result.status).toBe("done");
    expect(harness.transport.spawnRequests.slice(0, 2).map((request) => request.nodeId)).toEqual([
      asNodeId("node:task-wave-left"),
      asNodeId("node:task-wave-right"),
    ]);
    expect(harness.transport.interrupts).toHaveLength(0);
    expect(harness.validation.requests.map((request) => request.scope)).toEqual([
      "leaf",
      "leaf",
      "parent",
    ]);
  });

  it("quiesces and resumes an affected sibling after a hard shared-interface conflict", async () => {
    const root = task("task-hard-root", "Hard root");
    const producer = task("task-hard-producer", "Producer", root.id, {
      owns_interfaces: ["SharedApi"],
    });
    const consumer = task("task-hard-consumer", "Consumer", root.id, {
      owns_interfaces: ["SharedApi"],
    });
    const harness = await makeHarness({
      tasks: [root, producer, consumer],
      events: [
        turnEnded(
          "fake-session-2",
          doneResult("producer changed the shared API", { touchedInterfaces: ["SharedApi"] }),
        ),
        turnEnded(
          "fake-session-1",
          doneResult("consumer resumed against patched API", { touchedInterfaces: ["SharedApi"] }),
        ),
      ],
      validation: validationScript(["pass", "pass", "pass"]),
      decisionProvider: new FakeDecisionProvider([
        decisionTemplate(decisionVerdict("decision", "patch", "Update consumer for SharedApi.")),
      ]),
      maxConcurrency: 2,
    });

    const result = await harness.supervisor.run(root.id);

    expect(result.status).toBe("done");
    expect(harness.transport.interrupts).toEqual([
      {
        sessionId: asAgentSessionId("fake-session-1"),
        reason: expect.stringContaining("Hard sibling conflict"),
      },
    ]);
    expect(harness.transport.spawnRequests[2]?.resumeFromSessionId).toBe(
      asAgentSessionId("fake-session-1"),
    );
    expect(harness.workSource.patches[0]).toMatchObject({
      id: consumer.id,
      patch: {
        body: expect.stringContaining("Update consumer for SharedApi."),
      },
    });
  });

  it("loads sibling context for a soft dependency impact without quiescing", async () => {
    const root = task("task-soft-root", "Soft root");
    const producer = task("task-soft-producer", "Producer", root.id, {
      owns_files: ["src/provider.ts"],
    });
    const dependent = task("task-soft-dependent", "Dependent", root.id, {
      owns_files: ["src/dependent.ts"],
      depends_on: ["src/provider.ts"],
    });
    const harness = await makeHarness({
      tasks: [root, producer, dependent],
      events: [
        turnEnded(
          "fake-session-2",
          doneResult("producer touched provider", { touchedFiles: ["src/provider.ts"] }),
        ),
        turnEnded(
          "fake-session-1",
          doneResult("dependent finished with context", { touchedFiles: ["src/dependent.ts"] }),
        ),
      ],
      validation: validationScript(["pass", "pass", "pass"]),
      maxConcurrency: 2,
    });

    const result = await harness.supervisor.run(root.id);

    expect(result.status).toBe("done");
    expect(harness.transport.interrupts).toHaveLength(0);
    expect(harness.workSource.patches[0]).toMatchObject({
      id: dependent.id,
      patch: {
        body: expect.stringContaining("Daimyo Sibling Context"),
      },
    });
  });

  it("bubbles cross-sibling decisions to the node that owns all affected siblings", async () => {
    const root = task("task-bubble-root", "Bubble root");
    const group = task("task-bubble-group", "Bubble group", root.id);
    const local = task("task-bubble-local", "Local child", group.id);
    const outside = task("task-bubble-outside", "Outside sibling", root.id);
    const harness = await makeHarness({
      tasks: [root, group, local, outside],
      events: [
        turnEnded(
          "fake-session-1",
          needsDecisionResult("Change shared contract?", ["patch"], {
            affectedTaskIds: [local.id, outside.id],
          }),
        ),
        turnEnded("fake-session-2", doneResult("local resumed")),
        turnEnded("fake-session-3", doneResult("outside done")),
      ],
      validation: validationScript(["pass", "pass", "pass", "pass"]),
      decisionProvider: new FakeDecisionProvider([
        decisionTemplate(decisionVerdict("decision", "patch", "Patch at root scope.")),
      ]),
      maxConcurrency: 2,
    });

    const result = await harness.supervisor.run(root.id);

    expect(result.status).toBe("done");
    expect(harness.decisionProvider.requests[0]).toMatchObject({
      nodeId: asNodeId("node:task-bubble-root"),
      taskId: root.id,
      prompt: "Change shared contract?",
    });
    expect(harness.workSource.patches[0]).toMatchObject({
      id: group.id,
      patch: {
        body: expect.stringContaining("Patch at root scope."),
      },
    });
  });

  it("restarts from task definition and evidence when a persisted resume token is invalid", async () => {
    const taskId = asTaskId("task-invalid-resume");
    const nodeId = asNodeId("node:task-invalid-resume");
    const expiredSessionId = asAgentSessionId("expired-session");
    const harness = await makeHarness({
      tasks: [task(taskId, "Invalid resume leaf")],
      events: [turnEnded("fake-session-1", doneResult("fresh run complete"))],
      validation: validationScript(["pass"]),
    });
    await harness.store.upsertNode(taskId, {
      id: nodeId,
      taskId,
      type: "leaf",
      status: "running",
      retryCount: 0,
      session: {
        sessionId: expiredSessionId,
        resumeToken: "expired-token",
        tokenStatus: "resumable",
      },
    });
    await harness.store.appendEvidence(taskId, nodeId, {
      summary: "captured work before process loss",
    });
    harness.transport.rejectResumeFor(expiredSessionId);

    const result = await harness.supervisor.run(taskId);
    const snapshot = await harness.store.load(taskId);

    expect(result.status).toBe("done");
    expect(harness.transport.spawnRequests[0]?.resumeFromSessionId).toBe(expiredSessionId);
    expect(harness.transport.spawnRequests[1]?.resumeFromSessionId).toBeUndefined();
    expect(harness.transport.spawnRequests[1]?.prompt).toContain(
      "captured work before process loss",
    );
    expect(snapshot.nodes[0]?.session).toBeUndefined();
  });

  it("interrupts and supersedes an in-flight node when checkpoint reconciliation sees changed acceptance", async () => {
    const oldTask = task("task-superseded", "Superseded leaf");
    const changedTask: WorkTask = {
      ...oldTask,
      acceptanceCriteria: ["changed acceptance"],
      revision: "2",
    };
    const inflightSessionId = asAgentSessionId("inflight-session");
    const harness = await makeHarness({
      tasks: [changedTask],
      events: [turnEnded("fake-session-1", doneResult("replacement completed"))],
      validation: validationScript(["pass"]),
    });
    await harness.store.upsertNode(oldTask.id, {
      id: asNodeId("node:task-superseded"),
      taskId: oldTask.id,
      type: "leaf",
      status: "running",
      retryCount: 0,
      session: {
        sessionId: inflightSessionId,
        resumeToken: "inflight-token",
        tokenStatus: "resumable",
      },
      workSourceRevision: oldTask.revision,
      workDefinitionFingerprint: workDefinitionFingerprint(oldTask),
    });
    harness.transport.setInterruptResult(inflightSessionId, {
      workProduct: {
        summary: "partial worker patch before interrupt",
        artifacts: ["work-product:partial.patch"],
      },
    });

    const result = await harness.supervisor.run(oldTask.id);
    const snapshot = await harness.store.load(oldTask.id);
    const superseded = requireValue(
      snapshot.nodes.find((node) => node.id === asNodeId("node:task-superseded")),
      "superseded node",
    );
    const replacement = requireValue(
      snapshot.nodes.find((node) => node.id !== asNodeId("node:task-superseded")),
      "replacement node",
    );

    expect(result.status).toBe("done");
    expect(harness.transport.interrupts).toEqual([
      {
        sessionId: inflightSessionId,
        reason: expect.stringContaining("definition-changed"),
      },
    ]);
    expect(superseded.status).toBe("superseded");
    expect(superseded.evidence).toContainEqual({
      summary: "partial worker patch before interrupt",
      artifacts: ["work-product:partial.patch"],
    });
    expect(replacement.status).toBe("done");
    expect(replacement.workSourceRevision).toBe("2");
  });

  it("does not rollback prior work product when a completed stale node is re-run", async () => {
    const oldTask = task("task-no-rollback", "No rollback leaf");
    const changedTask: WorkTask = {
      ...oldTask,
      acceptanceCriteria: ["new acceptance"],
      revision: "2",
    };
    const harness = await makeHarness({
      tasks: [changedTask],
      events: [turnEnded("fake-session-1", doneResult("rerun completed"))],
      validation: validationScript(["pass"]),
    });
    await harness.store.upsertNode(oldTask.id, {
      id: asNodeId("node:task-no-rollback"),
      taskId: oldTask.id,
      type: "leaf",
      status: "done",
      retryCount: 0,
      workSourceRevision: oldTask.revision,
      workDefinitionFingerprint: workDefinitionFingerprint(oldTask),
    });
    await harness.store.appendEvidence(oldTask.id, asNodeId("node:task-no-rollback"), {
      summary: "already merged work product",
      artifacts: ["merged:abc123"],
    });

    const result = await harness.supervisor.run(oldTask.id);
    const snapshot = await harness.store.load(oldTask.id);
    const nodeState = requireValue(snapshot.nodes[0], "node state");

    expect(result.status).toBe("done");
    expect(harness.workSource.patches).toHaveLength(0);
    expect(harness.transport.spawnRequests).toHaveLength(1);
    expect(harness.transport.spawnRequests[0]?.prompt).toContain("already merged work product");
    expect(nodeState.evidence).toContainEqual({
      summary: "already merged work product",
      artifacts: ["merged:abc123"],
    });
    expect(nodeState.evidence).toContainEqual({
      summary: expect.stringContaining("existing work product was not reverted"),
    });
  });
});

interface Harness {
  readonly workspaceDir: string;
  readonly store: JsonlExecutionStore;
  readonly transport: FakeAgentTransport;
  readonly workSource: FakeWorkSource;
  readonly decisionProvider: FakeDecisionProvider;
  readonly validation: ScriptedValidation;
  readonly supervisor: Supervisor;
  readonly maxRetries?: number;
  readonly maxConcurrency?: number;
}

async function makeHarness(options: {
  readonly tasks: readonly WorkTask[];
  readonly events: readonly AgentEvent[];
  readonly validation: ScriptedValidation;
  readonly decisionProvider?: FakeDecisionProvider;
  readonly maxRetries?: number;
  readonly maxConcurrency?: number;
}): Promise<Harness> {
  const workspaceDir = await makeWorkspace();
  const store = new JsonlExecutionStore({ workspaceDir });
  const transport = new FakeAgentTransport(options.events);
  const workSource = new FakeWorkSource(options.tasks);
  const decisionProvider = options.decisionProvider ?? new FakeDecisionProvider();
  const harness: Harness = {
    workspaceDir,
    store,
    transport,
    workSource,
    decisionProvider,
    validation: options.validation,
    supervisor: new Supervisor({
      agentTransport: transport,
      workSource,
      executionStore: store,
      validation: options.validation,
      decisionProvider,
      cwd: workspaceDir,
      now: fixedNow,
      ...(options.maxRetries === undefined ? {} : { maxRetries: options.maxRetries }),
      ...(options.maxConcurrency === undefined ? {} : { maxConcurrency: options.maxConcurrency }),
    }),
    ...(options.maxRetries === undefined ? {} : { maxRetries: options.maxRetries }),
    ...(options.maxConcurrency === undefined ? {} : { maxConcurrency: options.maxConcurrency }),
  };
  return harness;
}

function makeSupervisor(harness: Harness): Supervisor {
  return new Supervisor({
    agentTransport: harness.transport,
    workSource: harness.workSource,
    executionStore: harness.store,
    validation: harness.validation,
    decisionProvider: harness.decisionProvider,
    cwd: harness.workspaceDir,
    now: fixedNow,
    ...(harness.maxRetries === undefined ? {} : { maxRetries: harness.maxRetries }),
    ...(harness.maxConcurrency === undefined ? {} : { maxConcurrency: harness.maxConcurrency }),
  });
}

function task(
  id: string | TaskId,
  title: string,
  parentId?: TaskId,
  metadata?: JsonObject,
): WorkTask {
  const taskId = typeof id === "string" ? asTaskId(id) : id;
  return {
    id: taskId,
    title,
    body: `Body for ${title}`,
    acceptanceCriteria: [`${title} accepted`],
    status: "todo",
    revision: "1",
    ...(metadata === undefined ? {} : { metadata }),
    ...(parentId === undefined ? {} : { parentId }),
  };
}

function logEvent(sessionId: string, message: string): AgentEvent {
  return {
    type: "log",
    sessionId: asAgentSessionId(sessionId),
    message,
    source: "assistant",
  };
}

function turnEnded(sessionId: string, result: string | DecisionVerdict): AgentEvent {
  return {
    type: "turn_ended",
    sessionId: asAgentSessionId(sessionId),
    result: typeof result === "string" ? result : JSON.stringify(verdictAsJson(result)),
    stopReason: null,
  };
}

function doneResult(summary: string, evidence: JsonObject = {}): string {
  return JSON.stringify({
    type: "done",
    evidence: {
      summary,
      touchedFiles: ["src/example.ts"],
      ...evidence,
    },
  });
}

function failedResult(error: string, retryable: boolean): string {
  return JSON.stringify({
    type: "failed",
    error,
    retryable,
    evidence: {
      summary: error,
    },
  });
}

function needsDecisionResult(
  prompt: string,
  options: readonly string[],
  context: JsonObject = { scope: "local" },
): string {
  return JSON.stringify({
    type: "needs-decision",
    prompt,
    options,
    context,
  });
}

function decisionTemplate(verdict: DecisionVerdict): DecisionRecord {
  decisionSequence += 1;
  const decisionId = asDecisionId(`queued-decision-${decisionSequence}`);
  return {
    id: decisionId,
    request: {
      id: decisionId,
      nodeId: asNodeId("queued-node"),
      taskId: asTaskId("queued-task"),
      surface: "routing",
      prompt: "queued",
    },
    verdict,
    tier: verdict.type === "access" ? 0 : 1,
    rationale: "queued fake decision",
    createdAt: fixedNow(),
  };
}

function decisionVerdict(
  type: "decision",
  suggestedChoice: string,
  suggestedResponse: string,
): DecisionVerdict {
  return decisionVerdictWithScores(type, suggestedChoice, suggestedResponse, 8, 2);
}

function decisionVerdictWithScores(
  type: "decision",
  suggestedChoice: string,
  suggestedResponse: string,
  confidence: DecisionVerdict["confidence"],
  risk: DecisionVerdict["risk"],
): DecisionVerdict {
  return {
    type,
    suggested_choice: suggestedChoice,
    suggested_response: suggestedResponse,
    confidence,
    risk,
    block_trigger: false,
  };
}

function accessVerdict(suggestedChoice: string, suggestedResponse: string): DecisionVerdict {
  return {
    type: "access",
    suggested_choice: suggestedChoice,
    suggested_response: suggestedResponse,
    confidence: 10,
    risk: 0,
    block_trigger: false,
  };
}

function validationScript(statuses: readonly ValidationResult["status"][]): ScriptedValidation {
  return new ScriptedValidation(statuses);
}

class ScriptedValidation implements Validation {
  readonly requests: ValidationRequest[] = [];
  private readonly statuses: ValidationResult["status"][];

  constructor(statuses: readonly ValidationResult["status"][]) {
    this.statuses = [...statuses];
  }

  async validate(request: ValidationRequest): Promise<ValidationResult> {
    this.requests.push(request);
    const status = this.statuses.shift() ?? "pass";
    return {
      status,
      reasons: [`scripted ${status}`],
      report_ref: `report-${request.node.id}-${request.scope}-${this.requests.length}`,
    };
  }
}

class FakeDecisionModelClient {
  constructor(private readonly verdict: DecisionVerdict) {}

  async call<T>(request: StructuredModelRequest<T>): Promise<T> {
    return request.output.parse(verdictAsJson(this.verdict));
  }
}

function verdictAsJson(verdict: DecisionVerdict): JsonObject {
  return {
    type: verdict.type,
    suggested_choice: verdict.suggested_choice,
    suggested_response: verdict.suggested_response,
    confidence: verdict.confidence,
    risk: verdict.risk,
    block_trigger: verdict.block_trigger,
  };
}

async function makeWorkspace(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "daimyo-supervisor-"));
  tempDirs.push(dir);
  return dir;
}

function requireValue<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing ${label}`);
  return value;
}
