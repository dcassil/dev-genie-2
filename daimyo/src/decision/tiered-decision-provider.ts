import type {
  DecisionRecord,
  DecisionRequest,
  DecisionTier,
  DecisionVerdict,
  ExecutionNodeInput,
  ExecutionStore,
  JsonObject,
  JsonValue,
  PermissionDecisionRequest,
  RoutingDecisionRequest,
  Score0To10,
} from "../core/index.js";
import type { DecisionProvider, DecisionProviderDependencies } from "../core/index.js";
import type {
  AgentEvent,
  AgentTransport,
} from "../core/ports/agent-transport.js";
import {
  asDecisionId,
  asNodeId,
  decisionRequestId,
  decisionRequestNodeId,
  decisionRequestTaskId,
  makeDecisionRecord,
} from "../core/index.js";
import type {
  StructuredModelRequest,
  StructuredModelSchema,
} from "../engine/structured-model-call.js";
import {
  requireJsonObject,
  StructuredModelCallError,
} from "../engine/structured-model-call.js";
import {
  asScore0To10,
  decisionPolicyContext,
  DEFAULT_AUTONOMY_PROFILE,
  evaluateAutonomyThreshold,
  type AutonomyProfile,
} from "./autonomy.js";
import {
  DEFAULT_TIER1_DECISION_PROMPT,
  type Tier1DecisionPrompt,
} from "./tier1-prompt.js";
import { ConsoleHumanDecisionNotifier, type HumanDecisionNotifier } from "../notification/notifier.js";

export interface StaticDecisionRules {
  readonly allowTools?: readonly string[];
  readonly denyTools?: readonly string[];
}

export interface DecisionModelClient {
  call<T>(request: StructuredModelRequest<T>): Promise<T>;
}

export interface Tier2InvestigationRequest {
  readonly request: DecisionRequest;
  readonly tier1Verdict: DecisionVerdict;
  readonly thresholdReason: string;
}

export interface Tier2InvestigationHook {
  investigate(request: Tier2InvestigationRequest): Promise<DecisionVerdict>;
}

export interface AgentTransportTier2InvestigationHookOptions {
  readonly agentTransport: AgentTransport;
  readonly cwd: string;
  readonly maxEvents?: number;
}

export interface TieredDecisionProviderOptions {
  readonly executionStore: ExecutionStore;
  readonly autonomyProfile?: AutonomyProfile;
  readonly staticRules?: StaticDecisionRules;
  readonly modelClient?: DecisionModelClient;
  readonly tier1Prompt?: Tier1DecisionPrompt | null;
  readonly notifier?: HumanDecisionNotifier;
  readonly tier2InvestigationHook?: Tier2InvestigationHook;
  readonly clock?: () => string;
}

type Tier0Outcome =
  | {
      readonly kind: "resolved";
      readonly tier: DecisionTier;
      readonly verdict: DecisionVerdict;
      readonly rationale: string;
    }
  | {
      readonly kind: "fallthrough";
      readonly rationale: string;
    };
type ResolvedDecisionOutcome = Extract<Tier0Outcome, { readonly kind: "resolved" }>;

const DEFAULT_STATIC_RULES: StaticDecisionRules = {
  allowTools: ["Read", "Grep", "Glob", "LS", "TodoRead"],
  denyTools: [],
};

export class AgentTransportTier2InvestigationHook implements Tier2InvestigationHook {
  private readonly agentTransport: AgentTransport;
  private readonly cwd: string;
  private readonly maxEvents: number;

  constructor(options: AgentTransportTier2InvestigationHookOptions) {
    this.agentTransport = options.agentTransport;
    this.cwd = options.cwd;
    this.maxEvents = options.maxEvents ?? 20;
  }

