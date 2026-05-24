import {
  asDecisionId,
  ConsoleHumanDecisionNotifier,
  decisionRequestNodeId,
  decisionRequestTaskId,
  makeDecisionRecord,
  type DecisionProvider,
  type DecisionProviderDependencies,
  type DecisionRecord,
  type DecisionTier,
  type DecisionVerdict,
  type ExecutionNodeInput,
  type ExecutionStore,
  type HumanDecisionNotifier,
  type JsonObject,
  type JsonValue,
  type PermissionDecisionRequest,
  type RoutingDecisionRequest,
  type Score0To10,
  type TieredDecisionProvider,
} from "daimyo";
import type { PolicyConfig, PolicyVerdict } from "protocol";

import type { DecisionPolicyEngine, PolicyDecisionInput, PolicyGovernanceConfig } from "../engine.js";
import type { SiblingOwnership } from "../conflict.js";

export interface PolicyDecisionProviderOptions {
  readonly engine: DecisionPolicyEngine;
  readonly config: PolicyConfig;
  readonly inner: Pick<TieredDecisionProvider, "decidePermission" | "decideRouting">;
  readonly executionStore: ExecutionStore;
  readonly clock?: () => string;
  readonly notifier?: HumanDecisionNotifier;
}

interface SettledOutcome {
  readonly tier: DecisionTier;
  readonly verdict: DecisionVerdict;
  readonly rationale: string;
}

type EnrichedRequest = PermissionDecisionRequest | RoutingDecisionRequest;

const DETERMINISTIC_CONFIDENCE: Score0To10 = 10;

export class PolicyDecisionProvider implements DecisionProvider {
  private readonly engine: DecisionPolicyEngine;
  private readonly config: PolicyGovernanceConfig;
  private readonly inner: Pick<TieredDecisionProvider, "decidePermission" | "decideRouting">;
  private readonly executionStore: ExecutionStore;
  private readonly clock: () => string;
  private readonly notifier: HumanDecisionNotifier;

  constructor(options: PolicyDecisionProviderOptions) {
    this.engine = options.engine;
    this.config = {
      autonomy_profile: options.config.autonomy_profile,
      product_baseline_approved: options.config.product_baseline_approved,
      static_rules: options.config.static_rules,
    };
    this.inner = options.inner;
    this.executionStore = options.executionStore;
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.notifier = options.notifier ?? new ConsoleHumanDecisionNotifier();
  }

  async decidePermission(
    request: PermissionDecisionRequest,
    dependencies?: DecisionProviderDependencies,
  ): Promise<DecisionRecord> {
    const verdict = this.engine.evaluate({
      request,
      config: this.config,
      ...siblingOwnershipInput(request.context),
    });
    const enrichedRequest = enrichRequest(request, verdict, this.config.product_baseline_approved);

    if (verdict.outcome === "route") {
      return await this.inner.decidePermission(enrichedRequest, dependencies);
    }

    return await this.resolve(enrichedRequest, settledPermissionOutcome(enrichedRequest, verdict));
  }

  async decideRouting(
    request: RoutingDecisionRequest,
    dependencies?: DecisionProviderDependencies,
  ): Promise<DecisionRecord> {
    const verdict = this.engine.evaluate({
      request,
      config: this.config,
      ...siblingOwnershipInput(request.context),
    });
    const enrichedRequest = enrichRequest(request, verdict, this.config.product_baseline_approved);

    if (verdict.outcome === "route") {
      return await this.inner.decideRouting(enrichedRequest, dependencies);
    }

    return await this.resolve(enrichedRequest, settledRoutingOutcome(enrichedRequest, verdict));
  }

