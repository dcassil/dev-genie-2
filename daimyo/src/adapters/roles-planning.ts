import { createHash } from "node:crypto";
import {
  PLANNER_ROLE_ID,
  PLANNER_ROLE_VERSION,
  PlannerRoleRunner,
  plannerRoleDefinition,
  type StructuredModelCaller as RolesStructuredModelCaller,
} from "roles";
import type {
  ArtifactReference,
  Confidence,
  DecisionRequestPayload,
  JsonObject,
  JsonValue,
  PlanProposal,
  ProposedPlanTask,
  RoleDecisionScope,
  RoleInvocation,
} from "protocol";

import type { DecisionRequest } from "../core/domain.js";
import type {
  PlannedTask,
  PlanningRequest,
  PlanningResult,
  RolesPlanning,
} from "../core/ports/capabilities.js";
import type { DecisionScope } from "../decision/autonomy.js";

const ROLE_INVOCATION_SCHEMA_VERSION = "1.0.0";
const PLAN_PROPOSAL_SCHEMA_VERSION = "1.0.0";
const PROTOCOL_VERSION = "1.2.0";
const DEFAULT_TIMEOUT_MS = 30_000;

export interface RolesPlanningAdapterOptions {
  readonly modelClient: RolesStructuredModelCaller;
  readonly now?: () => Date;
}

interface PlanningIdentity {
  readonly invocationId: string;
  readonly scopeId: string;
  readonly taskId: string;
  readonly nodeId: string;
}

interface PlanningPolicyContext {
  readonly domain: typeof plannerRoleDefinition.autonomy.domain;
  readonly decisionScope: DecisionScope;
  readonly roleScopeType: RoleDecisionScope["scope_type"];
  readonly confidence: number;
  readonly declaredRisk: number;
  readonly humanReviewRequired: boolean;
  readonly reasonCodes: readonly string[];
}

export class RolesPlanningAdapter implements RolesPlanning {
  private readonly modelClient: RolesStructuredModelCaller;
  private readonly now: () => Date;

  constructor(options: RolesPlanningAdapterOptions) {
    this.modelClient = options.modelClient;
    this.now = options.now ?? (() => new Date());
  }

  async plan(request: PlanningRequest): Promise<PlanningResult> {
    let proposal: PlanProposal | undefined;
    const runner = new PlannerRoleRunner({
      modelClient: this.modelClient,
      now: this.now,
      artifactSink: (artifact) => {
        proposal = artifact;
      },
    });
    const identity = identityFor(request);
    const invocation = roleInvocationFor(request, identity, this.now());
    const result = await runner.run(invocation, {
      goal: {
        goal: request.goal,
      },
      context: request.context ?? {},
    });
    const policy = policyContextFor(request, invocation, result.payload.confidence, result.payload.human_review_required, []);

    if (proposal === undefined) {
      if (result.payload.human_review_required) {
        return {
          tasks: [],
          decisions: [reviewDecisionFor(request.goal, identity, policy)],
        };
      }
      throw new Error(`Planner Role did not produce a PlanProposal: ${result.payload.status}`);
    }

    const proposalPolicy = policyContextFor(
      request,
      invocation,
      proposal.payload.confidence,
      result.payload.human_review_required || proposal.payload.review_required.required,
      proposal.payload.review_required.reason_codes,
    );
    const decisions = [
      ...reviewDecisionsFor(request.goal, identity, proposalPolicy),
      ...proposal.payload.decision_requests.map((decision) =>
        decisionWithAutonomyContext(decision, proposalPolicy),
      ),
    ];

    return {
      tasks: proposal.payload.tasks.map(plannedTaskFor),
      decisions,
    };
  }
}

