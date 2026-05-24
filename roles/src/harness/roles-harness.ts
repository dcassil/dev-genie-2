import type {
  ArtifactEnvelope,
  ArtifactReference,
  JsonObject,
  JsonValue,
  OwnershipSurface,
  RoleInvocation,
  RoleResult,
} from "protocol";

import {
  ARCHITECT_ROLE_ID,
  ARCHITECT_ROLE_VERSION,
} from "../prompts/architect-role.js";
import {
  PLANNER_ROLE_ID,
  PLANNER_ROLE_VERSION,
} from "../prompts/planner-role.js";
import {
  QUALITY_GOVERNOR_ROLE_ID,
  QUALITY_GOVERNOR_ROLE_VERSION,
} from "../prompts/quality-governor-role.js";
import { RoleRegistry } from "../registry/role-registry.js";
import { architectRoleDefinition } from "../roles/architect.js";
import { plannerRoleDefinition } from "../roles/planner.js";
import { qualityGovernorRoleDefinition } from "../roles/quality-governor.js";
import { artifactIdFor, artifactReferenceJson } from "../runner/artifacts.js";
import type { RoleContext, RoleDefinition } from "../runner/role-definition.js";
import { RoleRunner } from "../runner/role-runner.js";
import type {
  StructuredModelCaller,
  StructuredModelRequest,
} from "../runner/structured-model.js";
import {
  isRoleInvocation,
  isRoleResult,
  roleInvocationValidationErrors,
  roleResultValidationErrors,
  validatorFor,
} from "../schemas/protocol-schemas.js";

const ROLE_INVOCATION_SCHEMA_VERSION = "1.0.0";
const PROTOCOL_VERSION = "1.2.0";
const HARNESS_CREATED_AT = "2026-05-24T00:40:00.000Z";

export type V1RoleHarnessArtifact = JsonObject;

export interface RolesHarnessCase {
  readonly case_name: string;
  readonly definition: RoleDefinition;
  readonly invocation: RoleInvocation;
  readonly roleContext: RoleContext;
  readonly modelArtifact: V1RoleHarnessArtifact;
}

export interface RolesHarnessFlow {
  readonly case_name: string;
  readonly invocation: RoleInvocation;
  readonly roleResult: RoleResult;
  readonly producedArtifact: ArtifactEnvelope;
}

export interface RolesHarnessOptions {
  readonly modelClient?: StructuredModelCaller;
  readonly registry?: RoleRegistry;
  readonly cases?: readonly RolesHarnessCase[];
  readonly now?: () => Date;
}

export interface RolesHarnessResult {
  readonly flows: readonly RolesHarnessFlow[];
}

export class DeterministicRolesHarnessModelClient implements StructuredModelCaller {
  readonly outputNames: string[] = [];

  constructor(private readonly responsesByOutputName: ReadonlyMap<string, JsonValue>) {}

  static forCases(cases: readonly RolesHarnessCase[]): DeterministicRolesHarnessModelClient {
    return new DeterministicRolesHarnessModelClient(
      new Map(cases.map((harnessCase) => [harnessCase.definition.output.name, harnessCase.modelArtifact])),
    );
  }

  async call<T>(request: StructuredModelRequest<T>): Promise<T> {
    this.outputNames.push(request.output.name);
    const response = this.responsesByOutputName.get(request.output.name);
    if (response === undefined) {
      throw new Error(`No deterministic Roles harness response for ${request.output.name}`);
    }
    return request.output.parse(response);
  }
}

export async function runRolesHarness(
  options: RolesHarnessOptions = {},
): Promise<RolesHarnessResult> {
  const cases = options.cases ?? createRegisteredV1RoleHarnessCases();
  const registry = options.registry ?? createV1RoleRegistry();
  const modelClient = options.modelClient ?? DeterministicRolesHarnessModelClient.forCases(cases);
  const now = options.now ?? (() => new Date(HARNESS_CREATED_AT));
  const producedArtifacts: ArtifactEnvelope[] = [];
  const runner = new RoleRunner({
    registry,
    modelClient,
    now,
    artifactSink: (artifact) => {
      producedArtifacts.push(artifact);
    },
  });

  const flows: RolesHarnessFlow[] = [];
  for (const harnessCase of cases) {
    assertValidInvocation(harnessCase.invocation, harnessCase.case_name);
    const artifactStart = producedArtifacts.length;
    const roleResult = await runner.run(harnessCase.invocation, harnessCase.roleContext);
    assertValidRoleResult(roleResult, harnessCase.case_name);
    if (roleResult.payload.status !== "produced") {
      throw new Error(
        `${harnessCase.case_name} expected status=produced but got ${roleResult.payload.status}`,
      );
    }

    const producedArtifact = producedArtifacts[artifactStart];
    if (producedArtifact === undefined) {
      throw new Error(`${harnessCase.case_name} did not emit a produced artifact`);
    }
    assertProducedArtifact(harnessCase, roleResult, producedArtifact);
    flows.push({
      case_name: harnessCase.case_name,
      invocation: harnessCase.invocation,
      roleResult,
      producedArtifact,
    });
  }

  return { flows };
}