  async investigate(request: Tier2InvestigationRequest): Promise<DecisionVerdict> {
    const session = await this.agentTransport.spawnSession({
      nodeId: asNodeId(`${request.request.node_id}:tier2`),
      cwd: this.cwd,
      prompt: tier2InvestigationPrompt(request),
      metadata: {
        tier: 2,
        mode: "read-only",
        cross_port_edge: "DecisionProvider->AgentTransport Tier-2 investigation",
      },
    });

    try {
      for (let index = 0; index < this.maxEvents; index += 1) {
        const event = await this.agentTransport.readEvent(session.id);
        if (event.type === "turn_ended") {
          const parsed: JsonValue = JSON.parse(event.result);
          return decisionVerdictSchema.parse(parsed);
        }
        await this.handleNonTerminalEvent(event);
      }
    } finally {
      await this.agentTransport.disposeSession(session.id);
    }

    return humanVerdict("Tier 2 investigation did not produce a verdict within the event budget.");
  }

  private async handleNonTerminalEvent(event: AgentEvent): Promise<void> {
    if (event.type === "turn_ended") return;
    if (event.type === "log") return;
    if (event.type === "needs_permission") {
      const decision = readOnlyPermissionDecision(event.toolName, event.arguments);
      if (decision.allowed) {
        await this.agentTransport.sendCommand(event.sessionId, {
          type: "approve",
          correlationId: event.correlationId,
          reason: decision.reason,
        });
      } else {
        await this.agentTransport.sendCommand(event.sessionId, {
          type: "deny",
          correlationId: event.correlationId,
          reason: decision.reason,
        });
      }
      return;
    }
    if (event.type === "needs_input") {
      await this.agentTransport.sendCommand(event.sessionId, {
        type: "respond",
        correlationId: event.correlationId,
        response: "Continue the Tier 2 investigation using only read-only evidence.",
      });
      return;
    }
    if (event.type === "stalled") {
      await this.agentTransport.sendCommand(event.sessionId, {
        type: "interrupt",
        correlationId: event.correlationId,
        reason: "Tier 2 read-only investigation stalled.",
      });
      return;
    }
    throw new Error(`Tier 2 investigation worker exited before producing a verdict: ${event.reason}`);
  }
}

export class TieredDecisionProvider implements DecisionProvider {
  private readonly executionStore: ExecutionStore;
  private readonly autonomyProfile: AutonomyProfile;
  private readonly staticRules: StaticDecisionRules;
  private readonly modelClient: DecisionModelClient | undefined;
  private readonly tier1Prompt: Tier1DecisionPrompt | null;
  private readonly notifier: HumanDecisionNotifier;
  private readonly tier2InvestigationHook: Tier2InvestigationHook | undefined;
  private readonly clock: () => string;

  constructor(options: TieredDecisionProviderOptions) {
    this.executionStore = options.executionStore;
    this.autonomyProfile = options.autonomyProfile ?? DEFAULT_AUTONOMY_PROFILE;
    this.staticRules = options.staticRules ?? DEFAULT_STATIC_RULES;
    this.modelClient = options.modelClient;
    this.tier1Prompt = options.tier1Prompt === undefined ? DEFAULT_TIER1_DECISION_PROMPT : options.tier1Prompt;
    this.notifier = options.notifier ?? new ConsoleHumanDecisionNotifier();
    this.tier2InvestigationHook = options.tier2InvestigationHook;
    this.clock = options.clock ?? (() => new Date().toISOString());
  }

  async decidePermission(
    request: PermissionDecisionRequest,
    _dependencies?: DecisionProviderDependencies,
  ): Promise<DecisionRecord> {
    return this.resolve(request, this.evaluatePermissionTier0(request));
  }

  async decideRouting(
    request: RoutingDecisionRequest,
    dependencies?: DecisionProviderDependencies,
  ): Promise<DecisionRecord> {
    const tier0 = this.evaluateRoutingTier0(request);
    if (tier0.kind === "resolved") return this.resolve(request, tier0);

    const tier1 = await this.evaluateTier1(request, tier0.rationale, dependencies);
    return this.resolve(request, tier1);
  }