function roleInvocationFor(
  request: PlanningRequest,
  identity: PlanningIdentity,
  createdAt: Date,
): RoleInvocation {
  const createdAtIso = createdAt.toISOString();
  const requestRef = planningRequestReference(identity.scopeId);
  const contextRef = planningContextReference(identity.scopeId);
  const payload: RoleInvocation["payload"] = {
    invocation_id: identity.invocationId,
    role_id: PLANNER_ROLE_ID,
    role_version: PLANNER_ROLE_VERSION,
    operation: "propose_plan",
    decision_scope: {
      scope_type: roleScopeTypeFor(request.context),
      scope_id: identity.scopeId,
      objective: request.goal,
      constraints: constraintsFor(request.context),
    },
    input_artifacts: [requestRef],
    context_bundle_refs: [contextRef],
    policy_decision_refs: [],
    budget: {
      max_output_tokens: 4000,
    },
    model_tier_policy: {
      allowed_tiers: ["standard", "frontier"],
      preferred_tier: "frontier",
      fallback_allowed: true,
    },
    timeout_ms: DEFAULT_TIMEOUT_MS,
    allowed_engines: [],
    allowed_tools: [],
    expected_output_artifacts: [
      {
        artifact_type: "PlanProposal",
        schema_version: PLAN_PROPOSAL_SCHEMA_VERSION,
        required: true,
        relation: "produces",
      },
    ],
    trace: {
      destination: {
        ref_type: "file",
        id: `roles/runs/${identity.invocationId}.jsonl`,
        relation: "produces",
      },
      trace_id: `trace:${identity.invocationId}`,
    },
  };

  return {
    artifact_id: artifactIdFor("RoleInvocation", createdAtIso, payload),
    artifact_type: "RoleInvocation",
    schema_version: ROLE_INVOCATION_SCHEMA_VERSION,
    protocol_version: PROTOCOL_VERSION,
    producer: {
      primitive: "adapter",
      name: "daimyo.roles-planning",
      invocation_id: identity.invocationId,
    },
    created_at: createdAtIso,
    source_refs: [requestRef, contextRef],
    output_refs: [],
    ownership: {
      owns_files: [],
      owns_interfaces: ["interface:roles-planning"],
      owns_data: [],
      owns_workflow_steps: ["workflow:planning"],
    },
    confidence: {
      score: 1,
      level: "high",
      reason_codes: ["adapter:roles_planning_invocation"],
    },
    review_required: {
      required: false,
      reason_codes: [],
    },
    diagnostics: {
      status: "produced",
      warnings: [],
      errors: [],
      missing_context: [],
    },
    payload,
  };
}

function plannedTaskFor(task: ProposedPlanTask): PlannedTask {
  return {
    title: task.title,
    body: task.body,
    acceptanceCriteria: [...task.acceptance_criteria],
    ...metadataProperty(task),
  };
}

function metadataProperty(task: ProposedPlanTask): { readonly metadata?: JsonObject } {
  const metadata: JsonObject = { ...(task.metadata ?? {}) };
  const planProposal: JsonObject = {};
  if (task.task_ref !== undefined) {
    planProposal.task_ref = task.task_ref;
  }
  if (task.depends_on !== undefined) {
    planProposal.depends_on = [...task.depends_on];
  }
  if (task.ordering !== undefined) {
    planProposal.ordering = orderingMetadata(task.ordering);
  }

  if (Object.keys(planProposal).length > 0) {
    const key = metadata.plan_proposal === undefined ? "plan_proposal" : "protocol_plan_proposal";
    metadata[key] = planProposal;
  }

  return Object.keys(metadata).length === 0 ? {} : { metadata };
}

function orderingMetadata(ordering: NonNullable<ProposedPlanTask["ordering"]>): JsonObject {
  return {
    ...(ordering.after === undefined ? {} : { after: [...ordering.after] }),
    ...(ordering.before === undefined ? {} : { before: [...ordering.before] }),
    ...(ordering.priority === undefined ? {} : { priority: ordering.priority }),
  };
}

function reviewDecisionsFor(
  goal: string,
  identity: PlanningIdentity,
  policy: PlanningPolicyContext,
): readonly DecisionRequest[] {
  if (!policy.humanReviewRequired) return [];
  return [reviewDecisionFor(goal, identity, policy)];
}

function reviewDecisionFor(
  goal: string,
  identity: PlanningIdentity,
  policy: PlanningPolicyContext,
): DecisionRequest {
  return {
    decision_id: `${identity.invocationId}:review`,
    node_id: identity.nodeId,
    task_id: identity.taskId,
    surface: "routing",
    prompt: `Planner Role requested human review for: ${goal}`,
    options: ["proceed", "request-human-review"],
    context: autonomyContext({}, policy),
  };
}

function decisionWithAutonomyContext(
  request: DecisionRequestPayload,
  policy: PlanningPolicyContext,
): DecisionRequest {
  const context = autonomyContext(request.context ?? {}, policy);
  if (request.surface === "permission") {
    return {
      decision_id: request.decision_id,
      node_id: request.node_id,
      task_id: request.task_id,
      surface: request.surface,
      prompt: request.prompt,
      tool_name: request.tool_name,
      arguments: request.arguments,
      context,
    };
  }

  return {
    decision_id: request.decision_id,
    node_id: request.node_id,
    task_id: request.task_id,
    surface: request.surface,
    prompt: request.prompt,
    ...(request.options === undefined ? {} : { options: [...request.options] }),
    context,
  };
}

