import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type {
  DecisionRecord,
  DecisionVerdict,
  TaskId,
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

  it("bubbles leaf needs-decision to the owning inner node and minimally resumes the leaf", async () => {
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
    expect(rootSnapshot.decisions).toHaveLength(1);
    expect(childSnapshot.nodes[0]?.evidence).toContainEqual({
      summary: expect.stringContaining("Parent routed decision"),
    });
    await expect(harness.workSource.getTask(root.id)).resolves.toMatchObject({ status: "done" });
    await expect(harness.workSource.getTask(child.id)).resolves.toMatchObject({ status: "done" });
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
}

async function makeHarness(options: {
  readonly tasks: readonly WorkTask[];
  readonly events: readonly AgentEvent[];
  readonly validation: ScriptedValidation;
  readonly decisionProvider?: FakeDecisionProvider;
  readonly maxRetries?: number;
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
    }),
    ...(options.maxRetries === undefined ? {} : { maxRetries: options.maxRetries }),
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
  });
}

function task(id: string | TaskId, title: string, parentId?: TaskId): WorkTask {
  const taskId = typeof id === "string" ? asTaskId(id) : id;
  return {
    id: taskId,
    title,
    body: `Body for ${title}`,
    acceptanceCriteria: [`${title} accepted`],
    status: "todo",
    revision: "1",
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

function turnEnded(sessionId: string, result: string): AgentEvent {
  return {
    type: "turn_ended",
    sessionId: asAgentSessionId(sessionId),
    result,
    stopReason: null,
  };
}

function doneResult(summary: string): string {
  return JSON.stringify({
    type: "done",
    evidence: {
      summary,
      touchedFiles: ["src/example.ts"],
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

function needsDecisionResult(prompt: string, options: readonly string[]): string {
  return JSON.stringify({
    type: "needs-decision",
    prompt,
    options,
    context: {
      scope: "local",
    },
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
  return {
    type,
    suggested_choice: suggestedChoice,
    suggested_response: suggestedResponse,
    confidence: 8,
    risk: 2,
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

async function makeWorkspace(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "daimyo-supervisor-"));
  tempDirs.push(dir);
  return dir;
}
