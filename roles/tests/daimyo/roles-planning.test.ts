import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  asNodeId,
  asTaskId,
  JsonlExecutionStore,
  TieredDecisionProvider,
  type AutonomyProfile,
  type DecisionRecord,
  type DecisionRequest,
  type DecisionVerdict,
  type HumanDecisionNotifier,
  type JsonObject,
  type StructuredModelInput,
  type StructuredModelRequest,
} from "daimyo";
import {
  createRolesPlanning,
  RolesPlanningAdapter,
  type StructuredModelRequest as RolesStructuredModelRequest,
} from "../../src/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  const dirs = tempDirs.splice(0);
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("RolesPlanningAdapter", () => {
  it("maps Planner PlanProposal tasks and decisions into daimyo planning results", async () => {
    const planner = new FakePlannerModel(planProposal({ reviewRequired: false, includeDecision: true }));
    const adapter = createRolesPlanning({
      modelClient: planner,
      now: fixedDate,
    });

    const result = await adapter.plan({
      goal: "Decompose the roles planning adapter.",
      context: {
        invocation_id: "planner-role-call-test",
        scope_id: "DGOS-I-0010",
        role_scope_type: "initiative",
        scope: "major",
        constraints: ["roles:no_policy_decisions"],
      },
    });

    expect(result.tasks).toEqual([
      {
        title: "Wire RolesPlanning adapter",
        body: "Invoke the Planner Role and project its PlanProposal into daimyo.",
        acceptanceCriteria: [
          "The adapter returns a PlannedTask.",
          "The protocol-only planning fields remain available in metadata.",
        ],
        metadata: {
          package: "daimyo",
          plan_proposal: {
            task_ref: "task-001",
            depends_on: ["task-000"],
            ordering: {
              priority: 1,
              after: ["task-000"],
            },
          },
        },
      },
    ]);
    expect(result.decisions).toHaveLength(1);

    const decision = requireValue(result.decisions[0], "mapped decision");
    expect(decision).toMatchObject({
      decision_id: "planner-decision-001",
      surface: "routing",
      prompt: "Choose whether to review the adapter shape before downstream harness work.",
      options: ["approve", "revise"],
      context: {
        domain: "engineering",
        role_output_domain: "product",
        scope: "major",
        role_scope_type: "initiative",
        human_review_required: false,
        confidence: 8,
        declared_risk: 2,
        role_id: "dev-genie.planner-role",
      },
    });
    expect(planner.inputs[0]).toMatchObject({
      request: {
        planning_goal: "Decompose the roles planning adapter.",
        constraints: ["roles:no_policy_decisions"],
        bounded_context: {
          invocation_id: "planner-role-call-test",
          role_scope_type: "initiative",
          scope: "major",
        },
      },
    });
  });

  it("emits autonomy signals and lets the existing TieredDecisionProvider decide ask versus proceed", async () => {
    const planner = new FakePlannerModel(planProposal({ reviewRequired: true, includeDecision: false }));
    const adapter = new RolesPlanningAdapter({
      modelClient: planner,
      now: fixedDate,
    });
    const planning = await adapter.plan({
      goal: "Plan autonomy-tagged role work.",
      context: {
        invocation_id: "planner-review-test",
        task_id: "task-planner-review",
        node_id: "node-planner-review",
        scope: "moderate",
        declared_risk: 2,
      },
    });
    const reviewDecision = requireValue(planning.decisions[0], "review decision");
    const routingReviewDecision = requireRoutingDecision(reviewDecision);

    expect(routingReviewDecision.context).toMatchObject({
      domain: "engineering",
      scope: "moderate",
      human_review_required: true,
      confidence: 8,
      declared_risk: 2,
    });

    const alwaysStore = await storeWithDecisionNode(routingReviewDecision);
    const alwaysNotifier = new RecordingNotifier();
    const alwaysProvider = new TieredDecisionProvider({
      executionStore: alwaysStore,
      autonomyProfile: profile("always_in_loop"),
      notifier: alwaysNotifier,
      clock: fixedClock,
    });
    const alwaysRecord = await alwaysProvider.decideRouting(routingReviewDecision);
    expect(alwaysRecord.payload.tier).toBe(3);
    expect(alwaysRecord.payload.verdict.type).toBe("human");
    expect(alwaysNotifier.records).toEqual([alwaysRecord]);

    const delegateStore = await storeWithDecisionNode(routingReviewDecision);
    const delegateModel = new FakeDecisionModel(decisionVerdict("proceed", 8, 2));
    const delegateProvider = new TieredDecisionProvider({
      executionStore: delegateStore,
      autonomyProfile: profile("delegate"),
      modelClient: delegateModel,
      clock: fixedClock,
    });
    const delegateRecord = await delegateProvider.decideRouting(routingReviewDecision);
    expect(delegateRecord.payload.tier).toBe(1);
    expect(delegateRecord.payload.verdict.type).toBe("decision");
    expect(delegateRecord.payload.verdict.suggested_choice).toBe("proceed");
    expect(delegateModel.inputs).toHaveLength(1);
  });
});

class FakePlannerModel {
  readonly inputs: StructuredModelInput[] = [];

  constructor(private readonly proposal: JsonObject) {}