function autonomyContext(
  source: JsonObject,
  policy: PlanningPolicyContext,
): JsonObject {
  const context: JsonObject = { ...source };
  const sourceDomain = context.domain;
  if (typeof sourceDomain === "string" && sourceDomain !== policy.domain) {
    context.role_output_domain = sourceDomain;
  }
  context.domain = policy.domain;
  context.scope = policy.decisionScope;
  context.role_scope_type = policy.roleScopeType;
  context.human_review_required = policy.humanReviewRequired;
  context.confidence = policy.confidence;
  context.declared_risk = policy.declaredRisk;
  context.risk = policy.declaredRisk;
  context.role_id = PLANNER_ROLE_ID;
  context.role_version = PLANNER_ROLE_VERSION;
  if (policy.reasonCodes.length > 0) {
    context.review_reason_codes = [...policy.reasonCodes];
  }
  return context;
}

function policyContextFor(
  request: PlanningRequest,
  invocation: RoleInvocation,
  confidence: Confidence,
  humanReviewRequired: boolean,
  reasonCodes: readonly string[],
): PlanningPolicyContext {
  return {
    domain: plannerRoleDefinition.autonomy.domain,
    decisionScope: decisionScopeFor(request.context, invocation.payload.decision_scope.scope_type),
    roleScopeType: invocation.payload.decision_scope.scope_type,
    confidence: score0To10(confidence.score),
    declaredRisk: declaredRiskFor(request.context, humanReviewRequired),
    humanReviewRequired,
    reasonCodes,
  };
}

function declaredRiskFor(
  context: JsonObject | undefined,
  humanReviewRequired: boolean,
): number {
  const explicitRisk = readScore(context, "declared_risk") ?? readScore(context, "risk");
  if (explicitRisk !== undefined) return explicitRisk;
  return humanReviewRequired ? 5 : 2;
}

function score0To10(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(10, Math.round(score * 10)));
}

function decisionScopeFor(
  context: JsonObject | undefined,
  roleScopeType: RoleDecisionScope["scope_type"],
): DecisionScope {
  const explicitScope = readDecisionScope(context, "scope") ?? readDecisionScope(context, "decision_scope");
  if (explicitScope !== undefined) return explicitScope;

  switch (roleScopeType) {
    case "patch":
      return "local";
    case "task":
    case "decision":
    case "review":
      return "moderate";
    case "initiative":
    case "artifact":
    case "workflow":
      return "major";
  }
}

function roleScopeTypeFor(context: JsonObject | undefined): RoleDecisionScope["scope_type"] {
  const value = context?.role_scope_type;
  if (isRoleScopeType(value)) return value;
  return "task";
}

function constraintsFor(context: JsonObject | undefined): string[] {
  const value = context?.constraints;
  if (!Array.isArray(value)) return [];
  return value.filter(isString);
}

function identityFor(request: PlanningRequest): PlanningIdentity {
  const digest = digestFor({ goal: request.goal, context: request.context ?? {} });
  const scopeId = readString(request.context, "scope_id") ?? `planning:${digest}`;
  return {
    invocationId: readString(request.context, "invocation_id") ?? `planner:${digest}`,
    scopeId,
    taskId: readString(request.context, "task_id") ?? `task:${scopeId}`,
    nodeId: readString(request.context, "node_id") ?? `node:${scopeId}`,
  };
}

function planningRequestReference(scopeId: string): ArtifactReference {
  return {
    ref_type: "artifact",
    id: scopeId,
    artifact_type: "PlanningRequest",
    schema_version: "1.0.0",
    protocol_version: PROTOCOL_VERSION,
    relation: "read",
  };
}

function planningContextReference(scopeId: string): ArtifactReference {
  return {
    ref_type: "artifact",
    id: `context:${scopeId}`,
    artifact_type: "ContextBundle",
    schema_version: "1.0.0",
    protocol_version: PROTOCOL_VERSION,
    relation: "read",
  };
}

function readString(context: JsonObject | undefined, key: string): string | undefined {
  const value = context?.[key];
  if (typeof value === "string" && value.length > 0) return value;
  return undefined;
}

function readDecisionScope(context: JsonObject | undefined, key: string): DecisionScope | undefined {
  const value = context?.[key];
  if (value === "local" || value === "moderate" || value === "major") return value;
  return undefined;
}

function readScore(context: JsonObject | undefined, key: string): number | undefined {
  const value = context?.[key];
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 10) {
    return value;
  }
  return undefined;
}

function isRoleScopeType(value: JsonValue | undefined): value is RoleDecisionScope["scope_type"] {
  return (
    value === "task" ||
    value === "initiative" ||
    value === "artifact" ||
    value === "patch" ||
    value === "review" ||
    value === "decision" ||
    value === "workflow"
  );
}

function isString(value: JsonValue): value is string {
  return typeof value === "string";
}

function digestFor(value: JsonObject): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function artifactIdFor(artifactType: string, createdAt: string, payload: object): string {
  const digest = createHash("sha256")
    .update(JSON.stringify({ artifact_type: artifactType, created_at: createdAt, payload }))
    .digest("hex");
  return `artifact:sha256:${digest}`;
}
