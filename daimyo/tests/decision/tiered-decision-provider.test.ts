import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  asDecisionId,
  asAgentSessionId,
  asNodeId,
  asTaskId,
  asTransportCorrelationId,
  AgentCommandRejectedError,
  AgentTransportTier2InvestigationHook,
  decisionVerdictToRoleResult,
  evaluateAutonomyThreshold,
  JsonlExecutionStore,
  roleResultToDecisionVerdict,
  TieredDecisionProvider,
  type AutonomyDomain,
  type AutonomyLevel,
  type AutonomyProfile,
  type DecisionRecord,
  type DecisionVerdict,
  type HumanDecisionNotifier,
  type JsonObject,
  type PermissionDecisionRequest,
  type RoutingDecisionRequest,
  type StructuredModelInput,
  type StructuredModelRequest,
  type Tier2InvestigationHook,
} from "../../src/index.js";
import { FakeAgentTransport } from "../../src/test-support/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  const dirs = tempDirs.splice(0);
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("TieredDecisionProvider", () => {
  it("keeps routing decisions out of permission tool rules and permission gates out of routing", async () => {
    const harness = await makeHarness();
    const model = new FakeDecisionModelClient(decisionVerdict("decision", "postgres", 8, 3));
    const provider = new TieredDecisionProvider({
      executionStore: harness.store,
      modelClient: model,
      staticRules: { denyTools: ["postgres"] },
      clock: fixedClock,
    });

    const routingNode = await harness.upsertNode("routing-surface");
    const routing = await provider.decideRouting(
      routingRequest("routing-surface", {
        prompt: "Choose postgres or sqlite for local persistence.",
        options: ["postgres", "sqlite"],
        context: { domain: "engineering", scope: "moderate" },
      }),
    );

    const permissionNode = await harness.upsertNode("permission-surface");
    const permission = await provider.decidePermission(
      permissionRequest("permission-surface", {
        toolName: "postgres",
        prompt: "May the agent run the postgres tool?",
      }),
    );

    expect(routingNode).toBe(asNodeId("node-routing-surface"));
    expect(permissionNode).toBe(asNodeId("node-permission-surface"));
    expect(routing.payload.tier).toBe(1);
    expect(routing.payload.verdict).toMatchObject({ type: "decision", suggested_choice: "postgres" });
    expect(permission.payload.tier).toBe(0);
    expect(permission.payload.verdict).toMatchObject({ type: "access", suggested_choice: "deny" });
    expect(model.inputs).toHaveLength(1);
  });

  it("resolves Tier 0 permission and delegated local routing without a model call", async () => {
    const harness = await makeHarness();
    const model = new FakeDecisionModelClient(decisionVerdict("decision", "unused", 8, 3));
    const provider = new TieredDecisionProvider({
      executionStore: harness.store,
      autonomyProfile: {
        engineering: "delegate",
        product: "big_questions_only",
        design: "big_questions_only",
      },
      modelClient: model,
      staticRules: { allowTools: ["Read"] },
      clock: fixedClock,
    });

    await harness.upsertNode("read");
    const permission = await provider.decidePermission(
      permissionRequest("read", {
        toolName: "Read",
        context: { domain: "engineering", scope: "local", risk: 1 },
      }),
    );

    await harness.upsertNode("routing");
    const routing = await provider.decideRouting(
      routingRequest("routing", {
        options: ["use existing adapter"],
        context: { domain: "engineering", scope: "local" },
      }),
    );

    expect(permission.payload.tier).toBe(0);
    expect(permission.payload.verdict.suggested_choice).toBe("allow");
    expect(routing.payload.tier).toBe(0);
    expect(routing.payload.verdict.suggested_choice).toBe("use existing adapter");
    expect(model.inputs).toHaveLength(0);
    expect((await harness.store.load(asTaskId("task-read"))).decisions).toHaveLength(1);
    expect((await harness.store.load(asTaskId("task-routing"))).decisions).toHaveLength(1);
  });

  it("uses a bounded Tier 1 payload and persists the resolved DecisionRecord", async () => {
    const harness = await makeHarness();
    const model = new FakeDecisionModelClient(decisionVerdict("decision", "option-b", 8, 3));
    const provider = new TieredDecisionProvider({
      executionStore: harness.store,
      modelClient: model,
      clock: fixedClock,
    });

    await harness.upsertNode("tier1");
    const record = await provider.decideRouting(
      routingRequest("tier1", {
        options: ["option-a", "option-b"],
        context: { domain: "engineering", scope: "moderate" },
      }),
    );

    const input = requireValue(model.inputs[0], "Tier 1 model input");
    const snapshot = await harness.store.load(asTaskId("task-tier1"));

    expect(record.payload.tier).toBe(1);
    expect(input).toMatchObject({
      context: {
        prompt_id: "daimyo.tier1-decision-role",
        prompt_version: "1.0.0",
      },
      rules: {
        verdict_contract:
          "Return {type,suggested_choice,suggested_response,confidence,risk,block_trigger}. No tools or filesystem.",
      },
      request: {
        surface: "routing",
        options: ["option-a", "option-b"],
      },
    });
    expect(snapshot.decisions).toEqual([record]);
  });

  it("parks the node awaiting human, notifies, and records Tier 2 when investigation still exceeds policy", async () => {
    const harness = await makeHarness();
    const notifier = new FakeNotifier();
    const hook = new FakeTier2Hook(decisionVerdict("decision", "option-a", 4, 6));
    const model = new FakeDecisionModelClient(decisionVerdict("decision", "option-a", 4, 6));
    const provider = new TieredDecisionProvider({
      executionStore: harness.store,
      modelClient: model,
      notifier,
      tier2InvestigationHook: hook,
      clock: fixedClock,
    });

    await harness.upsertNode("human");
    const record = await provider.decideRouting(
      routingRequest("human", {
        options: ["option-a", "option-b"],
        context: { domain: "engineering", scope: "moderate" },
      }),
    );

    const snapshot = await harness.store.load(asTaskId("task-human"));

    expect(record.payload.tier).toBe(3);
    expect(record.payload.verdict.type).toBe("human");
    expect(snapshot.nodes[0]?.status).toBe("awaiting-human");
    expect(snapshot.decisions.map((decision) => decision.payload.tier)).toEqual([2, 3]);
    expect(notifier.records).toEqual([record]);
    expect(hook.requests).toHaveLength(1);
    expect(hook.requests[0]?.thresholdReason).toMatch(/confidence/);
  });

  it("uses Tier 2 read-only investigation to improve a low-confidence Tier 1 verdict", async () => {
    const harness = await makeHarness();
    const model = new FakeDecisionModelClient(decisionVerdict("decision", "option-a", 4, 6));
    const transport = new FakeAgentTransport([
      turnEnded("fake-session-1", decisionVerdict("decision", "option-b", 8, 3)),
    ]);
    const provider = new TieredDecisionProvider({
      executionStore: harness.store,
      modelClient: model,
      clock: fixedClock,
    });

    await harness.upsertNode("tier2-improved");
    const record = await provider.decideRouting(
      routingRequest("tier2-improved", {
        options: ["option-a", "option-b"],
        context: { domain: "engineering", scope: "moderate" },
      }),
      {
        agentTransport: transport,
        cwd: "/tmp/daimyo-tier2-test",
      },
    );

    const snapshot = await harness.store.load(asTaskId("task-tier2-improved"));

    expect(record.payload.tier).toBe(2);
    expect(record.payload.verdict.suggested_choice).toBe("option-b");
    expect(snapshot.decisions).toEqual([record]);
    expect(transport.spawnRequests[0]).toMatchObject({
      cwd: "/tmp/daimyo-tier2-test",
      metadata: {
        tier: 2,
        mode: "read-only",
        cross_port_edge: "DecisionProvider->AgentTransport Tier-2 investigation",
      },
    });
  });

  it("denies edit and mutating bash permissions for the Tier 2 read-only worker", async () => {
    const editCorrelation = asTransportCorrelationId("edit-denied");
    const bashCorrelation = asTransportCorrelationId("bash-denied");
    const transport = new FakeAgentTransport([
      {
        type: "needs_permission",
        sessionId: asAgentSessionId("fake-session-1"),
        correlationId: editCorrelation,
        toolName: "Edit",
        arguments: { file_path: "src/example.ts" },
      },
      {
        type: "needs_permission",
        sessionId: asAgentSessionId("fake-session-1"),
        correlationId: bashCorrelation,
        toolName: "Bash",
        arguments: { command: "sed -i '' s/a/b/ src/example.ts" },
      },
      turnEnded("fake-session-1", decisionVerdict("decision", "safe", 8, 3)),
    ]);
    const hook = new AgentTransportTier2InvestigationHook({
      agentTransport: transport,
      cwd: "/tmp/daimyo-tier2-test",
    });

    const verdict = await hook.investigate({
      request: routingRequest("tier2-readonly", {
        context: { domain: "engineering", scope: "moderate" },
      }),
      tier1Verdict: decisionVerdict("decision", "unsafe", 4, 6),
      thresholdReason: "Tier 1 returned low confidence",
    });

    expect(verdict.suggested_choice).toBe("safe");
    expect(transport.commands).toEqual([
      {
        sessionId: asAgentSessionId("fake-session-1"),
        command: {
          type: "deny",
          correlationId: editCorrelation,
          reason: "Tier 2 read-only investigation denied Edit.",
        },
      },
      {
        sessionId: asAgentSessionId("fake-session-1"),
        command: {
          type: "deny",
          correlationId: bashCorrelation,
          reason: "Tier 2 read-only investigation denied mutating bash.",
        },
      },
    ]);
    await expect(
      transport.sendCommand(asAgentSessionId("fake-session-1"), {
        type: "approve",
        correlationId: editCorrelation,
        reason: "attempt after denial",
      }),
    ).rejects.toBeInstanceOf(AgentCommandRejectedError);
  });

  it("degrades cleanly to Tier 0 plus Tier 3 when the Tier 1 prompt is absent", async () => {
    const harness = await makeHarness();
    const notifier = new FakeNotifier();
    const model = new FakeDecisionModelClient(decisionVerdict("decision", "unused", 8, 3));
    const provider = new TieredDecisionProvider({
      executionStore: harness.store,
      modelClient: model,
      tier1Prompt: null,
      notifier,
      clock: fixedClock,
    });

    await harness.upsertNode("no-prompt");
    const record = await provider.decideRouting(
      routingRequest("no-prompt", {
        context: { domain: "engineering", scope: "moderate" },
      }),
    );

    expect(record.payload.tier).toBe(3);
    expect(record.payload.rationale).toMatch(/Tier 1 unavailable/);
    expect(model.inputs).toHaveLength(0);
    expect(notifier.records).toEqual([record]);
  });
});

