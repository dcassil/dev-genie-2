import type {
  ArtifactEnvelope,
  DecisionRequestPayload,
  DecisionVerdict,
  JsonObject,
  JsonValue,
  RoleInvocation,
  RoleResult,
} from "protocol";
import { describe, expect, it } from "vitest";

import {
  DeterministicRolesHarnessModelClient,
  RoleRunner,
  createRegisteredV1RoleHarnessCases,
  createV1RoleRegistry,
  isRoleResult,
  runRolesHarness,
  type RoleDefinition,
  type RolesHarnessFlow,
  type StructuredModelCaller,
  type StructuredModelRequest,
  type StructuredModelSchema,
  validatorFor,
} from "../src/index.js";
import { artifactIdFor, invocationReference } from "../src/runner/artifacts.js";
import { evaluateAutonomyThreshold, type AutonomyProfile } from "daimyo";

const DESIGNER_ROLE_ID = "dev-genie.designer-role";
const DESIGNER_ROLE_VERSION = "1.0.0";

class QueueStructuredModelClient implements StructuredModelCaller {
  readonly outputNames: string[] = [];

  constructor(private readonly responses: readonly JsonValue[]) {}

  async call<T>(request: StructuredModelRequest<T>): Promise<T> {
    this.outputNames.push(request.output.name);
    const response = this.responses[this.outputNames.length - 1];
    if (response === undefined) {
      throw new Error(`No queued response for ${request.output.name}`);
    }
    return request.output.parse(response);
  }
}

describe("roles harness", () => {
  it("runs all registered v1 Roles end-to-end through the shared RoleRunner and protocol schemas", async () => {
    const cases = createRegisteredV1RoleHarnessCases();
    const client = DeterministicRolesHarnessModelClient.forCases(cases);

    const result = await runRolesHarness({
      cases,
      registry: createV1RoleRegistry(),
      modelClient: client,
    });

    expect(result.flows).toHaveLength(3);
    expect(client.outputNames).toEqual([
      "dev-genie.architecture-impact.v1",
      "dev-genie.plan-proposal.v1",
      "dev-genie.review-judgment.v1",
    ]);

    expectFlow(result.flows, "architect-architecture-impact", "ArchitectureImpact");
    expectFlow(result.flows, "planner-plan-proposal", "PlanProposal");
    const qualityFlow = expectFlow(
      result.flows,
      "quality-governor-review-judgment",
      "ReviewJudgment",
    );
    expect(qualityFlow.roleResult.payload.human_review_required).toBe(true);
    expect(qualityFlow.roleResult.review_required.required).toBe(true);
  });

  it("feeds RoleResult autonomy signals into daimyo's autonomy threshold policy", async () => {
    const result = await runRolesHarness();
    const reviewFlow = flowByCase(result.flows, "quality-governor-review-judgment");
    const plannerFlow = flowByCase(result.flows, "planner-plan-proposal");

    const delegated: AutonomyProfile = {
      engineering: "delegate",
      product: "delegate",
      design: "delegate",
    };
    const alwaysInLoop: AutonomyProfile = {
      engineering: "always_in_loop",
      product: "always_in_loop",
      design: "always_in_loop",
    };

    const reviewEscalation = evaluateAutonomyThreshold(
      decisionRequestForRoleResult(reviewFlow.roleResult, "moderate"),
      humanVerdictFromRoleResult(reviewFlow.roleResult),
      delegated,
    );
    const delegatedProceed = evaluateAutonomyThreshold(
      decisionRequestForRoleResult(plannerFlow.roleResult, "local"),
      proceedVerdictFromRoleResult(plannerFlow.roleResult),
      delegated,
    );
    const humanLoopEscalation = evaluateAutonomyThreshold(
      decisionRequestForRoleResult(plannerFlow.roleResult, "moderate"),
      proceedVerdictFromRoleResult(plannerFlow.roleResult),
      alwaysInLoop,
    );

    expect(reviewEscalation).toMatchObject({
      action: "escalate",
      reason: "verdict requested human review",
    });
    expect(delegatedProceed.action).toBe("proceed");
    expect(humanLoopEscalation.action).toBe("escalate");
  });
});