  private evaluatePermissionTier0(request: PermissionDecisionRequest): ResolvedDecisionOutcome {
    const rule = this.toolRule(request.tool_name);
    const policy = decisionPolicyContext(request, this.autonomyProfile);

    if (rule === "deny") {
      return {
        kind: "resolved",
        tier: 0,
        rationale: `Tier 0 static deny rule matched tool ${request.tool_name}`,
        verdict: {
          type: "access",
          suggested_choice: "deny",
          suggested_response: `Denied ${request.tool_name} by static rule.`,
          confidence: 10,
          risk: 10,
          block_trigger: false,
        },
      };
    }

    const provisional: DecisionVerdict = {
      type: "access",
      suggested_choice: rule === "allow" || policy.level === "delegate" ? "allow" : "deny",
      suggested_response:
        rule === "allow" || policy.level === "delegate"
          ? `Allowed ${request.tool_name} by Tier 0 policy.`
          : `Denied ${request.tool_name} pending stronger policy.`,
      confidence: rule === "allow" ? 9 : 6,
      risk: policy.declaredRisk,
      block_trigger: false,
    };

    if (provisional.suggested_choice === "deny") {
      return {
        kind: "resolved",
        tier: 0,
        verdict: provisional,
        rationale: `Tier 0 denied unlisted tool ${request.tool_name}`,
      };
    }

    const threshold = evaluateAutonomyThreshold(request, provisional, this.autonomyProfile);
    if (threshold.action === "escalate") {
      return {
        kind: "resolved",
        tier: 3,
        verdict: humanVerdict(`Permission for ${request.tool_name} requires human review.`),
        rationale: `Tier 3 policy escalation: ${threshold.reason}`,
      };
    }

    return {
      kind: "resolved",
      tier: 0,
      verdict: provisional,
      rationale: `Tier 0 ${rule === "allow" ? "static allow" : "delegated"} rule allowed tool ${request.tool_name}`,
    };
  }

  private evaluateRoutingTier0(request: RoutingDecisionRequest): Tier0Outcome {
    const policy = decisionPolicyContext(request, this.autonomyProfile);

    if (policy.level === "always_in_loop" && policy.scope !== "local") {
      return {
        kind: "resolved",
        tier: 3,
        verdict: humanVerdict("Routing decision requires human review under always_in_loop."),
        rationale: "Tier 3 policy escalation: always_in_loop requires review beyond local details",
      };
    }

    if (policy.level === "big_questions_only" && policy.scope === "major") {
      return {
        kind: "resolved",
        tier: 3,
        verdict: humanVerdict("Major routing decision requires human review."),
        rationale: "Tier 3 policy escalation: major decision under big_questions_only",
      };
    }

    if (policy.level === "delegate" && policy.scope === "local") {
      return {
        kind: "resolved",
        tier: 0,
        verdict: {
          type: "decision",
          suggested_choice: firstOption(request) ?? "proceed",
          suggested_response: "Proceed under delegated local routing policy.",
          confidence: 8,
          risk: 2,
          block_trigger: false,
        },
        rationale: "Tier 0 settled delegated local routing decision",
      };
    }

    return {
      kind: "fallthrough",
      rationale: "Tier 0 found no deterministic routing rule",
    };
  }