describe("DecisionVerdict Role-result mapping", () => {
  it("maps verdicts to and from ADR-1 Role result shape while keeping the verdict minimal", () => {
    const verdict = decisionVerdict("decision", "ship", 8, 3);
    const roleResult = decisionVerdictToRoleResult(verdict);

    expect(roleResult).toEqual({
      status: "produced",
      confidence: 8,
      missing_context: [],
      human_review_required: false,
      output: {
        suggested_choice: "ship",
        suggested_response: "Use ship.",
      },
    });
    expect(roleResultToDecisionVerdict(roleResult)).toEqual({
      type: "decision",
      suggested_choice: "ship",
      suggested_response: "Use ship.",
      confidence: 8,
      risk: 3,
      block_trigger: false,
    });

    const humanRole = decisionVerdictToRoleResult({
      type: "human",
      suggested_choice: null,
      suggested_response: null,
      confidence: 0,
      risk: 10,
      block_trigger: true,
    });
    expect(humanRole.status).toBe("needs_human");
    expect(roleResultToDecisionVerdict(humanRole).type).toBe("human");
  });
});

describe("autonomy threshold matrix", () => {
  it("maps verdict plus autonomy profile to proceed or human escalation across domains and levels", () => {
    const domains: readonly AutonomyDomain[] = ["engineering", "product", "design"];
    const levels: readonly AutonomyLevel[] = [
      "always_in_loop",
      "big_questions_only",
      "delegate",
    ];

    for (const domain of domains) {
      for (const level of levels) {
        const profile = profileFor(domain, level);
        expect(
          evaluateAutonomyThreshold(
            routingRequest(`matrix-${domain}-${level}-local`, {
              context: { domain, scope: "local" },
            }),
            decisionVerdict("decision", "proceed", 8, 3),
            profile,
          ).action,
        ).toBe("proceed");

        expect(
          evaluateAutonomyThreshold(
            routingRequest(`matrix-${domain}-${level}-major`, {
              context: { domain, scope: "major" },
            }),
            decisionVerdict("decision", "proceed", 8, 3),
            profile,
          ).action,
        ).toBe(level === "delegate" ? "proceed" : "escalate");
      }
    }

    expect(
      evaluateAutonomyThreshold(
        routingRequest("delegate-high-risk", {
          context: { domain: "engineering", scope: "local" },
        }),
        decisionVerdict("decision", "proceed", 8, 9),
        profileFor("engineering", "delegate"),
      ).action,
    ).toBe("escalate");
    expect(
      evaluateAutonomyThreshold(
        routingRequest("product-baseline", {
          context: {
            domain: "product",
            scope: "moderate",
            product_baseline_approved: false,
          },
        }),
        decisionVerdict("decision", "proceed", 8, 3),
        profileFor("product", "delegate"),
      ).action,
    ).toBe("escalate");
  });
});

