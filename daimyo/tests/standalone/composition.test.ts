import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  asAgentSessionId,
  asDecisionId,
  asNodeId,
  asTaskId,
  createStandaloneDaimyo,
  type DecisionRecord,
  type DecisionVerdict,
  type HumanDecisionNotifier,
  type PlanningRequest,
  type PlanningResult,
  type RolesPlanning,
  type StructuredModelInput,
  type StructuredModelRequest,
  type Validation,
  type ValidationRequest,
  type ValidationResult,
} from "../../src/index.js";
import { FakeAgentTransport, FakeWorkSource } from "../../src/test-support/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  const dirs = tempDirs.splice(0);
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("standalone composition root", () => {
  it("constructs and runs a Supervisor with the default markdown WorkSource wiring", async () => {
    const workspaceDir = await makeTempDir();
    const planPath = join(workspaceDir, "plan.md");
    await writeFile(planPath, "- [ ] Smoke standalone wiring\n", "utf8");
    const transport = new FakeAgentTransport([
      {
        type: "turn_ended",
        sessionId: asAgentSessionId("fake-session-1"),
        result: doneResult("standalone smoke done"),
        stopReason: null,
      },
    ]);
    const daimyo = createStandaloneDaimyo({
      cwd: workspaceDir,
      workspaceDir,
      plan: { filePath: planPath },
      agentTransport: transport,
      validation: new PassingValidation(),
    });

    const task = (await daimyo.workSource.listTasks())[0];
    if (task === undefined) throw new Error("Expected markdown plan task");

    const result = await daimyo.supervisor.run(task.id);

    expect(result.status).toBe("done");
    expect(transport.spawnRequests[0]).toMatchObject({
      cwd: workspaceDir,
      metadata: {
        taskId: task.id,
        nodeType: "leaf",
      },
    });
    await expect(daimyo.workSource.getTask(task.id)).resolves.toMatchObject({ status: "done" });
  });

  it("ships the bundled Tier-1 prompt in standalone decision wiring", async () => {
    const workspaceDir = await makeTempDir();
    const model = new FakeModelClient(verdict("decision", "option-b", 8, 3));
    const daimyo = createStandaloneDaimyo({
      cwd: workspaceDir,
      workSource: new FakeWorkSource([]),
      agentTransport: new FakeAgentTransport([]),
      validation: new PassingValidation(),
      modelClient: model,
    });
    const taskId = asTaskId("task-tier1");
    const nodeId = asNodeId("node-tier1");
    await daimyo.executionStore.upsertNode(taskId, {
      id: nodeId,
      taskId,
      type: "inner",
      status: "running",
      retryCount: 0,
    });

    const record = await daimyo.decisionProvider.decideRouting({
      decision_id: asDecisionId("decision-tier1"),
      node_id: nodeId,
      task_id: taskId,
      surface: "routing",
      prompt: "Choose option",
      options: ["option-a", "option-b"],
      context: { domain: "engineering", scope: "moderate" },
    });

    expect(record.payload.tier).toBe(1);
    expect(model.inputs[0]).toMatchObject({
      context: {
        prompt_id: "daimyo.tier1-decision-role",
        prompt_version: "1.0.0",
      },
      request: {
        prompt: "Choose option",
        options: ["option-a", "option-b"],
      },
    });
  });

  it("degrades to Tier 3 when the standalone Tier-1 prompt is unavailable", async () => {
    const workspaceDir = await makeTempDir();
    const model = new FakeModelClient(verdict("decision", "option-b", 8, 3));
    const notifier = new RecordingNotifier();
    const daimyo = createStandaloneDaimyo({
      cwd: workspaceDir,
      workSource: new FakeWorkSource([]),
      agentTransport: new FakeAgentTransport([]),
      validation: new PassingValidation(),
      modelClient: model,
      notifier,
      tier1Prompt: null,
    });
    const taskId = asTaskId("task-no-prompt");
    const nodeId = asNodeId("node-no-prompt");
    await daimyo.executionStore.upsertNode(taskId, {
      id: nodeId,
      taskId,
      type: "inner",
      status: "running",
      retryCount: 0,
    });

    const record = await daimyo.decisionProvider.decideRouting({
      decision_id: asDecisionId("decision-no-prompt"),
      node_id: nodeId,
      task_id: taskId,
      surface: "routing",
      prompt: "Choose option",
      options: ["option-a", "option-b"],
      context: { domain: "engineering", scope: "moderate" },
    });

    expect(record.payload.tier).toBe(3);
    expect(record.payload.verdict.type).toBe("human");
    expect(model.inputs).toEqual([]);
    expect(notifier.records).toEqual([record]);
  });

  it("accepts an injected RolesPlanning port implementation", () => {
    const rolesPlanning = new StubRolesPlanning();
    const daimyo = createStandaloneDaimyo({
      workSource: new FakeWorkSource([]),
      agentTransport: new FakeAgentTransport([]),
      validation: new PassingValidation(),
      rolesPlanning,
    });

    expect(daimyo.rolesPlanning).toBe(rolesPlanning);
  });

  it("uses a Roles-agnostic no-planner default when RolesPlanning is not injected", async () => {
    const model = new FakeModelClient(verdict("decision", "option-b", 8, 3));
    const daimyo = createStandaloneDaimyo({
      workSource: new FakeWorkSource([]),
      agentTransport: new FakeAgentTransport([]),
      validation: new PassingValidation(),
      modelClient: model,
    });

    await expect(daimyo.rolesPlanning.plan({ goal: "Plan without roles" })).resolves.toEqual({
      tasks: [],
      decisions: [],
    });
    expect(model.inputs).toEqual([]);
  });
});

class PassingValidation implements Validation {
  readonly requests: ValidationRequest[] = [];

  async validate(request: ValidationRequest): Promise<ValidationResult> {
    this.requests.push(request);
    return {
      status: "pass",
      reasons: ["passed by standalone composition smoke test"],
      report_ref: `test-validation:${request.task.id}:${request.scope}`,
    };
  }
}

class RecordingNotifier implements HumanDecisionNotifier {
  readonly records: DecisionRecord[] = [];

  async notify(record: DecisionRecord): Promise<void> {
    this.records.push(record);
  }
}

class StubRolesPlanning implements RolesPlanning {
  async plan(_request: PlanningRequest): Promise<PlanningResult> {
    return {
      tasks: [],
      decisions: [],
    };
  }
}

class FakeModelClient {
  readonly inputs: StructuredModelInput[] = [];

  constructor(private readonly result: DecisionVerdict) {}

  async call<T>(request: StructuredModelRequest<T>): Promise<T> {
    this.inputs.push(request.input);
    return request.output.parse(verdictJson(this.result));
  }
}

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "daimyo-standalone-"));
  tempDirs.push(dir);
  return dir;
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

function verdict(
  type: DecisionVerdict["type"],
  suggestedChoice: string,
  confidence: DecisionVerdict["confidence"],
  risk: DecisionVerdict["risk"],
): DecisionVerdict {
  return {
    type,
    suggested_choice: suggestedChoice,
    suggested_response: `Use ${suggestedChoice}.`,
    confidence,
    risk,
    block_trigger: false,
  };
}

function verdictJson(source: DecisionVerdict) {
  return {
    type: source.type,
    suggested_choice: source.suggested_choice,
    suggested_response: source.suggested_response,
    confidence: source.confidence,
    risk: source.risk,
    block_trigger: source.block_trigger,
  };
}