  private async evaluateTier1(
    request: RoutingDecisionRequest,
    fallthroughRationale: string,
    dependencies: DecisionProviderDependencies | undefined,
  ): Promise<ResolvedDecisionOutcome> {
    if (this.modelClient === undefined || this.tier1Prompt === null) {
      return {
        kind: "resolved",
        tier: 3,
        verdict: humanVerdict("Tier 1 decision prompt or model client is unavailable."),
        rationale: `Tier 3 degradation: ${fallthroughRationale}; Tier 1 unavailable`,
      };
    }

    const verdict = await this.modelClient.call({
      input: {
        context: this.tier1Context(request),
        rules: this.tier1Rules(),
        request: this.tier1Request(request),
      },
      output: decisionVerdictSchema,
    });

    const investigatedVerdict = await this.maybeInvestigateTier2(
      request,
      verdict,
      fallthroughRationale,
      dependencies,
    );
    const threshold = evaluateAutonomyThreshold(request, investigatedVerdict, this.autonomyProfile);
    if (threshold.action === "escalate") {
      if (investigatedVerdict !== verdict) {
        await this.recordIntermediateDecision(makeDecisionRecord({
          decision_id: asDecisionId(`${request.decision_id}:tier2`),
          request,
          verdict: investigatedVerdict,
          tier: 2,
          rationale: `Tier 2 investigation completed but policy still escalated: ${threshold.reason}`,
          created_at: this.clock(),
        }));
      }
      return {
        kind: "resolved",
        tier: 3,
        verdict: toHumanVerdict(investigatedVerdict),
        rationale: `Tier 3 escalation after Tier 1: ${threshold.reason}`,
      };
    }

    return {
      kind: "resolved",
      tier: investigatedVerdict === verdict ? 1 : 2,
      verdict: investigatedVerdict,
      rationale:
        investigatedVerdict === verdict
          ? `Tier 1 bounded model decision after Tier 0 fallthrough: ${fallthroughRationale}`
          : `Tier 2 read-only investigation improved Tier 1 verdict after: ${fallthroughRationale}`,
    };
  }

  private async maybeInvestigateTier2(
    request: RoutingDecisionRequest,
    verdict: DecisionVerdict,
    fallthroughRationale: string,
    dependencies: DecisionProviderDependencies | undefined,
  ): Promise<DecisionVerdict> {
    if (!this.shouldFlagTier2(verdict)) return verdict;

    const hook = this.tier2InvestigationHook ?? tier2HookFromDependencies(dependencies);
    if (hook === undefined) return verdict;
    return await hook.investigate({
      request,
      tier1Verdict: verdict,
      thresholdReason: `${fallthroughRationale}; ${tier2TriggerReason(verdict)}`,
    });
  }

  private async resolve(
    request: DecisionRequest,
    outcome: ResolvedDecisionOutcome,
  ): Promise<DecisionRecord> {
    const record = makeDecisionRecord({
      decision_id: decisionRequestId(request),
      request,
      verdict: outcome.verdict,
      tier: outcome.tier,
      rationale: outcome.rationale,
      created_at: this.clock(),
    });

    if (outcome.tier === 3) {
      await this.parkAwaitingHuman(request);
    }

    await this.executionStore.recordDecision(decisionRequestTaskId(request), decisionRequestNodeId(request), record);

    if (outcome.tier === 3) {
      await this.notifier.notify(record);
    }

    return record;
  }

  private async recordIntermediateDecision(record: DecisionRecord): Promise<void> {
    await this.executionStore.recordDecision(
      decisionRequestTaskId(record.payload.request),
      decisionRequestNodeId(record.payload.request),
      record,
    );
  }

  private async parkAwaitingHuman(request: DecisionRequest): Promise<void> {
    const taskId = decisionRequestTaskId(request);
    const nodeId = decisionRequestNodeId(request);
    const snapshot = await this.executionStore.load(taskId);
    const node = snapshot.nodes.find((candidate) => candidate.id === nodeId);
    if (node === undefined) {
      throw new Error(`Cannot park unknown node awaiting human: ${request.node_id}`);
    }

    const input: ExecutionNodeInput = {
      id: node.id,
      taskId: node.taskId,
      type: node.type,
      status: "awaiting-human",
      retryCount: node.retryCount,
      ...(node.parentId === undefined ? {} : { parentId: node.parentId }),
      ...(node.session === undefined ? {} : { session: node.session }),
    };
    await this.executionStore.upsertNode(taskId, input);
  }