class FakeDecisionModelClient {
  readonly inputs: StructuredModelInput[] = [];

  constructor(private readonly verdict: DecisionVerdict) {}

  async call<T>(request: StructuredModelRequest<T>): Promise<T> {
    this.inputs.push(request.input);
    return request.output.parse(verdictAsJson(this.verdict));
  }
}

class FakeNotifier implements HumanDecisionNotifier {
  readonly records: DecisionRecord[] = [];

  async notify(record: DecisionRecord): Promise<void> {
    this.records.push(record);
  }
}

class FakeTier2Hook implements Tier2InvestigationHook {
  readonly requests: {
    readonly thresholdReason: string;
  }[] = [];

  constructor(private readonly verdict: DecisionVerdict) {}

  async investigate(request: Parameters<Tier2InvestigationHook["investigate"]>[0]): Promise<DecisionVerdict> {
    this.requests.push({ thresholdReason: request.thresholdReason });
    return this.verdict;
  }
}

interface Harness {
  readonly store: JsonlExecutionStore;
  upsertNode(suffix: string): Promise<ReturnType<typeof asNodeId>>;
}

async function makeHarness(): Promise<Harness> {
  const workspaceDir = await mkdtemp(join(tmpdir(), "daimyo-decision-provider-"));
  tempDirs.push(workspaceDir);
  const store = new JsonlExecutionStore({ workspaceDir });
  return {
    store,
    async upsertNode(suffix: string): Promise<ReturnType<typeof asNodeId>> {
      const taskId = asTaskId(`task-${suffix}`);
      const nodeId = asNodeId(`node-${suffix}`);
      await store.upsertNode(taskId, {
        id: nodeId,
        taskId,
        type: "leaf",
        status: "needs-decision",
        retryCount: 0,
      });
      return nodeId;
    },
  };
}

