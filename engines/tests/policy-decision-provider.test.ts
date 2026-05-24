import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  asDecisionId,
  asAgentSessionId,
  asNodeId,
  asTaskId,
  createStandaloneDaimyo,
  JsonlExecutionStore,
  makeDecisionRecord,
  TieredDecisionProvider,
  type AgentCommand,
  type AgentEvent,
  type AgentEventReadOptions,
  type AgentInterruptResult,
  type AgentSession,
  type AgentSessionId,
  type AgentSessionRequest,
  type AgentTransport,
  type CreateTaskInput,
  type DecisionProviderDependencies,
  type DecisionRecord,
  type ExecutionEvidence,
  type HumanDecisionNotifier,
  type JsonObject,
  type PatchTaskInput,
  type PermissionDecisionRequest,
  type PlanningRequest,
  type PlanningResult,
  type RolesPlanning,
  type RoutingDecisionRequest,
  type StructuredModelRequest,
  type TaskId,
  type Validation,
  type ValidationRequest,
  type ValidationResult,
  type WorkSource,
  type WorkStatus,
  type WorkTask,
  type WorkTaskSummary,
} from "daimyo";
import type { PolicyConfig } from "protocol";

import {
  DEFAULT_AUTONOMY_PROFILE,
  DecisionPolicyEngine,
  PolicyDecisionProvider,
  fromDaimyoStaticRules,
  validatorFor,
} from "../src/index.js";

const tempDirs: string[] = [];
const fixedNow = "2026-05-24T20:04:15.000Z";