  private toolRule(toolName: string): "allow" | "deny" | "none" {
    if ((this.staticRules.denyTools ?? []).includes(toolName)) return "deny";
    if ((this.staticRules.allowTools ?? []).includes(toolName)) return "allow";
    return "none";
  }

  private tier1Context(request: RoutingDecisionRequest): JsonObject {
    return {
      prompt_id: this.requiredTier1Prompt().id,
      prompt_version: this.requiredTier1Prompt().version,
      prompt: this.requiredTier1Prompt().text,
      request_context: request.context ?? {},
    };
  }

  private tier1Rules(): JsonObject {
    return {
      autonomy_profile: {
        engineering: this.autonomyProfile.engineering,
        product: this.autonomyProfile.product,
        design: this.autonomyProfile.design,
      },
      static_rules: {
        allow_tools: [...(this.staticRules.allowTools ?? [])],
        deny_tools: [...(this.staticRules.denyTools ?? [])],
      },
      verdict_contract:
        "Return {type,suggested_choice,suggested_response,confidence,risk,block_trigger}. No tools or filesystem.",
    };
  }

  private tier1Request(request: RoutingDecisionRequest): JsonObject {
    return {
      decision_id: request.decision_id,
      node_id: request.node_id,
      task_id: request.task_id,
      surface: request.surface,
      prompt: request.prompt,
      ...(request.options === undefined ? {} : { options: [...request.options] }),
    };
  }

  private requiredTier1Prompt(): Tier1DecisionPrompt {
    if (this.tier1Prompt === null) {
      throw new Error("Tier 1 prompt is unavailable");
    }
    return this.tier1Prompt;
  }

  private shouldFlagTier2(verdict: DecisionVerdict): boolean {
    return verdict.risk >= 7 || verdict.confidence <= 4;
  }
}

export const decisionVerdictSchema: StructuredModelSchema<DecisionVerdict> = {
  name: "decision-verdict.v1",
  schema: {
    type: "object",
    required: [
      "type",
      "suggested_choice",
      "suggested_response",
      "confidence",
      "risk",
      "block_trigger",
    ],
    additionalProperties: false,
    properties: {
      type: { enum: ["decision", "access", "human"] },
      suggested_choice: { type: ["string", "null"] },
      suggested_response: { type: ["string", "null"] },
      confidence: { type: "integer", minimum: 0, maximum: 10 },
      risk: { type: "integer", minimum: 0, maximum: 10 },
      block_trigger: { type: "boolean" },
    },
  },
  parse(value: JsonValue): DecisionVerdict {
    const object = requireJsonObject(value, "decision verdict");
    return {
      type: readVerdictType(object, "type"),
      suggested_choice: readNullableString(object, "suggested_choice"),
      suggested_response: readNullableString(object, "suggested_response"),
      confidence: readScore(object, "confidence"),
      risk: readScore(object, "risk"),
      block_trigger: readBoolean(object, "block_trigger"),
    };
  },
};

function tier2HookFromDependencies(
  dependencies: DecisionProviderDependencies | undefined,
): Tier2InvestigationHook | undefined {
  if (dependencies?.agentTransport === undefined || dependencies.cwd === undefined) return undefined;
  return new AgentTransportTier2InvestigationHook({
    agentTransport: dependencies.agentTransport,
    cwd: dependencies.cwd,
  });
}

function tier2TriggerReason(verdict: DecisionVerdict): string {
  if (verdict.risk >= 7 && verdict.confidence <= 4) {
    return "Tier 1 returned low confidence and high risk";
  }
  if (verdict.risk >= 7) return "Tier 1 returned high risk";
  return "Tier 1 returned low confidence";
}

function tier2InvestigationPrompt(request: Tier2InvestigationRequest): string {
  return [
    "Daimyo Tier 2 read-only investigation.",
    "You may inspect files and state, but you must not edit files or run mutating commands.",
    "Return only a DecisionVerdict JSON object with keys:",
    "{type,suggested_choice,suggested_response,confidence,risk,block_trigger}",
    "",
    `Decision prompt: ${request.request.prompt}`,
    `Tier 1 verdict: ${JSON.stringify(request.tier1Verdict)}`,
    `Escalation reason: ${request.thresholdReason}`,
    `Context: ${JSON.stringify(request.request.context ?? {})}`,
  ].join("\n");
}

