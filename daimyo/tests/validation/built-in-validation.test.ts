import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type {
  ChildDone,
  JsonValue,
  NodeRef,
} from "../../src/core/index.js";
import {
  asNodeId,
  asTaskId,
  JsonlExecutionStore,
} from "../../src/core/index.js";
import type { WorkTask } from "../../src/core/ports/work-source.js";
import type {
  StructuredModelCaller,
} from "../../src/validation/built-in-validation.js";
import { BuiltInValidation } from "../../src/validation/index.js";
import type {
  StructuredModelInput,
  StructuredModelRequest,
} from "../../src/engine/structured-model-call.js";

const tempDirs: string[] = [];

afterEach(async () => {
  const dirs = tempDirs.splice(0);
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("BuiltInValidation", () => {
  it("passes when a declared validation command exits zero", async () => {
    const harness = await makeHarness(commandTask("task-command-pass", 0));

    const result = await harness.validation.validate({
      task: harness.task,
      node: harness.node,
      scope: "leaf",
      evidence: { summary: "patch produced" },
    });
    const snapshot = await harness.store.load(harness.task.id);
    const report = requireValue(snapshot.validationReports[0], "validation report");

    expect(result.status).toBe("pass");
    expect(result.report_ref).toBe("report-task-command-pass-leaf");
    expect(result.reasons).toContain("Validation command exited with code 0.");
    expect(report.evidence_strength).toBe("command");
    expect(report.status).toBe("pass");
    expect(report.details.stdout).toBe("ok");
    expect(snapshot.nodes[0]?.validationReportRefs).toEqual([result.report_ref]);
    expect(snapshot.nodes[0]?.evidence[0]?.report_ref).toBe(result.report_ref);
  });

  it("fails when a declared validation command exits non-zero", async () => {
    const harness = await makeHarness(commandTask("task-command-fail", 7));

    const result = await harness.validation.validate({
      task: harness.task,
      node: harness.node,
      scope: "leaf",
      evidence: { summary: "patch produced" },
    });
    const report = requireValue(
      (await harness.store.load(harness.task.id)).validationReports[0],
      "validation report",
    );

    expect(result.status).toBe("fail");
    expect(result.reasons).toContain("Validation command exited with code 7.");
    expect(result.reasons).toContain("stderr: bad");
    expect(report.status).toBe("fail");
    expect(report.details.exitCode).toBe(7);
  });

  it("passes through the weaker model fallback when no command is declared", async () => {
    const harness = await makeHarness(plainTask("task-model-pass"), [
      { pass: true, fail: false, reasons: ["acceptance criteria satisfied"] },
    ]);

    const result = await harness.validation.validate({
      task: harness.task,
      node: harness.node,
      scope: "parent",
      evidence: { summary: "implementation evidence", touchedFiles: ["src/example.ts"] },
    });
    const report = requireValue(
      (await harness.store.load(harness.task.id)).validationReports[0],
      "validation report",
    );

    expect(result.status).toBe("pass");
    expect(result.reasons[0]).toContain("weaker than a command result");
    expect(harness.modelClient.inputs).toHaveLength(1);
    expect(harness.modelClient.inputs[0]?.request).toContain("Works as specified");
    expect(report.evidence_strength).toBe("model_fallback");
    expect(report.scope).toBe("parent");
  });

  it("fails through the weaker model fallback when no command is declared", async () => {
    const harness = await makeHarness(plainTask("task-model-fail"), [
      { pass: false, fail: true, reasons: ["missing required evidence"] },
    ]);

    const result = await harness.validation.validate({
      task: harness.task,
      node: harness.node,
      scope: "leaf",
      evidence: { summary: "implementation evidence" },
    });
    const report = requireValue(
      (await harness.store.load(harness.task.id)).validationReports[0],
      "validation report",
    );

    expect(result.status).toBe("fail");
    expect(result.reasons).toContain("missing required evidence");
    expect(report.status).toBe("fail");
    expect(report.details.kind).toBe("model_fallback");
  });

  it("fails parent-scope validation even when a child claims done", async () => {
    const harness = await makeHarness(commandTask("task-parent-authority", 1));
    const childDone: ChildDone = {
      type: "done",
      nodeId: asNodeId("node-child"),
      evidence: { summary: "child claims done" },
    };

    const result = await harness.validation.validate({
      task: harness.task,
      node: harness.node,
      scope: "parent",
      evidence: childDone.evidence,
    });
    const report = requireValue(
      (await harness.store.load(harness.task.id)).validationReports[0],
      "validation report",
    );

    expect(result.status).toBe("fail");
    expect(report.scope).toBe("parent");
    expect(report.evidence.summary).toBe("child claims done");
  });
});

async function makeHarness(
  task: WorkTask,
  modelResponses: readonly JsonValue[] = [],
): Promise<{
  readonly task: WorkTask;
  readonly node: NodeRef;
  readonly store: JsonlExecutionStore;
  readonly validation: BuiltInValidation;
  readonly modelClient: FakeModelClient;
}> {
  const workspaceDir = await makeWorkspace();
  const store = new JsonlExecutionStore({ workspaceDir });
  const node: NodeRef = {
    id: asNodeId(`node-${task.id}`),
    taskId: task.id,
    type: "leaf",
    status: "running",
  };
  await store.upsertNode(task.id, {
    id: node.id,
    taskId: task.id,
    type: node.type,
    status: node.status,
    retryCount: 0,
  });
  const modelClient = new FakeModelClient(modelResponses);
  const validation = new BuiltInValidation({
    executionStore: store,
    modelClient,
    now: () => "2026-05-22T21:00:00.000Z",
    makeReportRef: (request) => `report-${request.task.id}-${request.scope}`,
  });
  return { task, node, store, validation, modelClient };
}

function commandTask(id: string, exitCode: number): WorkTask {
  const taskId = asTaskId(id);
  return {
    id: taskId,
    title: "Command task",
    body: "Run command validation",
    acceptanceCriteria: ["Works as specified"],
    status: "active",
    revision: "1",
    metadata: {
      validation_command: {
        command: process.execPath,
        args: [
          "-e",
          `process.stdout.write('ok'); process.stderr.write('${exitCode === 0 ? "" : "bad"}'); process.exit(${exitCode});`,
        ],
      },
    },
  };
}

function plainTask(id: string): WorkTask {
  return {
    id: asTaskId(id),
    title: "Model fallback task",
    body: "Use model validation",
    acceptanceCriteria: ["Works as specified"],
    status: "active",
    revision: "1",
  };
}

async function makeWorkspace(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "daimyo-validation-"));
  tempDirs.push(dir);
  return dir;
}

function requireValue<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing ${label}`);
  return value;
}

class FakeModelClient implements StructuredModelCaller {
  readonly inputs: StructuredModelInput[] = [];
  private readonly responses: JsonValue[];

  constructor(responses: readonly JsonValue[]) {
    this.responses = [...responses];
  }

  async call<T>(request: StructuredModelRequest<T>): Promise<T> {
    this.inputs.push(request.input);
    const response = this.responses.shift();
    if (response === undefined) {
      throw new Error("Fake model response queue exhausted");
    }
    return request.output.parse(response);
  }
}