afterEach(async () => {
  const dirs = tempDirs.splice(0);
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("PolicyDecisionProvider", () => {
  it("settles Engine permit decisions at tier 0 without calling the wrapped provider", async () => {
    const harness = await makeHarness();
    const inner = new RecordingInnerProvider(innerRecord(routingRequest("unused")));
    const provider = new PolicyDecisionProvider({
      engine: new DecisionPolicyEngine(),
      config: configWithRules(["Read"], []),
      inner,
      executionStore: harness.store,
      clock: fixedClock,
    });

    await harness.upsertNode("read");
    const record = await provider.decidePermission(permissionRequest("read", "Read"));
    const snapshot = await harness.store.load(asTaskId("task-read"));

    expect(record.payload.tier).toBe(0);
    expect(record.payload.verdict).toMatchObject({
      type: "access",
      suggested_choice: "allow",
      confidence: 10,
      block_trigger: false,
    });
    expect(record.created_at).toBe(fixedNow);
    expect(snapshot.decisions).toEqual([record]);
    expect(inner.permissionRequests).toEqual([]);
    expect(inner.routingRequests).toEqual([]);
    expect(validatorFor("DecisionRecord")(record)).toBe(true);
  });

  it("settles static-deny permission decisions at tier 0 without any model call", async () => {
    const harness = await makeHarness();
    const model = new ThrowingModelClient();
    const inner = new TieredDecisionProvider({
      executionStore: harness.store,
      modelClient: model,
      clock: fixedClock,
    });
    const provider = new PolicyDecisionProvider({
      engine: new DecisionPolicyEngine(),
      config: configWithRules([], ["Bash"]),
      inner,
      executionStore: harness.store,
      clock: fixedClock,
    });

    await harness.upsertNode("bash");
    const record = await provider.decidePermission(permissionRequest("bash", "Bash"));

    expect(record.payload.tier).toBe(0);
    expect(record.payload.verdict).toMatchObject({
      type: "access",
      suggested_choice: "deny",
      confidence: 10,
      block_trigger: false,
    });
    expect(model.calls).toBe(0);
  });

  it("settles Engine stop decisions as tier-3 human records and parks the node", async () => {
    const harness = await makeHarness();
    const notifier = new RecordingNotifier();
    const inner = new RecordingInnerProvider(innerRecord(routingRequest("unused")));
    const provider = new PolicyDecisionProvider({
      engine: new DecisionPolicyEngine(),
      config: configWithRules([], []),
      inner,
      executionStore: harness.store,
      clock: fixedClock,
      notifier,
    });

    await harness.upsertNode("audit");
    const record = await provider.decideRouting(routingRequest("audit", {
      context: {
        source_loop_id: "story-admin-settings-audit",
        action_type: "policy_change",
        altitude: "initiative",
        ownership_scope: [
          "workflow:admin-settings:audit",
          "config:admin.audit.*",
        ],
        risk_level: "high",
        sibling_ownership: [
          {
            sibling_id: "story-admin-settings-audit-log",
            owns_data: ["config:admin.audit.enabled"],
          },
        ],
      },
    }));
    const snapshot = await harness.store.load(asTaskId("task-audit"));

    expect(record.payload.tier).toBe(3);
    expect(record.payload.verdict.type).toBe("human");
    expect(record.payload.verdict.block_trigger).toBe(true);
    expect(snapshot.nodes[0]?.status).toBe("awaiting-human");
    expect(snapshot.decisions).toEqual([record]);
    expect(notifier.records).toEqual([record]);
    expect(inner.routingRequests).toEqual([]);
  });

  it("delegates Engine route fall-through to the wrapped provider with enriched policy context", async () => {
    const harness = await makeHarness();
    const delegatedRecord = innerRecord(routingRequest("save"));
    const inner = new RecordingInnerProvider(delegatedRecord);
    const provider = new PolicyDecisionProvider({
      engine: new DecisionPolicyEngine(),
      config: configWithRules([], []),
      inner,
      executionStore: harness.store,
      clock: fixedClock,
    });

    await harness.upsertNode("save");
    const record = await provider.decideRouting(routingRequest("save", {
      context: {
        source_loop_id: "task-admin-settings-save",
        action_type: "api_response_change",
        altitude: "task",
        ownership_scope: ["interface:PUT /api/admin/settings"],
        touched_surfaces: [
          "interface:PUT /api/admin/settings",
          "workflow:admin-settings:save",
        ],
        matched_dependencies: ["story-admin-settings-shell"],
        sibling_ownership: [
          {
            sibling_id: "story-admin-settings-shell",
            owns_workflow_steps: ["workflow:admin-settings:shell"],
            depends_on: ["interface:PUT /api/admin/settings"],
          },
        ],
      },
    }));

    const delegatedRequest = requireValue(inner.routingRequests[0], "delegated routing request");
    expect(record).toBe(delegatedRecord);
    expect(inner.routingRequests).toHaveLength(1);
    expect(delegatedRequest.context).toMatchObject({
      domain: "engineering",
      decision_domain: "engineering",
      scope: "moderate",
      decision_scope: "moderate",
      policy_outcome: "route",
      policy_conflict_class: "soft_conflict",
      policy_engine_version: "0.7.0",
    });
    expect((await harness.store.load(asTaskId("task-save"))).decisions).toEqual([]);
  });

  it("routes the initiative examples through settle and delegate behavior", async () => {
    const harness = await makeHarness();
    const delegatedRecord = innerRecord(routingRequest("save-example"));
    const inner = new RecordingInnerProvider(delegatedRecord);
    const notifier = new RecordingNotifier();
    const provider = new PolicyDecisionProvider({
      engine: new DecisionPolicyEngine(),
      config: configWithRules([], []),
      inner,
      executionStore: harness.store,
      clock: fixedClock,
      notifier,
    });

    await harness.upsertNode("copy-example");
    await harness.upsertNode("save-example");
    await harness.upsertNode("audit-example");

    const copy = await provider.decideRouting(routingRequest("copy-example", {
      decisionId: "decision-request-admin-settings-copy-001",
      context: {
        source_loop_id: "task-admin-settings-copy",
        action_type: "ui_text_update",
        altitude: "task",
        ownership_scope: ["workflow:admin-settings:copy"],
        touched_surfaces: ["file:src/features/admin/settings/copy.ts"],
      },
    }));
    const save = await provider.decideRouting(routingRequest("save-example", {
      decisionId: "decision-request-admin-settings-save-004",
      context: {
        source_loop_id: "task-admin-settings-save",
        action_type: "api_response_change",
        altitude: "task",
        ownership_scope: ["interface:PUT /api/admin/settings"],
        touched_surfaces: [
          "interface:PUT /api/admin/settings",
          "workflow:admin-settings:save",
        ],
        matched_dependencies: ["story-admin-settings-shell"],
        sibling_ownership: [
          {
            sibling_id: "story-admin-settings-shell",
            owns_workflow_steps: ["workflow:admin-settings:shell"],
            depends_on: ["interface:PUT /api/admin/settings"],
          },
        ],
      },
    }));
    const audit = await provider.decideRouting(routingRequest("audit-example", {
      decisionId: "decision-request-admin-settings-audit-002",
      context: {
        source_loop_id: "story-admin-settings-audit",
        action_type: "policy_change",
        altitude: "initiative",
        ownership_scope: [
          "workflow:admin-settings:audit",
          "config:admin.audit.*",
        ],
        risk_level: "high",
        sibling_ownership: [
          {
            sibling_id: "story-admin-settings-audit-log",
            owns_data: ["config:admin.audit.enabled"],
          },
        ],
      },
    }));

    expect(copy.payload).toMatchObject({
      tier: 0,
      verdict: {
        type: "decision",
        suggested_choice: "proceed",
      },
    });
    expect(save).toBe(delegatedRecord);
    expect(audit.payload).toMatchObject({
      tier: 3,
      verdict: {
        type: "human",
      },
    });
    expect(inner.routingRequests).toHaveLength(1);
    expect(notifier.records).toEqual([audit]);
  });

  it("can be injected through createStandaloneDaimyo without changing daimyo source", async () => {
    const harness = await makeHarness();
    const provider = new PolicyDecisionProvider({
      engine: new DecisionPolicyEngine(),
      config: configWithRules(["Read"], []),
      inner: new TieredDecisionProvider({
        executionStore: harness.store,
        clock: fixedClock,
      }),
      executionStore: harness.store,
      clock: fixedClock,
    });

    const standalone = createStandaloneDaimyo({
      cwd: harness.workspaceDir,
      workspaceDir: harness.workspaceDir,
      workSource: new EmptyWorkSource(),
      validation: new PassingValidation(),
      rolesPlanning: new EmptyRolesPlanning(),
      agentTransport: new InertAgentTransport(),
      executionStore: harness.store,
      decisionProvider: provider,
    });

    expect(standalone.decisionProvider).toBe(provider);
    expect(standalone.supervisor).toBeDefined();
  });
});

interface Harness {
  readonly workspaceDir: string;
  readonly store: JsonlExecutionStore;
  upsertNode(suffix: string): Promise<void>;
}

async function makeHarness(): Promise<Harness> {
  const workspaceDir = await mkdtemp(join(tmpdir(), "engines-policy-provider-"));
  tempDirs.push(workspaceDir);
  const store = new JsonlExecutionStore({ workspaceDir });
  return {
    workspaceDir,
    store,
    async upsertNode(suffix: string): Promise<void> {
      const taskId = asTaskId(`task-${suffix}`);
      await store.upsertNode(taskId, {
        id: asNodeId(`node-${suffix}`),
        taskId,
        type: "leaf",
        status: "needs-decision",
        retryCount: 0,
      });
    },
  };
}

function permissionRequest(suffix: string, toolName: string): PermissionDecisionRequest {
  return {
    decision_id: asDecisionId(`decision-${suffix}`),
    node_id: asNodeId(`node-${suffix}`),
    task_id: asTaskId(`task-${suffix}`),
    surface: "permission",
    prompt: `May the agent run ${toolName}?`,
    tool_name: toolName,
    arguments: { path: "src/example.ts" },
  };
}

function routingRequest(
  suffix: string,
  options: {
    readonly decisionId?: string;
    readonly context?: JsonObject;
  } = {},
): RoutingDecisionRequest {
  return {
    decision_id: asDecisionId(options.decisionId ?? `decision-${suffix}`),
    node_id: asNodeId(`node-${suffix}`),
    task_id: asTaskId(`task-${suffix}`),
    surface: "routing",
    prompt: "Evaluate this routing decision.",
    ...(options.context === undefined ? {} : { context: options.context }),
  };
}

function innerRecord(request: RoutingDecisionRequest): DecisionRecord {
  return makeDecisionRecord({
    decision_id: asDecisionId(`${request.decision_id}:inner`),
    request,
    verdict: {
      type: "decision",
      suggested_choice: "inner-choice",
      suggested_response: "Delegated to daimyo TieredDecisionProvider.",
      confidence: 7,
      risk: 4,
      block_trigger: false,
    },
    tier: 1,
    rationale: "Wrapped provider resolved the decision.",
    created_at: fixedNow,
  });
}

function configWithRules(
  allowTools: readonly string[],
  denyTools: readonly string[],
): PolicyConfig {
  return {
    autonomy_profile: DEFAULT_AUTONOMY_PROFILE,
    product_baseline_approved: true,
    static_rules: fromDaimyoStaticRules(allowTools, denyTools),
  };
}

class RecordingInnerProvider {
  readonly permissionRequests: PermissionDecisionRequest[] = [];
  readonly routingRequests: RoutingDecisionRequest[] = [];

  constructor(private readonly record: DecisionRecord) {}

  async decidePermission(
    request: PermissionDecisionRequest,
    _dependencies?: DecisionProviderDependencies,
  ): Promise<DecisionRecord> {
    this.permissionRequests.push(request);
    return this.record;
  }

  async decideRouting(
    request: RoutingDecisionRequest,
    _dependencies?: DecisionProviderDependencies,
  ): Promise<DecisionRecord> {
    this.routingRequests.push(request);
    return this.record;
  }
}

class RecordingNotifier implements HumanDecisionNotifier {
  readonly records: DecisionRecord[] = [];

  async notify(record: DecisionRecord): Promise<void> {
    this.records.push(record);
  }
}

class ThrowingModelClient {
  calls = 0;

  async call<T>(_request: StructuredModelRequest<T>): Promise<T> {
    this.calls += 1;
    throw new Error("Model should not be called for deterministic policy decisions.");
  }
}

class EmptyWorkSource implements WorkSource {
  async listTasks(): Promise<readonly WorkTaskSummary[]> {
    return [];
  }

  async getTask(id: TaskId): Promise<WorkTask> {
    throw new Error(`No task exists in composition fake: ${id}`);
  }

  async markStatus(
    id: TaskId,
    _status: WorkStatus,
    _evidence: ExecutionEvidence,
  ): Promise<WorkTask> {
    return await this.getTask(id);
  }

  async patchTask(
    id: TaskId,
    _patch: PatchTaskInput,
    _evidence: ExecutionEvidence,
  ): Promise<WorkTask> {
    return await this.getTask(id);
  }

  async createTask(_input: CreateTaskInput, _parentId?: TaskId): Promise<TaskId> {
    return asTaskId("created-task");
  }
}

class PassingValidation implements Validation {
  async validate(_request: ValidationRequest): Promise<ValidationResult> {
    return {
      status: "pass",
      reasons: ["composition fake"],
      report_ref: "validation-report-composition-fake",
    };
  }
}

class EmptyRolesPlanning implements RolesPlanning {
  async plan(_request: PlanningRequest): Promise<PlanningResult> {
    return {
      tasks: [],
      decisions: [],
    };
  }
}

class InertAgentTransport implements AgentTransport {
  readonly sessions: AgentSession[] = [];

  async spawnSession(request: AgentSessionRequest): Promise<AgentSession> {
    const session = {
      id: asAgentSessionId("composition-fake-session"),
      nodeId: request.nodeId,
    };
    this.sessions.push(session);
    return session;
  }

  async readEvent(
    sessionId: AgentSessionId,
    _options?: AgentEventReadOptions,
  ): Promise<AgentEvent> {
    return {
      type: "exited",
      sessionId,
      exitCode: 0,
      reason: "completed",
    };
  }

  async sendCommand(
    _sessionId: AgentSessionId,
    _command: AgentCommand,
  ): Promise<void> {}

  async interruptSession(
    _sessionId: AgentSessionId,
    _reason: string,
  ): Promise<AgentInterruptResult> {
    return {};
  }

  async disposeSession(_sessionId: AgentSessionId): Promise<void> {}
}

function fixedClock(): string {
  return fixedNow;
}

function requireValue<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing ${label}`);
  return value;
}