function readOnlyPermissionDecision(
  toolName: string,
  toolArguments: JsonObject,
): { readonly allowed: boolean; readonly reason: string } {
  if (toolName === "Read" || toolName === "Grep" || toolName === "Glob" || toolName === "LS" || toolName === "TodoRead") {
    return { allowed: true, reason: `Tier 2 read-only investigation allowed ${toolName}.` };
  }
  if (toolName === "Bash") {
    const command = readNullableCommand(toolArguments);
    if (command !== undefined && isReadOnlyShellCommand(command)) {
      return { allowed: true, reason: "Tier 2 read-only investigation allowed read-only shell command." };
    }
    return { allowed: false, reason: "Tier 2 read-only investigation denied mutating bash." };
  }
  return { allowed: false, reason: `Tier 2 read-only investigation denied ${toolName}.` };
}

function readNullableCommand(toolArguments: JsonObject): string | undefined {
  const value = toolArguments.command;
  return typeof value === "string" ? value.trim() : undefined;
}

function isReadOnlyShellCommand(command: string): boolean {
  if (command.length === 0) return false;
  const readOnlyPrefixes = [
    "pwd",
    "ls",
    "find",
    "rg",
    "grep",
    "cat",
    "git status",
    "git diff",
    "git show",
    "git log",
    "git grep",
    "git ls-files",
  ];
  if (readOnlyPrefixes.some((prefix) => command === prefix || command.startsWith(`${prefix} `))) {
    return !containsShellMutation(command);
  }
  if (command.startsWith("sed -n ")) return !containsShellMutation(command);
  return false;
}

function containsShellMutation(command: string): boolean {
  return /(^|[;&|]\s*)(rm|mv|cp|mkdir|touch|chmod|chown|npm|pnpm|yarn|git\s+(add|commit|push|checkout|reset|clean|merge|rebase)|sed\s+-i)\b/.test(command) ||
    command.includes(">") ||
    command.includes(">>");
}

function firstOption(request: RoutingDecisionRequest): string | undefined {
  return request.options?.[0];
}

function humanVerdict(response: string): DecisionVerdict {
  return {
    type: "human",
    suggested_choice: null,
    suggested_response: response,
    confidence: 0,
    risk: 10,
    block_trigger: true,
  };
}

function toHumanVerdict(verdict: DecisionVerdict): DecisionVerdict {
  return {
    type: "human",
    suggested_choice: verdict.suggested_choice,
    suggested_response: verdict.suggested_response,
    confidence: verdict.confidence,
    risk: verdict.risk,
    block_trigger: true,
  };
}

function readVerdictType(source: JsonObject, key: string): DecisionVerdict["type"] {
  const value = source[key];
  if (value === "decision" || value === "access" || value === "human") return value;
  throw new StructuredModelCallError(`${key} must be decision, access, or human`);
}

function readNullableString(source: JsonObject, key: string): string | null {
  const value = source[key];
  if (value === null || typeof value === "string") return value;
  throw new StructuredModelCallError(`${key} must be a string or null`);
}

function readBoolean(source: JsonObject, key: string): boolean {
  const value = source[key];
  if (typeof value === "boolean") return value;
  throw new StructuredModelCallError(`${key} must be a boolean`);
}

function readScore(source: JsonObject, key: string): Score0To10 {
  const value = source[key];
  if (typeof value === "number" && Number.isInteger(value)) {
    try {
      return asScore0To10(value, key);
    } catch (_error) {
      throw new StructuredModelCallError(`${key} must be an integer from 0 to 10`);
    }
  }
  throw new StructuredModelCallError(`${key} must be an integer from 0 to 10`);
}
