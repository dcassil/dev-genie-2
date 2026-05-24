import type {
  JsonObject,
  JsonValue,
  OwnershipSurface,
  PlanProposal,
  RoleInvocation,
} from "protocol";
import { describe, expect, it } from "vitest";

import {
  PLANNER_ROLE_ID,
  PLANNER_ROLE_PROMPT,
  PLANNER_ROLE_VERSION,
  PlannerRoleRunner,
  RoleRegistry,
  RoleRunner,
  architectRoleDefinition,
  isPlanProposal,
  isRoleResult,
  planProposalStructuredSchema,
  plannerRoleDefinition,
  type StructuredModelCaller,
  type StructuredModelInput,
  type StructuredModelRequest,
  validatorFor,
} from "../src/index.js";

interface RecordedStructuredCall {
  readonly input: StructuredModelInput;
  readonly outputName: string;
  readonly responseSchemaTitle: JsonValue | undefined;
}

class StubStructuredModelClient implements StructuredModelCaller {
  readonly calls: RecordedStructuredCall[] = [];

  constructor(private readonly response: JsonValue) {}

  async call<T>(request: StructuredModelRequest<T>): Promise<T> {
    this.calls.push({
      input: request.input,
      outputName: request.output.name,
      responseSchemaTitle: request.output.schema.title,
    });
    return request.output.parse(this.response);
  }
}

class ThrowingStructuredModelClient implements StructuredModelCaller {
  readonly calls: StructuredModelInput[] = [];

  async call<T>(request: StructuredModelRequest<T>): Promise<T> {
    this.calls.push(request.input);
    throw new Error("model unavailable");
  }
}