  private async resolve(
    request: EnrichedRequest,
    outcome: SettledOutcome,
  ): Promise<DecisionRecord> {
    const record = makeDecisionRecord({
      decision_id: asDecisionId(request.decision_id),
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

  private async parkAwaitingHuman(request: EnrichedRequest): Promise<void> {
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
}

function settledPermissionOutcome(
  request: PermissionDecisionRequest,
  policyVerdict: PolicyVerdict,
): SettledOutcome {
  if (policyVerdict.outcome === "permit") {
    return {
      tier: 0,
      rationale: tier0Rationale(policyVerdict),
      verdict: {
        type: "access",
        suggested_choice: "allow",
        suggested_response: `Allowed ${request.tool_name} by Decision Policy Engine.`,
        confidence: DETERMINISTIC_CONFIDENCE,
        risk: riskFromPolicyVerdict(policyVerdict),
        block_trigger: false,
      },
    };
  }

  if (policyVerdict.matched_rule_refs.length > 0) {
    return {
      tier: 0,
      rationale: tier0Rationale(policyVerdict),
      verdict: {
        type: "access",
        suggested_choice: "deny",
        suggested_response: `Denied ${request.tool_name} by Decision Policy Engine static policy.`,
        confidence: DETERMINISTIC_CONFIDENCE,
        risk: riskFromPolicyVerdict(policyVerdict),
        block_trigger: false,
      },
    };
  }

  return humanOutcome(policyVerdict);
}

function settledRoutingOutcome(
  request: RoutingDecisionRequest,
  policyVerdict: PolicyVerdict,
): SettledOutcome {
  if (policyVerdict.outcome === "permit") {
    return {
      tier: 0,
      rationale: tier0Rationale(policyVerdict),
      verdict: {
        type: "decision",
        suggested_choice: firstOption(request) ?? "proceed",
        suggested_response: "Proceed under deterministic Decision Policy Engine policy.",
        confidence: DETERMINISTIC_CONFIDENCE,
        risk: riskFromPolicyVerdict(policyVerdict),
        block_trigger: false,
      },
    };
  }

  return humanOutcome(policyVerdict);
}

function humanOutcome(policyVerdict: PolicyVerdict): SettledOutcome {
  return {
    tier: 3,
    rationale: `Tier 3 policy escalation from Decision Policy Engine: ${policyVerdict.rationale}`,
    verdict: {
      type: "human",
      suggested_choice: null,
      suggested_response: policyVerdict.rationale,
      confidence: 0,
      risk: 10,
      block_trigger: true,
    },
  };
}

function tier0Rationale(policyVerdict: PolicyVerdict): string {
  return `Tier 0 Decision Policy Engine ${policyVerdict.outcome}: ${policyVerdict.rationale}`;
}

function enrichRequest<TRequest extends EnrichedRequest>(
  request: TRequest,
  policyVerdict: PolicyVerdict,
  productBaselineApproved: boolean,
): TRequest {
  const risk = riskFromPolicyVerdict(policyVerdict);
  const context: JsonObject = {
    ...(request.context ?? {}),
    domain: policyVerdict.classified_domain,
    decision_domain: policyVerdict.classified_domain,
    scope: policyVerdict.classified_scope,
    decision_scope: policyVerdict.classified_scope,
    risk,
    declared_risk: risk,
    product_baseline_approved: productBaselineApproved,
    policy_outcome: policyVerdict.outcome,
    policy_conflict_class: policyVerdict.conflict_class,
    policy_review_required: policyVerdict.review_required,
    policy_engine_version: policyVerdict.engine_version,
  };

  return {
    ...request,
    context,
  };
}

function riskFromPolicyVerdict(policyVerdict: PolicyVerdict): Score0To10 {
  if (policyVerdict.outcome === "stop" || policyVerdict.review_required) return 10;
  if (policyVerdict.conflict_class === "hard_conflict") return 9;
  if (policyVerdict.conflict_class === "soft_conflict") return 6;

  switch (policyVerdict.classified_scope) {
    case "local":
      return 2;
    case "moderate":
      return 5;
    case "major":
      return 8;
  }
}

function firstOption(request: RoutingDecisionRequest): string | undefined {
  return request.options?.[0];
}

function siblingOwnershipFromContext(context: JsonObject | undefined): readonly SiblingOwnership[] | undefined {
  const entries = readObjectArray(context, "sibling_ownership").map(readSiblingOwnership);
  const siblings = entries.filter(isSiblingOwnership);
  return siblings.length === 0 ? undefined : siblings;
}

function siblingOwnershipInput(
  context: JsonObject | undefined,
): Pick<PolicyDecisionInput, "sibling_ownership"> | object {
  const siblingOwnership = siblingOwnershipFromContext(context);
  return siblingOwnership === undefined ? {} : { sibling_ownership: siblingOwnership };
}

function readSiblingOwnership(source: JsonObject): SiblingOwnership | undefined {
  const siblingId = readString(source, "sibling_id");
  if (siblingId === undefined) return undefined;

  return {
    sibling_id: siblingId,
    owns_files: [...readStringArray(source, "owns_files")],
    owns_interfaces: [...readStringArray(source, "owns_interfaces")],
    owns_data: [...readStringArray(source, "owns_data")],
    owns_workflow_steps: [...readStringArray(source, "owns_workflow_steps")],
    depends_on: [...readStringArray(source, "depends_on")],
  };
}

function isSiblingOwnership(value: SiblingOwnership | undefined): value is SiblingOwnership {
  return value !== undefined;
}

function readObjectArray(context: JsonObject | undefined, key: string): readonly JsonObject[] {
  const value = context?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter(isJsonObject);
}

function readStringArray(source: JsonObject, key: string): readonly string[] {
  const value = source[key];
  if (!Array.isArray(value)) return [];
  return value.filter(isString);
}

function readString(source: JsonObject, key: string): string | undefined {
  const value = source[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: JsonValue): value is string {
  return typeof value === "string";
}
