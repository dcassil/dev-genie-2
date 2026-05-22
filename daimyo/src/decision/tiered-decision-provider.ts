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

export interface StaticDecisionRules {
  readonly allowTools?: readonly string[];
  readonly denyTools?: readonly string[];
}

export interface HumanDecisionNotifier {
  notify(record: DecisionRecord): Promise<void>;
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
  investigationRequired(request: Tier2InvestigationRequest): Promise<void>;
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

export class ConsoleHumanDecisionNotifier implements HumanDecisionNotifier {
  async notify(record: DecisionRecord): Promise<void> {
    console.error(
      `Daimyo awaiting human decision ${record.id} for node ${record.request.nodeId}: ${record.rationale}`,
    );
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
    _dependencies?: DecisionProviderDependencies,
  ): Promise<DecisionRecord> {
    const tier0 = this.evaluateRoutingTier0(request);
    if (tier0.kind === "resolved") return this.resolve(request, tier0);

    const tier1 = await this.evaluateTier1(request, tier0.rationale);
    return this.resolve(request, tier1);
  }

  private evaluatePermissionTier0(request: PermissionDecisionRequest): ResolvedDecisionOutcome {
    const rule = this.toolRule(request.toolName);
    const policy = decisionPolicyContext(request, this.autonomyProfile);

    if (rule === "deny") {
      return {
        kind: "resolved",
        tier: 0,
        rationale: `Tier 0 static deny rule matched tool ${request.toolName}`,
        verdict: {
          type: "access",
          suggested_choice: "deny",
          suggested_response: `Denied ${request.toolName} by static rule.`,
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
          ? `Allowed ${request.toolName} by Tier 0 policy.`
          : `Denied ${request.toolName} pending stronger policy.`,
      confidence: rule === "allow" ? 9 : 6,
      risk: policy.declaredRisk,
      block_trigger: false,
    };

    if (provisional.suggested_choice === "deny") {
      return {
        kind: "resolved",
        tier: 0,
        verdict: provisional,
        rationale: `Tier 0 denied unlisted tool ${request.toolName}`,
      };
    }

    const threshold = evaluateAutonomyThreshold(request, provisional, this.autonomyProfile);
    if (threshold.action === "escalate") {
      return {
        kind: "resolved",
        tier: 3,
        verdict: humanVerdict(`Permission for ${request.toolName} requires human review.`),
        rationale: `Tier 3 policy escalation: ${threshold.reason}`,
      };
    }

    return {
      kind: "resolved",
      tier: 0,
      verdict: provisional,
      rationale: `Tier 0 ${rule === "allow" ? "static allow" : "delegated"} rule allowed tool ${request.toolName}`,
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

    const threshold = evaluateAutonomyThreshold(request, verdict, this.autonomyProfile);
    if (threshold.action === "escalate") {
      if (this.shouldFlagTier2(verdict)) {
        await this.tier2InvestigationHook?.investigationRequired({
          request,
          tier1Verdict: verdict,
          thresholdReason: threshold.reason,
        });
      }
      return {
        kind: "resolved",
        tier: 3,
        verdict: toHumanVerdict(verdict),
        rationale: `Tier 3 escalation after Tier 1: ${threshold.reason}`,
      };
    }

    return {
      kind: "resolved",
      tier: 1,
      verdict,
      rationale: `Tier 1 bounded model decision after Tier 0 fallthrough: ${fallthroughRationale}`,
    };
  }

  private async resolve(
    request: DecisionRequest,
    outcome: ResolvedDecisionOutcome,
  ): Promise<DecisionRecord> {
    const record: DecisionRecord = {
      id: request.id,
      request,
      verdict: outcome.verdict,
      tier: outcome.tier,
      rationale: outcome.rationale,
      createdAt: this.clock(),
    };

    if (outcome.tier === 3) {
      await this.parkAwaitingHuman(request);
    }

    await this.executionStore.recordDecision(request.taskId, request.nodeId, record);

    if (outcome.tier === 3) {
      await this.notifier.notify(record);
    }

    return record;
  }

  private async parkAwaitingHuman(request: DecisionRequest): Promise<void> {
    const snapshot = await this.executionStore.load(request.taskId);
    const node = snapshot.nodes.find((candidate) => candidate.id === request.nodeId);
    if (node === undefined) {
      throw new Error(`Cannot park unknown node awaiting human: ${request.nodeId}`);
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
    await this.executionStore.upsertNode(request.taskId, input);
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
      id: request.id,
      nodeId: request.nodeId,
      taskId: request.taskId,
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