export async function runRoleHarnessCase(
  harnessCase: RolesHarnessCase,
  options: Pick<RolesHarnessOptions, "modelClient" | "registry" | "now"> = {},
): Promise<RolesHarnessFlow> {
  const result = await runRolesHarness({
    cases: [harnessCase],
    registry: options.registry ?? new RoleRegistry().register(harnessCase.definition),
    ...(options.modelClient === undefined ? {} : { modelClient: options.modelClient }),
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  const flow = result.flows[0];
  if (flow === undefined) {
    throw new Error(`${harnessCase.case_name} did not produce a harness flow`);
  }
  return flow;
}

export function createV1RoleRegistry(): RoleRegistry {
  return new RoleRegistry()
    .register(architectRoleDefinition)
    .register(plannerRoleDefinition)
    .register(qualityGovernorRoleDefinition);
}

export function createRegisteredV1RoleHarnessCases(): readonly RolesHarnessCase[] {
  return [
    {
      case_name: "architect-architecture-impact",
      definition: architectRoleDefinition,
      invocation: createHarnessRoleInvocation({
        invocationId: "roles-harness-architect-001",
        roleId: ARCHITECT_ROLE_ID,
        roleVersion: ARCHITECT_ROLE_VERSION,
        operation: "assess_architecture_impact",
        scopeType: "task",
        scopeId: "DGOS-T-0036",
        objective: "Assess the architecture impact of the generalized Roles e2e harness.",
        constraints: ["roles:shared_runner", "roles:schema_valid_artifact"],
        inputArtifact: artifactReference(
          "task:DGOS-T-0036",
          "Task",
          "read",
        ),
        contextBundleId: "context:roles-harness-architect",
        expectedArtifactType: "ArchitectureImpact",
      }),
      roleContext: {
        story: {
          title: "End-to-end Roles harness",
          body: "Prove the v1 Architect Role through the shared registry-resolved runner.",
        },
        context: {
          package: "roles",
          runner: "RoleRunner",
          registry: "RoleRegistry",
        },
      },
      modelArtifact: architectureImpactArtifact("roles-harness-architect-001"),
    },
    {
      case_name: "planner-plan-proposal",
      definition: plannerRoleDefinition,
      invocation: createHarnessRoleInvocation({
        invocationId: "roles-harness-planner-001",
        roleId: PLANNER_ROLE_ID,
        roleVersion: PLANNER_ROLE_VERSION,
        operation: "propose_plan",
        scopeType: "initiative",
        scopeId: "DGOS-I-0010",
        objective: "Plan the final evidence steps for closing Role Contracts & Autonomy.",
        constraints: ["roles:deterministic_harness", "roles:no_runner_edits"],
        inputArtifact: artifactReference(
          "initiative:DGOS-I-0010",
          "Initiative",
          "read",
        ),
        contextBundleId: "context:roles-harness-planner",
        expectedArtifactType: "PlanProposal",
      }),
      roleContext: {
        context: {
          initiative: {
            id: "DGOS-I-0010",
            title: "Role Contracts & Autonomy",
          },
          goal: {
            objective: "Close the Roles layer capstone with deterministic proof.",
          },
        },
      },
      modelArtifact: planProposalArtifact("roles-harness-planner-001"),
    },
    {
      case_name: "quality-governor-review-judgment",
      definition: qualityGovernorRoleDefinition,
      invocation: createHarnessRoleInvocation({
        invocationId: "roles-harness-quality-governor-001",
        roleId: QUALITY_GOVERNOR_ROLE_ID,
        roleVersion: QUALITY_GOVERNOR_ROLE_VERSION,
        operation: "review_artifact",
        scopeType: "review",
        scopeId: "review:roles-harness-proof",
        objective: "Review whether the Roles harness evidence is sufficient to close the initiative.",
        constraints: ["roles:human_review_signal", "roles:consumable_autonomy_signal"],
        inputArtifact: artifactReference(
          "artifact:sha256:2222222222222222222222222222222222222222222222222222222222222222",
          "PlanProposal",
          "validates",
        ),
        contextBundleId: "context:roles-harness-quality-governor",
        expectedArtifactType: "ReviewJudgment",
      }),
      roleContext: {
        context: {
          target_artifact: {
            artifact_type: "PlanProposal",
            artifact_id: "artifact:sha256:2222222222222222222222222222222222222222222222222222222222222222",
          },
          acceptance_criteria: [
            "The harness validates RoleResult envelopes.",
            "The produced artifact validates against its protocol schema.",
          ],
          review_context: {
            evidence: "deterministic fake StructuredModelCaller",
          },
        },
      },
      modelArtifact: reviewJudgmentArtifact("roles-harness-quality-governor-001"),
    },
  ];
}

function createHarnessRoleInvocation(args: {
  readonly invocationId: string;
  readonly roleId: string;
  readonly roleVersion: string;
  readonly operation: string;
  readonly scopeType: RoleInvocation["payload"]["decision_scope"]["scope_type"];
  readonly scopeId: string;
  readonly objective: string;
  readonly constraints: readonly string[];
  readonly inputArtifact: ArtifactReference;
  readonly contextBundleId: string;
  readonly expectedArtifactType: string;
}): RoleInvocation {
  const inputArtifacts: [ArtifactReference, ...ArtifactReference[]] = [args.inputArtifact];
  const contextBundleRefs: [ArtifactReference, ...ArtifactReference[]] = [
    artifactReference(args.contextBundleId, "ContextBundle", "read"),
  ];
  const payload: RoleInvocation["payload"] = {
    invocation_id: args.invocationId,
    role_id: args.roleId,
    role_version: args.roleVersion,
    operation: args.operation,
    decision_scope: {
      scope_type: args.scopeType,
      scope_id: args.scopeId,
      objective: args.objective,
      constraints: [...args.constraints],
    },
    input_artifacts: inputArtifacts,
    context_bundle_refs: contextBundleRefs,
    policy_decision_refs: [],
    budget: {
      max_input_tokens: 8000,
      max_output_tokens: 4000,
    },
    model_tier_policy: {
      allowed_tiers: ["standard", "frontier"],
      preferred_tier: "frontier",
      fallback_allowed: true,
    },
    timeout_ms: 60000,
    allowed_engines: [],
    allowed_tools: [],
    expected_output_artifacts: [
      {
        artifact_type: args.expectedArtifactType,
        schema_version: "1.0.0",
        required: true,
        relation: "produces",
      },
    ],
    trace: {
      destination: {
        ref_type: "file",
        id: `roles/evidence/harness/${args.invocationId}.jsonl`,
        relation: "produces",
      },
      trace_id: `trace-${args.invocationId}`,
    },
  };
  return {
    artifact_id: artifactIdFor("RoleInvocation", HARNESS_CREATED_AT, payload),
    artifact_type: "RoleInvocation",
    schema_version: ROLE_INVOCATION_SCHEMA_VERSION,
    protocol_version: PROTOCOL_VERSION,
    producer: {
      primitive: "loop",
      name: "roles-harness",
      invocation_id: args.invocationId,
    },
    created_at: HARNESS_CREATED_AT,
    source_refs: inputArtifacts,
    output_refs: [],
    ownership: emptyOwnership(),
    confidence: {
      score: 1,
      level: "high",
      reason_codes: ["roles:harness_fixture"],
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

function architectureImpactArtifact(invocationId: string): JsonObject {
  const payload: JsonObject = {
    summary: {
      impact_level: "medium",
      primary_change: "add_new_surface",
      affected_primitive: "role",
      reason_codes: ["roles:e2e_harness"],
    },
    affected_surfaces: ownershipJson(["file:roles/src/harness/roles-harness.ts"]),
    owned_surfaces: ownershipJson(),
    proposed_changes: [
      {
        change_id: "add_roles_harness",
        change_type: "add",
        component: {
          name: "RolesHarness",
          kind: "test",
        },
        target_surfaces: ownershipJson(),
        rationale_codes: ["roles:registry_resolved_runner"],
      },
    ],
    risks: [
      {
        risk_id: "fake_live_confusion",
        category: "validation",
        severity: "low",
        affected_surfaces: ownershipJson(["file:roles/ROLES-PROOF.md"]),
        mitigation_codes: ["proof:separate_deterministic_from_live"],
      },
    ],
    tradeoffs: [
      {
        tradeoff_id: "deterministic_client",
        chosen_option: "fake StructuredModelCaller for repeatable contract coverage",
        rejected_options: ["live-only proof"],
        reason_codes: ["proof:repeatable_schema_gate"],
      },
    ],
    decisions: [
      {
        decision_id: "shared_runner_path",
        status: "accepted",
        decision: "Drive registered v1 Roles through one RoleRunner and RoleRegistry.",
        applies_to_surfaces: ownershipJson(),
        reason_codes: ["adr:role_invocation_convention"],
      },
    ],
    assumptions: [
      {
        assumption_id: "schemas_source_of_truth",
        subject: "Protocol schemas remain the source of truth for produced Role artifacts.",
        confidence: "high",
        validation_needed: false,
      },
    ],
  };
  return artifactEnvelope("ArchitectureImpact", invocationId, payload, {
    confidence: {
      score: 0.91,
      level: "high",
      reason_codes: ["roles:deterministic_fixture"],
    },
    reviewRequired: {
      required: false,
      reason_codes: [],
    },
    diagnosticsMissingContext: [],
    ownership: ownershipJson(),
  });
}

function planProposalArtifact(invocationId: string): JsonObject {
  const confidence: JsonObject = {
    score: 0.86,
    level: "high",
    reason_codes: ["planner:bounded_context"],
  };
  const reviewRequired: JsonObject = {
    required: false,
    reason_codes: [],
  };
  const payload: JsonObject = {
    planning_goal: "Plan the final evidence steps for closing Role Contracts & Autonomy.",
    tasks: [
      {
        task_ref: "roles-proof",
        title: "Capture Roles proof evidence",
        body: "Record deterministic v1 Role coverage and the live dogfood preflight result.",
        acceptance_criteria: [
          "ROLES-PROOF separates deterministic coverage from live coverage.",
          "The harness covers all registered v1 Roles through the shared runner.",
        ],
        depends_on: [],
        ordering: {
          priority: 0,
        },
        metadata: {
          package: "roles",
          artifact_type: "PlanProposal",
        },
      },
    ],
    decision_requests: [],
    confidence,
    missing_context: [],
    review_required: reviewRequired,
    reason_codes: ["planner:evidence_plan"],
  };
  return artifactEnvelope("PlanProposal", invocationId, payload, {
    confidence,
    reviewRequired,
    diagnosticsMissingContext: [],
    ownership: ownershipJson(["interface:roles-planning"]),
  });
}

function reviewJudgmentArtifact(invocationId: string): JsonObject {
  const missingContext = [
    {
      code: "context:live_model_evidence_not_available",
      ref_type: "config" as const,
      id: "ROLES_LIVE_SDK_TESTS",
    },
  ];
  const reviewSubjectRef = artifactReference(
    "artifact:sha256:2222222222222222222222222222222222222222222222222222222222222222",
    "PlanProposal",
    "validates",
  );
  const reviewSubject = artifactReferenceJson(reviewSubjectRef);
  const confidence: JsonObject = {
    score: 0.64,
    level: "medium",
    reason_codes: ["review:deterministic_only"],
  };
  const reviewRequired: JsonObject = {
    required: true,
    reason_codes: ["review:live_evidence_missing"],
  };
  const payload: JsonObject = {
    review_subject: reviewSubject,
    verdict: "needs_human",
    criteria: [
      {
        criterion_id: "live_evidence",
        criterion: "Live model success must not be claimed unless a live artifact exists.",
        status: "needs_human",
        findings: [
          "Deterministic contract coverage is sufficient for schema proof but not for a live-success claim.",
        ],
        blocking_reason_codes: ["context:live_model_evidence_not_available"],
        evidence_refs: [reviewSubject],
        confidence: {
          score: 0.64,
          level: "medium",
          reason_codes: ["review:deterministic_only"],
        },
      },
    ],
    completion_decision: {
      can_mark_complete: false,
      authority: "parent_authoritative",
      blocking_reason_codes: ["context:live_model_evidence_not_available"],
    },
    blocking_reason_codes: ["context:live_model_evidence_not_available"],
    confidence,
    missing_context: missingContext,
    review_required: reviewRequired,
    human_review_required: true,
    reason_codes: ["review:needs_human"],
  };
  return artifactEnvelope("ReviewJudgment", invocationId, payload, {
    confidence,
    reviewRequired,
    diagnosticsMissingContext: missingContext,
    ownership: ownershipJson(["interface:quality-governor-review"]),
  });
}

function artifactEnvelope<TArtifactType extends "ArchitectureImpact" | "PlanProposal" | "ReviewJudgment">(
  artifactType: TArtifactType,
  invocationId: string,
  payload: JsonObject,
  options: {
    readonly confidence: JsonObject;
    readonly reviewRequired: JsonObject;
    readonly diagnosticsMissingContext: readonly JsonObject[];
    readonly ownership: JsonObject;
  },
): JsonObject {
  return {
    artifact_id: artifactIdFor(artifactType, HARNESS_CREATED_AT, payload),
    artifact_type: artifactType,
    schema_version: "1.0.0",
    protocol_version: PROTOCOL_VERSION,
    producer: {
      primitive: "role",
      name: "roles-harness-model-fixture",
      invocation_id: invocationId,
    },
    created_at: HARNESS_CREATED_AT,
    source_refs: [
      artifactReferenceJson(artifactReference(`invocation:${invocationId}`, "RoleInvocation", "derived_from")),
    ],
    output_refs: [],
    ownership: options.ownership,
    confidence: options.confidence,
    review_required: options.reviewRequired,
    diagnostics: {
      status: "produced",
      warnings: [],
      errors: [],
      missing_context: [...options.diagnosticsMissingContext],
    },
    payload,
  };
}

function artifactReference(
  id: string,
  artifactType: string,
  relation: ArtifactReference["relation"],
): ArtifactReference {
  return {
    ref_type: "artifact",
    id,
    artifact_type: artifactType,
    schema_version: "1.0.0",
    protocol_version: PROTOCOL_VERSION,
    ...(relation === undefined ? {} : { relation }),
  };
}

function ownershipJson(dependsOn: readonly string[] = []): JsonObject {
  return {
    owns_files: ["roles/src/harness/roles-harness.ts"],
    owns_interfaces: ["interface:role-runner"],
    owns_data: [],
    owns_workflow_steps: ["workflow:roles-e2e-harness"],
    ...(dependsOn.length === 0 ? {} : { depends_on: [...dependsOn] }),
  };
}

function emptyOwnership(): OwnershipSurface {
  return {
    owns_files: [],
    owns_interfaces: [],
    owns_data: [],
    owns_workflow_steps: [],
  };
}

function assertValidInvocation(invocation: RoleInvocation, caseName: string): void {
  if (!isRoleInvocation(invocation)) {
    throw new Error(
      `${caseName} RoleInvocation failed protocol schema validation: ${roleInvocationValidationErrors().join("; ")}`,
    );
  }
}

function assertValidRoleResult(result: RoleResult, caseName: string): void {
  if (!isRoleResult(result)) {
    throw new Error(
      `${caseName} RoleResult failed protocol schema validation: ${roleResultValidationErrors().join("; ")}`,
    );
  }
}

function assertProducedArtifact(
  harnessCase: RolesHarnessCase,
  roleResult: RoleResult,
  producedArtifact: ArtifactEnvelope,
): void {
  const expectedType = harnessCase.definition.expected_output_artifact_type;
  const outputReference = roleResult.payload.output_artifacts[0];
  if (outputReference?.artifact_type !== expectedType) {
    throw new Error(`${harnessCase.case_name} did not reference a ${expectedType} output artifact`);
  }
  if (outputReference.id !== producedArtifact.artifact_id) {
    throw new Error(`${harnessCase.case_name} RoleResult output ref does not match the artifact sink`);
  }
  const validate = validatorFor(expectedType);
  if (!validate(producedArtifact)) {
    const errors = (validate.errors ?? []).map((error) => error.message ?? "schema error");
    throw new Error(`${harnessCase.case_name} produced invalid ${expectedType}: ${errors.join("; ")}`);
  }
}