function permissionRequest(
  suffix: string,
  overrides: {
    readonly toolName: string;
    readonly prompt?: string;
    readonly context?: JsonObject;
  },
): PermissionDecisionRequest {
  return {
    decision_id: asDecisionId(`decision-${suffix}`),
    node_id: asNodeId(`node-${suffix}`),
    task_id: asTaskId(`task-${suffix}`),
    surface: "permission",
    prompt: overrides.prompt ?? "May this tool run?",
    tool_name: overrides.toolName,
    arguments: { path: "src/example.ts" },
    ...(overrides.context === undefined ? {} : { context: overrides.context }),
  };
}

function routingRequest(
  suffix: string,
  overrides: {
    readonly prompt?: string;
    readonly options?: readonly string[];
    readonly context?: JsonObject;
  } = {},
): RoutingDecisionRequest {
  return {
    decision_id: asDecisionId(`decision-${suffix}`),
    node_id: asNodeId(`node-${suffix}`),
    task_id: asTaskId(`task-${suffix}`),
    surface: "routing",
    prompt: overrides.prompt ?? "Choose an implementation path.",
    ...(overrides.options === undefined ? {} : { options: [...overrides.options] }),
    ...(overrides.context === undefined ? {} : { context: overrides.context }),
  };
}

function decisionVerdict(
  type: DecisionVerdict["type"],
  choice: string | null,
  confidence: DecisionVerdict["confidence"],
  risk: DecisionVerdict["risk"],
): DecisionVerdict {
  return {
    type,
    suggested_choice: choice,
    suggested_response: choice === null ? null : `Use ${choice}.`,
    confidence,
    risk,
    block_trigger: false,
  };
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

function turnEnded(sessionId: string, verdict: DecisionVerdict) {
  return {
    type: "turn_ended" as const,
    sessionId: asAgentSessionId(sessionId),
    result: JSON.stringify(verdictAsJson(verdict)),
    stopReason: null,
  };
}

function profileFor(domain: AutonomyDomain, level: AutonomyLevel): AutonomyProfile {
  return {
    engineering: domain === "engineering" ? level : "big_questions_only",
    product: domain === "product" ? level : "big_questions_only",
    design: domain === "design" ? level : "big_questions_only",
  };
}

function fixedClock(): string {
  return "2026-05-22T21:30:00.000Z";
}

function requireValue<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing ${label}`);
  return value;
}