describe("registry extension proof", () => {
  it("registers and runs a deferred Designer Role without changing RoleRunner, registry, or assembler code", async () => {
    const client = new QueueStructuredModelClient([extensionDesignBriefArtifact()]);
    const registry = createV1RoleRegistry().register(extensionDesignerRoleDefinition());
    const runner = new RoleRunner({
      registry,
      modelClient: client,
      now: () => new Date("2026-05-24T00:45:00.000Z"),
    });

    const produced = await runner.run(extensionInvocation(), {
      context: {
        requested_surface: "roles proof page",
      },
    });
    const skipped = await runner.run(
      extensionInvocation({
        expected_output_artifacts: [
          {
            artifact_type: "ArchitectureImpact",
            schema_version: "1.0.0",
            required: true,
            relation: "produces",
          },
        ],
      }),
      {},
    );
    const needsHuman = await runner.run(
      extensionInvocation({
        model_tier_policy: {
          allowed_tiers: ["human"],
          preferred_tier: "human",
          fallback_allowed: false,
        },
      }),
      {},
    );

    expect(produced.payload.status).toBe("produced");
    expect(produced.producer.name).toBe(DESIGNER_ROLE_ID);
    expect(produced.payload.output_artifacts[0]).toMatchObject({
      artifact_type: "DesignBrief",
      schema_version: "0.0.0-test",
    });
    expect(isRoleResult(produced)).toBe(true);
    expect(skipped.payload.status).toBe("skipped");
    expect(skipped.payload.skip_reason?.code).toBe("role:no_required_design_brief");
    expect(needsHuman.payload.status).toBe("needs_human");
    expect(needsHuman.payload.human_review_required).toBe(true);
    expect(client.outputNames).toEqual(["dev-genie.design-brief.stub"]);
  });
});

function expectFlow(
  flows: readonly RolesHarnessFlow[],
  caseName: string,
  artifactType: string,
): RolesHarnessFlow {
  const flow = flowByCase(flows, caseName);
  expect(flow.roleResult.artifact_type).toBe("RoleResult");
  expect(isRoleResult(flow.roleResult)).toBe(true);
  expect(flow.roleResult.payload.status).toBe("produced");
  expect(flow.roleResult.payload.output_artifacts[0]?.artifact_type).toBe(artifactType);
  expect(flow.producedArtifact.artifact_type).toBe(artifactType);
  expect(validatorFor(artifactType)(flow.producedArtifact)).toBe(true);
  return flow;
}

function flowByCase<TFlow extends { readonly case_name: string }>(
  flows: readonly TFlow[],
  caseName: string,
): TFlow {
  const flow = flows.find((candidate) => candidate.case_name === caseName);
  if (flow === undefined) {
    throw new Error(`Missing harness flow ${caseName}`);
  }
  return flow;
}

function decisionRequestForRoleResult(
  roleResult: RoleResult,
  decisionScope: "local" | "moderate",
): DecisionRequestPayload {
  return {
    decision_id: `${roleResult.artifact_id}:autonomy`,
    node_id: "node:roles-harness",
    task_id: "DGOS-T-0036",
    surface: "routing",
    prompt: `Route ${roleResult.artifact_type} autonomy signal.`,
    context: {
      domain: "engineering",
      decision_scope: decisionScope,
      role_result_status: roleResult.diagnostics.status,
      human_review_required: roleResult.review_required.required,
    },
    options: ["proceed", "escalate"],
  };
}

function humanVerdictFromRoleResult(_roleResult: RoleResult): DecisionVerdict {
  return {
    type: "human",
    suggested_choice: "escalate",
    suggested_response: "Human review is required by the RoleResult.",
    confidence: 6,
    risk: 7,
    block_trigger: true,
  };
}

function proceedVerdictFromRoleResult(_roleResult: RoleResult): DecisionVerdict {
  return {
    type: "decision",
    suggested_choice: "proceed",
    suggested_response: "RoleResult does not require human review.",
    confidence: 8,
    risk: 3,
    block_trigger: false,
  };
}

