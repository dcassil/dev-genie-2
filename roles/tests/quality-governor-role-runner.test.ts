import type {
  JsonObject,
  JsonValue,
  OwnershipSurface,
  ReviewJudgment,
  RoleInvocation,
} from "protocol";
import { describe, expect, it } from "vitest";

import {
  QUALITY_GOVERNOR_ROLE_ID,
  QUALITY_GOVERNOR_ROLE_PROMPT,
  QUALITY_GOVERNOR_ROLE_VERSION,
  QualityGovernorRoleRunner,
  RoleRegistry,
  RoleRunner,
  isReviewJudgment,
  isRoleResult,
  qualityGovernorRoleDefinition,
  reviewJudgmentStructuredSchema,
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

describe("QualityGovernorRoleRunner", () => {
  it("returns produced with schema-valid ReviewJudgment and RoleResult artifacts", async () => {
    const producedArtifacts: ReviewJudgment[] = [];
    const client = new StubStructuredModelClient(validReviewJudgment("pass"));
    const runner = new QualityGovernorRoleRunner({
      modelClient: client,
      now: fixedNow,
      artifactSink: (artifact) => {
        producedArtifacts.push(artifact);
      },
    });

    const result = await runner.run(validInvocation(), {
      target_artifact: {
        artifact_type: "PlanProposal",
        artifact_id: "artifact:sha256:3333333333333333333333333333333333333333333333333333333333333333",
      },
      acceptance_criteria: [
        "ReviewJudgment validates through the protocol schema.",
        "Quality Governor runs through the shared RoleRunner.",
      ],
      review_context: {
        evidence: "unit-test",
      },
    });

    expect(result.payload.status).toBe("produced");
    expect(result.payload.human_review_required).toBe(false);
    expect(result.review_required.required).toBe(false);
    expect(isRoleResult(result)).toBe(true);
    expect(result.payload.output_artifacts).toHaveLength(1);
    expect(result.payload.output_artifacts[0]?.artifact_type).toBe("ReviewJudgment");
    expect(result.payload.output_artifacts[0]?.id).toBe(producedArtifacts[0]?.artifact_id);
    expect(producedArtifacts).toHaveLength(1);
    expect(isReviewJudgment(producedArtifacts[0] ?? null)).toBe(true);
    expect(validatorFor("ReviewJudgment")(producedArtifacts[0])).toBe(true);
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]?.outputName).toBe(reviewJudgmentStructuredSchema.name);
    expect(client.calls[0]?.responseSchemaTitle).toBe("ReviewJudgment");
    expect(client.calls[0]?.input.context).toMatchObject({
      prompt_ref: "dev-genie.quality-governor-role@1.0.0",
    });
    expect(client.calls[0]?.input.request).toMatchObject({
      operation: "review_artifact",
      review_scope_type: "review",
      decision_scope: {
        scope_type: "review",
        scope_id: "review:plan-proposal",
      },
      acceptance_criteria: [
        "ReviewJudgment validates through the protocol schema.",
        "Quality Governor runs through the shared RoleRunner.",
      ],
      output_schema: {
        artifact_type: "ReviewJudgment",
        schema_version: "1.0.0",
      },
    });
  });

  it("returns produced with review required and blocker codes for a failing judgment", async () => {
    const producedArtifacts: ReviewJudgment[] = [];
    const client = new StubStructuredModelClient(validReviewJudgment("fail"));
    const runner = new QualityGovernorRoleRunner({
      modelClient: client,
      now: fixedNow,
      artifactSink: (artifact) => {
        producedArtifacts.push(artifact);
      },
    });

    const result = await runner.run(validInvocation());

    expect(result.payload.status).toBe("produced");
    expect(result.payload.human_review_required).toBe(true);
    expect(result.review_required.required).toBe(true);
    expect(producedArtifacts[0]?.payload.verdict).toBe("fail");
    expect(producedArtifacts[0]?.payload.blocking_reason_codes).toEqual([
      "acceptance_criteria:missing_test_coverage",
    ]);
    expect(producedArtifacts[0]?.payload.completion_decision).toMatchObject({
      can_mark_complete: false,
      authority: "parent_authoritative",
      blocking_reason_codes: ["acceptance_criteria:missing_test_coverage"],
    });
  });

  it("surfaces a cannot-judge ReviewJudgment as produced with human review required", async () => {
    const producedArtifacts: ReviewJudgment[] = [];
    const client = new StubStructuredModelClient(validReviewJudgment("needs_human"));
    const runner = new QualityGovernorRoleRunner({
      modelClient: client,
      now: fixedNow,
      artifactSink: (artifact) => {
        producedArtifacts.push(artifact);
      },
    });

    const result = await runner.run(validInvocation());

    expect(result.payload.status).toBe("produced");
    expect(result.payload.human_review_required).toBe(true);
    expect(result.payload.missing_context[0]?.code).toBe("context:parent_authority_not_available");
    expect(result.review_required.required).toBe(true);
    expect(producedArtifacts[0]?.payload.verdict).toBe("needs_human");
    expect(producedArtifacts[0]?.payload.human_review_required).toBe(true);
  });

  it("returns skipped for wrong role, unsupported version, operation, or missing required output", async () => {
    const client = new StubStructuredModelClient(validReviewJudgment("pass"));
    const registry = new RoleRegistry().register(qualityGovernorRoleDefinition);
    const runner = new RoleRunner({
      registry,
      modelClient: client,
      now: fixedNow,
    });

    const wrongRole = await runner.run(withPayload({ role_id: "dev-genie.other-role" }), {});
    const unsupportedVersion = await runner.run(withPayload({ role_version: "2.0.0" }), {});
    const unsupportedOperation = await runner.run(withPayload({ operation: "propose_plan" }), {});
    const missingOutput = await runner.run(
      withPayload({
        expected_output_artifacts: [
          {
            artifact_type: "PlanProposal",
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
    expect(missingOutput.payload.skip_reason?.code).toBe("role:no_required_review_judgment");
    expect(client.calls).toHaveLength(0);
  });

  it("returns needs_human when the invocation allows no model-backed tier", async () => {
    const client = new StubStructuredModelClient(validReviewJudgment("pass"));
    const runner = new QualityGovernorRoleRunner({
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

  it("returns blocked when the structured model client returns schema-invalid junk", async () => {
    const client = new StubStructuredModelClient({ junk: true });
    const runner = new QualityGovernorRoleRunner({
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

  it("returns blocked with retry recommendation when the model call throws", async () => {
    const client = new ThrowingStructuredModelClient();
    const runner = new QualityGovernorRoleRunner({
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

  it("uses the Quality Governor prompt identity, ReviewJudgment output, and engineering domain", () => {
    expect(QUALITY_GOVERNOR_ROLE_PROMPT).toMatchObject({
      id: QUALITY_GOVERNOR_ROLE_ID,
      version: QUALITY_GOVERNOR_ROLE_VERSION,
      ref: "dev-genie.quality-governor-role@1.0.0",
    });
    expect(qualityGovernorRoleDefinition.autonomy.domain).toBe("engineering");
    expect(qualityGovernorRoleDefinition.output).toBe(reviewJudgmentStructuredSchema);
  });
});

function fixedNow(): Date {
  return new Date("2026-05-24T00:20:00.000Z");
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
    artifact_id: "artifact:sha256:4444444444444444444444444444444444444444444444444444444444444444",
    artifact_type: "RoleInvocation",
    schema_version: "1.0.0",
    protocol_version: "1.2.0",
    producer: {
      primitive: "loop",
      name: "roles-test",
      invocation_id: "quality-governor-call-001",
    },
    created_at: "2026-05-24T00:19:00.000Z",
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
      invocation_id: "quality-governor-call-001",
      role_id: QUALITY_GOVERNOR_ROLE_ID,
      role_version: QUALITY_GOVERNOR_ROLE_VERSION,
      operation: "review_artifact",
      decision_scope: {
        scope_type: "review",
        scope_id: "review:plan-proposal",
        objective: "Judge the target artifact against the supplied acceptance criteria.",
        constraints: ["roles:stateless", "roles:no_runner_edits"],
      },
      input_artifacts: [reviewSubjectRef()],
      context_bundle_refs: [
        {
          ref_type: "artifact",
          id: "context:quality-governor-bounded",
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
          artifact_type: "ReviewJudgment",
          schema_version: "1.0.0",
          required: true,
          relation: "produces",
        },
      ],
      trace: {
        destination: {
          ref_type: "file",
          id: "roles/runs/quality-governor-call-001.jsonl",
          relation: "produces",
        },
        trace_id: "trace-quality-governor-call-001",
      },
    },
  };
}

function validReviewJudgment(verdict: "pass" | "fail" | "needs_human"): JsonObject {
  const blockingReasonCodes = blockingReasonCodesFor(verdict);
  const humanReviewRequired = verdict !== "pass";
  return {
    artifact_id: "artifact:sha256:5555555555555555555555555555555555555555555555555555555555555555",
    artifact_type: "ReviewJudgment",
    schema_version: "1.0.0",
    protocol_version: "1.2.0",
    producer: {
      primitive: "role",
      name: QUALITY_GOVERNOR_ROLE_ID,
      version: QUALITY_GOVERNOR_ROLE_VERSION,
      invocation_id: "quality-governor-call-001",
    },
    created_at: "2026-05-24T00:20:00.000Z",
    source_refs: [reviewSubjectJson()],
    output_refs: [],
    ownership: {
      owns_files: [],
      owns_interfaces: ["interface:quality-governor-review"],
      owns_data: [],
      owns_workflow_steps: ["workflow:quality-governor-output"],
      depends_on: ["interface:protocol-validation-report"],
    },
    confidence: confidenceFor(verdict),
    review_required: {
      required: humanReviewRequired,
      reason_codes: humanReviewRequired ? ["review:human_required"] : [],
    },
    diagnostics: {
      status: "produced",
      warnings: [],
      errors: [],
      missing_context:
        verdict === "needs_human"
          ? [
              {
                code: "context:parent_authority_not_available",
                ref_type: "artifact",
                id: "ValidationReport",
              },
            ]
          : [],
    },
    payload: {
      review_subject: reviewSubjectJson(),
      verdict,
      criteria: [
        {
          criterion_id: "acceptance_criteria",
          criterion: "The target satisfies the supplied acceptance criteria.",
          status: verdict,
          findings: [findingFor(verdict)],
          blocking_reason_codes: blockingReasonCodes,
          evidence_refs: [reviewSubjectJson()],
          confidence: confidenceFor(verdict),
        },
      ],
      completion_decision: {
        can_mark_complete: verdict === "pass",
        authority: "parent_authoritative",
        blocking_reason_codes: blockingReasonCodes,
      },
      blocking_reason_codes: blockingReasonCodes,
      confidence: confidenceFor(verdict),
      missing_context:
        verdict === "needs_human"
          ? [
              {
                code: "context:parent_authority_not_available",
                ref_type: "artifact",
                id: "ValidationReport",
              },
            ]
          : [],
      review_required: {
        required: humanReviewRequired,
        reason_codes: humanReviewRequired ? ["review:human_required"] : [],
      },
      human_review_required: humanReviewRequired,
      reason_codes: reasonCodesFor(verdict),
    },
  };
}

function reviewSubjectRef(): RoleInvocation["payload"]["input_artifacts"][number] {
  return {
    ref_type: "artifact",
    id: "artifact:sha256:3333333333333333333333333333333333333333333333333333333333333333",
    artifact_type: "PlanProposal",
    schema_version: "1.0.0",
    protocol_version: "1.2.0",
    relation: "validates",
  };
}

function reviewSubjectJson(): JsonObject {
  return {
    ref_type: "artifact",
    id: "artifact:sha256:3333333333333333333333333333333333333333333333333333333333333333",
    artifact_type: "PlanProposal",
    schema_version: "1.0.0",
    protocol_version: "1.2.0",
    relation: "validates",
  };
}

function blockingReasonCodesFor(verdict: "pass" | "fail" | "needs_human"): string[] {
  if (verdict === "pass") {
    return [];
  }
  if (verdict === "fail") {
    return ["acceptance_criteria:missing_test_coverage"];
  }
  return ["context:parent_authority_not_available"];
}

function confidenceFor(verdict: "pass" | "fail" | "needs_human"): JsonObject {
  if (verdict === "needs_human") {
    return {
      score: 0.46,
      level: "low",
      reason_codes: ["review:insufficient_context"],
    };
  }
  return {
    score: verdict === "pass" ? 0.9 : 0.8,
    level: "high",
    reason_codes: ["review:criteria_checked"],
  };
}

function findingFor(verdict: "pass" | "fail" | "needs_human"): string {
  if (verdict === "pass") {
    return "All supplied acceptance criteria are satisfied by the reviewed artifact.";
  }
  if (verdict === "fail") {
    return "The reviewed artifact does not include required test coverage evidence.";
  }
  return "The review context lacks parent-authoritative completion evidence.";
}

function reasonCodesFor(verdict: "pass" | "fail" | "needs_human"): string[] {
  if (verdict === "pass") {
    return ["review:passed"];
  }
  if (verdict === "fail") {
    return ["review:failed"];
  }
  return ["review:needs_human"];
}

function emptyOwnership(): OwnershipSurface {
  return {
    owns_files: [],
    owns_interfaces: [],
    owns_data: [],
    owns_workflow_steps: [],
  };
}