  async call<T>(request: RolesStructuredModelRequest<T>): Promise<T> {
    this.inputs.push(request.input);
    return request.output.parse(this.proposal);
  }
}

class FakeDecisionModel {
  readonly inputs: StructuredModelInput[] = [];

  constructor(private readonly verdict: DecisionVerdict) {}

  async call<T>(request: StructuredModelRequest<T>): Promise<T> {
    this.inputs.push(request.input);
    return request.output.parse(verdictJson(this.verdict));
  }
}

class RecordingNotifier implements HumanDecisionNotifier {
  readonly records: DecisionRecord[] = [];

  async notify(record: DecisionRecord): Promise<void> {
    this.records.push(record);
  }
}

async function storeWithDecisionNode(request: DecisionRequest): Promise<JsonlExecutionStore> {
  const workspaceDir = await mkdtemp(join(tmpdir(), "daimyo-roles-planning-"));
  tempDirs.push(workspaceDir);
  const store = new JsonlExecutionStore({ workspaceDir });
  const taskId = asTaskId(request.task_id);
  await store.upsertNode(taskId, {
    id: asNodeId(request.node_id),
    taskId,
    type: "inner",
    status: "needs-decision",
    retryCount: 0,
  });
  return store;
}

function planProposal(options: {
  readonly reviewRequired: boolean;
  readonly includeDecision: boolean;
}): JsonObject {
  return {
    artifact_id: "artifact:sha256:3333333333333333333333333333333333333333333333333333333333333333",
    artifact_type: "PlanProposal",
    schema_version: "1.0.0",
    protocol_version: "1.2.0",
    producer: {
      primitive: "role",
      name: "dev-genie.planner-role",
      version: "1.0.0",
      invocation_id: "planner-role-call-test",
    },
    created_at: "2026-05-24T00:10:00.000Z",
    source_refs: [],
    output_refs: [],
    ownership: {
      owns_files: [],
      owns_interfaces: ["interface:roles-planning"],
      owns_data: [],
      owns_workflow_steps: ["workflow:planner-role-output"],
      depends_on: ["interface:protocol-role-result"],
    },
    confidence: {
      score: 0.82,
      level: "high",
      reason_codes: ["planner:bounded_context"],
    },
    review_required: {
      required: options.reviewRequired,
      reason_codes: options.reviewRequired ? ["autonomy:planning_review"] : [],
    },
    diagnostics: {
      status: "produced",
      warnings: [],
      errors: [],
      missing_context: [],
    },
    payload: {
      planning_goal: "Decompose the roles planning adapter.",
      tasks: [
        {
          task_ref: "task-001",
          title: "Wire RolesPlanning adapter",
          body: "Invoke the Planner Role and project its PlanProposal into daimyo.",
          acceptance_criteria: [
            "The adapter returns a PlannedTask.",
            "The protocol-only planning fields remain available in metadata.",
          ],
          depends_on: ["task-000"],
          ordering: {
            after: ["task-000"],
            priority: 1,
          },
          metadata: {
            package: "daimyo",
          },
        },
      ],
      decision_requests: options.includeDecision ? [plannerDecisionRequest()] : [],
      confidence: {
        score: 0.82,
        level: "high",
        reason_codes: ["planner:bounded_context"],
      },
      missing_context: [],
      review_required: {
        required: options.reviewRequired,
        reason_codes: options.reviewRequired ? ["autonomy:planning_review"] : [],
      },
      reason_codes: ["planner:adapter_integration"],
    },
  };
}

function plannerDecisionRequest(): JsonObject {
  return {
    decision_id: "planner-decision-001",
    node_id: "node-planner-decision",
    task_id: "task-planner-decision",
    surface: "routing",
    prompt: "Choose whether to review the adapter shape before downstream harness work.",
    context: {
      domain: "product",
      source: "planner-output",
    },
    options: ["approve", "revise"],
  };
}

function decisionVerdict(
  suggestedChoice: string,
  confidence: DecisionVerdict["confidence"],
  risk: DecisionVerdict["risk"],
): DecisionVerdict {
  return {
    type: "decision",
    suggested_choice: suggestedChoice,
    suggested_response: `Use ${suggestedChoice}.`,
    confidence,
    risk,
    block_trigger: false,
  };
}

function verdictJson(verdict: DecisionVerdict): JsonObject {
  return {
    type: verdict.type,
    suggested_choice: verdict.suggested_choice,
    suggested_response: verdict.suggested_response,
    confidence: verdict.confidence,
    risk: verdict.risk,
    block_trigger: verdict.block_trigger,
  };
}

function profile(engineering: AutonomyProfile["engineering"]): AutonomyProfile {
  return {
    engineering,
    product: "big_questions_only",
    design: "big_questions_only",
  };
}

function fixedDate(): Date {
  return new Date("2026-05-24T00:15:00.000Z");
}

function fixedClock(): string {
  return "2026-05-24T00:16:00.000Z";
}

function requireValue<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing ${label}`);
  return value;
}

function requireRoutingDecision(request: DecisionRequest): Extract<DecisionRequest, { surface: "routing" }> {
  if (request.surface !== "routing") {
    throw new Error(`Expected routing decision, received ${request.surface}`);
  }
  return request;
}
