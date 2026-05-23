import type {
  ArchitectureImpact,
  JsonObject,
  JsonValue,
  OwnershipSurface,
  RoleInvocation,
} from "protocol";
import { describe, expect, it } from "vitest";

import {
  ARCHITECT_ROLE_ID,
  ARCHITECT_ROLE_VERSION,
  architectureImpactStructuredSchema,
  ArchitectRoleRunner,
  isArchitectureImpact,
  type StructuredModelInput,
  type StructuredModelRequest,
  type StructuredModelCaller,
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

describe("ArchitectRoleRunner", () => {
  it("returns produced with a schema-valid ArchitectureImpact artifact from a stubbed structured model call", async () => {
    const producedArtifacts: ArchitectureImpact[] = [];
    const client = new StubStructuredModelClient(validArchitectureImpact());
    const runner = new ArchitectRoleRunner({
      modelClient: client,
      now: fixedNow,
      artifactSink: (artifact) => {
        producedArtifacts.push(artifact);
      },
    });

    const result = await runner.run(validInvocation(), {
      story: {
        title: "Add direct Architect Role runner",
        body: "Produce one ArchitectureImpact from one Story without recursive supervision.",
      },
    });

    expect(result.payload.status).toBe("produced");
    expect(result.payload.output_artifacts).toHaveLength(1);
    expect(result.payload.output_artifacts[0]?.artifact_type).toBe("ArchitectureImpact");
    expect(result.payload.output_artifacts[0]?.id).toBe(producedArtifacts[0]?.artifact_id);
    expect(producedArtifacts).toHaveLength(1);
    expect(isArchitectureImpact(producedArtifacts[0] ?? null)).toBe(true);
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]?.outputName).toBe(architectureImpactStructuredSchema.name);
    expect(client.calls[0]?.responseSchemaTitle).toBe("ArchitectureImpact");
    expect(client.calls[0]?.input.context).toMatchObject({
      prompt_ref: "protocol-proof.architect-role@1.0.0",
    });
  });

  it("returns blocked when the structured model client returns schema-invalid junk", async () => {
    const client = new StubStructuredModelClient({ junk: true });
    const runner = new ArchitectRoleRunner({
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

  it("returns skipped for a non-Architect invocation without calling the model", async () => {
    const client = new StubStructuredModelClient(validArchitectureImpact());
    const runner = new ArchitectRoleRunner({
      modelClient: client,
      now: fixedNow,
    });
    const invocation: RoleInvocation = {
      ...validInvocation(),
      payload: {
        ...validInvocation().payload,
        role_id: "protocol-proof.other-role",
      },
    };

    const result = await runner.run(invocation);

    expect(result.payload.status).toBe("skipped");
    expect(result.payload.skip_reason?.code).toBe("role:not_architect_role");
    expect(client.calls).toHaveLength(0);
  });

  it("returns needs_human when the invocation allows no model-backed tier", async () => {
    const client = new StubStructuredModelClient(validArchitectureImpact());
    const runner = new ArchitectRoleRunner({
      modelClient: client,
      now: fixedNow,
    });
    const base = validInvocation();
    const invocation: RoleInvocation = {
      ...base,
      payload: {
        ...base.payload,
        model_tier_policy: {
          allowed_tiers: ["human"],
          preferred_tier: "human",
          fallback_allowed: false,
        },
      },
    };

    const result = await runner.run(invocation);

    expect(result.payload.status).toBe("needs_human");
    expect(result.payload.human_review_required).toBe(true);
    expect(client.calls).toHaveLength(0);
  });
});

function fixedNow(): Date {
  return new Date("2026-05-23T23:30:00.000Z");
}

function validInvocation(): RoleInvocation {
  return {
    artifact_id: "artifact:sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    artifact_type: "RoleInvocation",
    schema_version: "1.0.0",
    protocol_version: "1.1.0",
    producer: {
      primitive: "loop",
      name: "protocol-proof-test",
      invocation_id: "architect-role-call-001",
    },
    created_at: "2026-05-23T23:29:00.000Z",
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
      invocation_id: "architect-role-call-001",
      role_id: ARCHITECT_ROLE_ID,
      role_version: ARCHITECT_ROLE_VERSION,
      operation: "assess_architecture_impact",
      decision_scope: {
        scope_type: "task",
        scope_id: "DGOS-T-0022",
        objective: "Turn the Story into one ArchitectureImpact artifact.",
        constraints: ["proof:no_recursive_supervisor", "proof:no_agent_transport"],
      },
      input_artifacts: [
        {
          ref_type: "artifact",
          id: "story:architect-role-versioned-prompt",
          artifact_type: "Story",
          schema_version: "1.0.0",
          protocol_version: "1.1.0",
          relation: "read",
        },
      ],
      context_bundle_refs: [
        {
          ref_type: "artifact",
          id: "context:architect-role-bounded",
          artifact_type: "ContextBundle",
          schema_version: "1.0.0",
          protocol_version: "1.1.0",
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
          artifact_type: "ArchitectureImpact",
          schema_version: "1.0.0",
          required: true,
          relation: "produces",
        },
      ],
      trace: {
        destination: {
          ref_type: "file",
          id: "protocol-proof/runs/architect-role-call-001.jsonl",
          relation: "produces",
        },
        trace_id: "trace-architect-role-call-001",
      },
    },
  };
}

function validArchitectureImpact(): JsonObject {
  return {
    artifact_id: "artifact:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    artifact_type: "ArchitectureImpact",
    schema_version: "1.0.0",
    protocol_version: "1.1.0",
    producer: {
      primitive: "role",
      name: ARCHITECT_ROLE_ID,
      version: ARCHITECT_ROLE_VERSION,
      invocation_id: "architect-role-call-001",
    },
    created_at: "2026-05-23T23:30:00.000Z",
    source_refs: [
      {
        ref_type: "artifact",
        id: "story:architect-role-versioned-prompt",
        artifact_type: "Story",
        schema_version: "1.0.0",
        protocol_version: "1.1.0",
        relation: "read",
      },
    ],
    output_refs: [],
    ownership: {
      owns_files: ["protocol-proof/src/runner/architect-role-runner.ts"],
      owns_interfaces: ["interface:direct-architect-role-runner"],
      owns_data: [],
      owns_workflow_steps: ["workflow:protocol-proof-architect-role"],
    },
    confidence: {
      score: 0.88,
      level: "high",
      reason_codes: ["test:stubbed_model"],
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
      summary: {
        impact_level: "medium",
        primary_change: "add_new_surface",
        affected_primitive: "role",
        reason_codes: ["proof:direct_role_runner"],
      },
      affected_surfaces: {
        owns_files: ["protocol-proof/src/runner/architect-role-runner.ts"],
        owns_interfaces: ["interface:direct-architect-role-runner"],
        owns_data: [],
        owns_workflow_steps: ["workflow:protocol-proof-architect-role"],
        depends_on: ["file:daimyo/src/engine/structured-model-call.ts"],
      },
      owned_surfaces: {
        owns_files: ["protocol-proof/src/runner/architect-role-runner.ts"],
        owns_interfaces: ["interface:direct-architect-role-runner"],
        owns_data: [],
        owns_workflow_steps: ["workflow:protocol-proof-architect-role"],
        depends_on: [],
      },
      proposed_changes: [
        {
          change_id: "add_direct_architect_runner",
          change_type: "add",
          component: {
            name: "ArchitectRoleRunner",
            kind: "role",
          },
          target_surfaces: {
            owns_files: ["protocol-proof/src/runner/architect-role-runner.ts"],
            owns_interfaces: ["interface:direct-architect-role-runner"],
            owns_data: [],
            owns_workflow_steps: ["workflow:protocol-proof-architect-role"],
            depends_on: [],
          },
          rationale_codes: ["proof:typed_role_invocation_to_artifact"],
        },
      ],
      risks: [
        {
          risk_id: "prompt_output_drift",
          category: "validation",
          severity: "medium",
          affected_surfaces: {
            owns_files: ["protocol-proof/src/runner/architect-role-runner.ts"],
            owns_interfaces: ["interface:direct-architect-role-runner"],
            owns_data: [],
            owns_workflow_steps: ["workflow:protocol-proof-architect-role"],
            depends_on: [],
          },
          mitigation_codes: ["test:stub_schema_invalid_blocks"],
        },
      ],
      tradeoffs: [
        {
          tradeoff_id: "direct_runner_only",
          chosen_option: "single_structured_model_call",
          rejected_options: ["recursive_supervisor"],
          reason_codes: ["proof:scope_control"],
        },
      ],
      decisions: [
        {
          decision_id: "reuse_daimyo_structured_model_call",
          status: "accepted",
          decision: "import_daimyo_structured_model_call_engine",
          applies_to_surfaces: {
            owns_files: ["protocol-proof/src/runner/architect-role-runner.ts"],
            owns_interfaces: ["interface:direct-architect-role-runner"],
            owns_data: [],
            owns_workflow_steps: ["workflow:protocol-proof-architect-role"],
            depends_on: [],
          },
          reason_codes: ["task:no_reimplement_model_io"],
        },
      ],
      assumptions: [
        {
          assumption_id: "story_supplied_by_harness",
          subject: "the_next_task_supplies_story_content_in_bounded_context",
          confidence: "medium",
          validation_needed: true,
        },
      ],
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