function extensionDesignerRoleDefinition(): RoleDefinition {
  return {
    role_id: DESIGNER_ROLE_ID,
    role_version: DESIGNER_ROLE_VERSION,
    prompt: {
      id: DESIGNER_ROLE_ID,
      version: DESIGNER_ROLE_VERSION,
      ref: `${DESIGNER_ROLE_ID}@${DESIGNER_ROLE_VERSION}`,
      text: "Return one DesignBrief stub artifact for the registry extension proof.",
    },
    supported_operations: ["draft_design_brief"],
    expected_output_artifact_type: "DesignBrief",
    expected_output_schema_version: "0.0.0-test",
    output: extensionDesignBriefStructuredSchema,
    validate_output: isExtensionDesignBrief,
    validation_errors: () => [],
    normalize: ({ modelArtifact, invocation, createdAt, definition }) => {
      const artifactId = artifactIdFor("DesignBrief", createdAt, modelArtifact.payload);
      return {
        ...modelArtifact,
        artifact_id: artifactId,
        artifact_type: definition.expected_output_artifact_type,
        schema_version: definition.expected_output_schema_version,
        protocol_version: invocation.protocol_version,
        producer: {
          primitive: "role",
          name: definition.role_id,
          version: definition.role_version,
          invocation_id: invocation.payload.invocation_id,
        },
        created_at: createdAt,
        source_refs: [invocationReference(invocation), ...invocation.payload.input_artifacts],
        output_refs: [
          {
            ref_type: "artifact",
            id: artifactId,
            artifact_type: definition.expected_output_artifact_type,
            schema_version: definition.expected_output_schema_version,
            protocol_version: invocation.protocol_version,
            relation: "produces",
          },
        ],
      };
    },
    context_profile: {
      rules: {
        role_contract: "Return exactly one stub DesignBrief artifact.",
        non_goals: ["no_production_designer_role", "no_runner_edits"],
      },
      request: {
        include_output_schema: true,
        fields: ({ roleContext }) => ({
          design_context: roleContext.context ?? {},
        }),
      },
    },
    autonomy: {
      domain: "design",
    },
    skip_codes: {
      missing_required_output: "role:no_required_design_brief",
    },
  };
}

const extensionDesignBriefStructuredSchema: StructuredModelSchema<ArtifactEnvelope> = {
  name: "dev-genie.design-brief.stub",
  schema: {
    title: "DesignBrief",
    type: "object",
    description: "Stub artifact schema for proving RoleRegistry extension.",
  },
  parse(value: JsonValue): ArtifactEnvelope {
    if (!isExtensionDesignBrief(value)) {
      throw new Error("DesignBrief stub failed shallow artifact validation");
    }
    return value;
  },
};

function isExtensionDesignBrief(value: unknown): value is ArtifactEnvelope {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.artifact_id === "string" &&
    typeof value.artifact_type === "string" &&
    typeof value.schema_version === "string" &&
    typeof value.protocol_version === "string" &&
    isRecord(value.producer) &&
    typeof value.created_at === "string" &&
    Array.isArray(value.source_refs) &&
    Array.isArray(value.output_refs) &&
    isRecord(value.ownership) &&
    isRecord(value.confidence) &&
    isRecord(value.review_required) &&
    isRecord(value.diagnostics) &&
    isRecord(value.payload)
  );
}

function isRecord(value: unknown): value is { readonly [key: string]: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extensionInvocation(patch: Partial<RoleInvocation["payload"]> = {}): RoleInvocation {
  const base = createRegisteredV1RoleHarnessCases()[0]?.invocation;
  if (base === undefined) {
    throw new Error("Missing base harness invocation");
  }
  return {
    ...base,
    producer: {
      primitive: "loop",
      name: "roles-extension-proof",
      invocation_id: "roles-extension-designer-001",
    },
    payload: {
      ...base.payload,
      invocation_id: "roles-extension-designer-001",
      role_id: DESIGNER_ROLE_ID,
      role_version: DESIGNER_ROLE_VERSION,
      operation: "draft_design_brief",
      decision_scope: {
        scope_type: "artifact",
        scope_id: "design:roles-proof",
        objective: "Draft a minimal design brief stub for registry extension proof.",
        constraints: ["roles:no_runner_edits", "roles:deferred_roster_role"],
      },
      expected_output_artifacts: [
        {
          artifact_type: "DesignBrief",
          schema_version: "0.0.0-test",
          required: true,
          relation: "produces",
        },
      ],
      ...patch,
    },
  };
}

function extensionDesignBriefArtifact(): JsonObject {
  return {
    artifact_id: "artifact:sha256:9999999999999999999999999999999999999999999999999999999999999999",
    artifact_type: "DesignBrief",
    schema_version: "0.0.0-test",
    protocol_version: "1.2.0",
    producer: {
      primitive: "role",
      name: DESIGNER_ROLE_ID,
      version: DESIGNER_ROLE_VERSION,
      invocation_id: "roles-extension-designer-001",
    },
    created_at: "2026-05-24T00:45:00.000Z",
    source_refs: [],
    output_refs: [],
    ownership: {
      owns_files: [],
      owns_interfaces: ["interface:designer-role-extension"],
      owns_data: [],
      owns_workflow_steps: ["workflow:roles-extension-proof"],
    },
    confidence: {
      score: 0.74,
      level: "medium",
      reason_codes: ["designer:stubbed_extension"],
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
    payload: {
      brief_id: "roles-extension-proof",
      summary: "Designer is registered only inside the test and runs through the shared runner.",
    },
  };
}