describe("PlannerRoleRunner", () => {
  it("returns produced with schema-valid PlanProposal and RoleResult artifacts", async () => {
    const producedArtifacts: PlanProposal[] = [];
    const client = new StubStructuredModelClient(validPlanProposal());
    const runner = new PlannerRoleRunner({
      modelClient: client,
      now: fixedNow,
      artifactSink: (artifact) => {
        producedArtifacts.push(artifact);
      },
    });

    const result = await runner.run(validInvocation(), {
      initiative: {
        title: "Role Contracts & Autonomy",
        objective: "Register Planner as the second v1 Role.",
      },
      context: {
        repo: "dev-genie",
      },
    });

    expect(result.payload.status).toBe("produced");
    expect(isRoleResult(result)).toBe(true);
    expect(result.payload.output_artifacts).toHaveLength(1);
    expect(result.payload.output_artifacts[0]?.artifact_type).toBe("PlanProposal");
    expect(result.payload.output_artifacts[0]?.id).toBe(producedArtifacts[0]?.artifact_id);
    expect(producedArtifacts).toHaveLength(1);
    expect(isPlanProposal(producedArtifacts[0] ?? null)).toBe(true);
    expect(validatorFor("PlanProposal")(producedArtifacts[0])).toBe(true);
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]?.outputName).toBe(planProposalStructuredSchema.name);
    expect(client.calls[0]?.responseSchemaTitle).toBe("PlanProposal");
    expect(client.calls[0]?.input.context).toMatchObject({
      prompt_ref: "dev-genie.planner-role@1.0.0",
    });
    expect(client.calls[0]?.input.request).toMatchObject({
      operation: "propose_plan",
      planning_goal: "Decompose the initiative into executable tasks.",
      bounded_context: {
        repo: "dev-genie",
        initiative: {
          title: "Role Contracts & Autonomy",
          objective: "Register Planner as the second v1 Role.",
        },
      },
      output_schema: {
        artifact_type: "PlanProposal",
        schema_version: "1.0.0",
      },
    });
  });

  it("returns blocked when the structured model client returns schema-invalid junk", async () => {
    const client = new StubStructuredModelClient({ junk: true });
    const runner = new PlannerRoleRunner({
      modelClient: client,
      now: fixedNow,
    });

    const result = await runner.run(validInvocation());

    expect(result.payload.status).toBe("blocked");
    expect(result.payload.output_artifacts).toEqual([]);
    expect(result.diagnostics.status).toBe("blocked");
    expect(result.diagnostics.errors[0]?.code).toBe("structured_model_call_failed");
    expect(client.calls).toHaveLength(1);
  });

  it("returns skipped for wrong role, unsupported Planner version, operation, or missing required output", async () => {
    const client = new StubStructuredModelClient(validPlanProposal());
    const registry = new RoleRegistry()
      .register(architectRoleDefinition)
      .register(plannerRoleDefinition);
    const runner = new RoleRunner({
      registry,
      modelClient: client,
      now: fixedNow,
    });

    const wrongRole = await runner.run(withPayload({ role_id: "dev-genie.other-role" }), {});
    const unsupportedVersion = await runner.run(withPayload({ role_version: "2.0.0" }), {});
    const unsupportedOperation = await runner.run(withPayload({ operation: "assess_architecture_impact" }), {});
    const missingOutput = await runner.run(
      withPayload({
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

    expect(wrongRole.payload.status).toBe("skipped");
    expect(wrongRole.payload.skip_reason?.code).toBe("role:not_registered");
    expect(unsupportedVersion.payload.status).toBe("skipped");
    expect(unsupportedVersion.payload.skip_reason?.code).toBe("role:unsupported_version");
    expect(unsupportedOperation.payload.status).toBe("skipped");
    expect(unsupportedOperation.payload.skip_reason?.code).toBe("role:unsupported_operation");
    expect(missingOutput.payload.status).toBe("skipped");
    expect(missingOutput.payload.skip_reason?.code).toBe("role:no_required_plan_proposal");
    expect(client.calls).toHaveLength(0);
  });

  it("returns needs_human when the invocation allows no model-backed tier", async () => {
    const client = new StubStructuredModelClient(validPlanProposal());
    const runner = new PlannerRoleRunner({
      modelClient: client,
      now: fixedNow,
    });
    const invocation = withPayload({
      model_tier_policy: {
        allowed_tiers: ["human"],
        preferred_tier: "human",
        fallback_allowed: false,
      },
    });

    const result = await runner.run(invocation);

    expect(result.payload.status).toBe("needs_human");
    expect(result.payload.human_review_required).toBe(true);
    expect(client.calls).toHaveLength(0);
  });

  it("returns blocked with retry recommendation when the model call throws", async () => {
    const client = new ThrowingStructuredModelClient();
    const runner = new PlannerRoleRunner({
      modelClient: client,
      now: fixedNow,
    });

    const result = await runner.run(validInvocation());

    expect(result.payload.status).toBe("blocked");
    expect(result.payload.retry_recommendation?.recommended).toBe(true);
    expect(result.payload.retry_recommendation?.reason_codes).toContain("role:structured_output_retry");
    expect(result.diagnostics.errors[0]?.code).toBe("structured_model_call_failed");
    expect(client.calls).toHaveLength(1);
  });

  it("uses the Planner prompt identity and engineering autonomy domain", () => {
    expect(PLANNER_ROLE_PROMPT).toMatchObject({
      id: PLANNER_ROLE_ID,
      version: PLANNER_ROLE_VERSION,
      ref: "dev-genie.planner-role@1.0.0",
    });
    expect(plannerRoleDefinition.autonomy.domain).toBe("engineering");
    expect(plannerRoleDefinition.output).toBe(planProposalStructuredSchema);
  });
});

function fixedNow(): Date {
  return new Date("2026-05-24T00:10:00.000Z");
}

function withPayload(patch: Partial<RoleInvocation["payload"]>): RoleInvocation {
  const base = validInvocation();
  return {
    ...base,
    payload: {
      ...base.payload,
      ...patch,
    },
  };
}

function validInvocation(): RoleInvocation {
  return {
    artifact_id: "artifact:sha256:1111111111111111111111111111111111111111111111111111111111111111",
    artifact_type: "RoleInvocation",
    schema_version: "1.0.0",
    protocol_version: "1.2.0",
    producer: {
      primitive: "loop",
      name: "roles-test",
      invocation_id: "planner-role-call-001",
    },
    created_at: "2026-05-24T00:09:00.000Z",
    source_refs: [],
    output_refs: [],
    ownership: emptyOwnership(),
    confidence: {
      score: 1,
      level: "high",
      reason_codes: ["test:fixture"],
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
      invocation_id: "planner-role-call-001",
      role_id: PLANNER_ROLE_ID,
      role_version: PLANNER_ROLE_VERSION,
      operation: "propose_plan",
      decision_scope: {
        scope_type: "initiative",
        scope_id: "DGOS-I-0010",
        objective: "Decompose the initiative into executable tasks.",
        constraints: ["roles:stateless", "roles:no_runner_edits"],
      },
      input_artifacts: [
        {
          ref_type: "artifact",
          id: "initiative:role-contracts-autonomy",
          artifact_type: "Initiative",
          schema_version: "1.0.0",
          protocol_version: "1.2.0",
          relation: "read",
        },
      ],
      context_bundle_refs: [
        {
          ref_type: "artifact",
          id: "context:planner-role-bounded",
          artifact_type: "ContextBundle",
          schema_version: "1.0.0",
          protocol_version: "1.2.0",
          relation: "read",
        },
      ],
      policy_decision_refs: [],
      budget: {
        max_output_tokens: 4000,
      },
      model_tier_policy: {
        allowed_tiers: ["standard", "frontier"],
        preferred_tier: "frontier",
        fallback_allowed: true,
      },
      timeout_ms: 30000,
      allowed_engines: [],
      allowed_tools: [],
      expected_output_artifacts: [
        {
          artifact_type: "PlanProposal",
          schema_version: "1.0.0",
          required: true,
          relation: "produces",
        },
      ],
      trace: {
        destination: {
          ref_type: "file",
          id: "roles/runs/planner-role-call-001.jsonl",
          relation: "produces",
        },
        trace_id: "trace-planner-role-call-001",
      },
    },
  };
}

function validPlanProposal(): JsonObject {
  return {
    artifact_id: "artifact:sha256:3333333333333333333333333333333333333333333333333333333333333333",
    artifact_type: "PlanProposal",
    schema_version: "1.0.0",
    protocol_version: "1.2.0",
    producer: {
      primitive: "role",
      name: PLANNER_ROLE_ID,
      version: PLANNER_ROLE_VERSION,
      invocation_id: "planner-role-call-001",
    },
    created_at: "2026-05-24T00:10:00.000Z",
    source_refs: [
      {
        ref_type: "artifact",
        id: "initiative:role-contracts-autonomy",
        artifact_type: "Initiative",
        schema_version: "1.0.0",
        protocol_version: "1.2.0",
        relation: "read",
      },
    ],
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
      planning_goal: "Decompose the initiative into executable tasks.",
      tasks: [
        {
          task_ref: "task-001",
          title: "Implement Planner Role",
          body: "Create and register the Planner RoleDefinition.",
          acceptance_criteria: [
            "Planner produces a schema-valid PlanProposal.",
            "Planner runs through the shared RoleRunner.",
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
      confidence: {
        score: 0.82,
        level: "high",
        reason_codes: ["planner:bounded_context"],
      },
      missing_context: [],
      review_required: {
        required: false,
        reason_codes: [],
      },
      reason_codes: ["planner:additive_role_registration"],
    },
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
