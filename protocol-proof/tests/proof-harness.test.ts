import { fileURLToPath } from "node:url";

import type { ArchitectureImpact, JsonObject, JsonValue, RoleResult } from "protocol";
import { describe, expect, it } from "vitest";

import {
  ARCHITECT_ROLE_ID,
  ARCHITECT_ROLE_VERSION,
  loadProofStory,
  runProofHarness,
  validateProofArchitectureImpact,
  type StructuredModelCaller,
  type StructuredModelRequest,
} from "../src/index.js";

class StubStructuredModelClient implements StructuredModelCaller {
  constructor(private readonly response: JsonValue) {}

  async call<T>(request: StructuredModelRequest<T>): Promise<T> {
    return request.output.parse(this.response);
  }
}

describe("protocol proof harness", () => {
  it("wires Story to ArchitectRoleRunner to ArchitectureImpact to ValidationReport and passes a good artifact", async () => {
    const story = loadProofStory(storyPath());
    const result = await runProofHarness({
      story,
      modelClient: new StubStructuredModelClient(goodArchitectureImpact()),
      now: fixedNow,
    });

    expect(result.invocation.payload.input_artifacts[0]?.id).toBe(story.id);
    expect(result.roleResult.payload.status).toBe("produced");
    expect(result.roleResult.payload.output_artifacts[0]?.id).toBe(result.architectureImpact.artifact_id);
    expect(result.validationReport.artifact_type).toBe("ValidationReport");
    expect(result.validationReport.payload.status).toBe("pass");
    expect(result.validationReport.payload.completion_decision.can_mark_complete).toBe(true);
    expect(result.validationReport.payload.details.kind).toBe("command");
    expect(result.validationReport.payload.details.stdout).toContain("\"schema_valid\":true");
  });

  it("emits a failing ValidationReport for a schema-valid artifact that misses the Story intent", async () => {
    const story = loadProofStory(storyPath());
    const result = await runProofHarness({
      story,
      modelClient: new StubStructuredModelClient(badIntentArchitectureImpact()),
      now: fixedNow,
    });

    expect(result.roleResult.payload.status).toBe("produced");
    expect(result.validationReport.payload.status).toBe("fail");
    expect(result.validationReport.payload.completion_decision.can_mark_complete).toBe(false);
    expect(result.validationReport.payload.details.stdout).toContain("\"required_surfaces\"");
  });

  it("emits a failing ValidationReport for a schema-invalid artifact candidate", async () => {
    const story = loadProofStory(storyPath());
    const result = await validateProofArchitectureImpact({
      story,
      candidate: { artifact_type: "ArchitectureImpact", payload: { proposed_changes: [] } },
      roleResult: roleResultWithoutOutputs(),
      now: fixedNow,
    });

    expect(result.status).toBe("fail");
    expect(result.schemaValid).toBe(false);
    expect(result.report.payload.status).toBe("fail");
    expect(result.report.payload.details.stdout).toContain("\"schema_valid\":false");
  });
});

function fixedNow(): Date {
  return new Date("2026-05-23T23:45:00.000Z");
}

function storyPath(): string {
  return fileURLToPath(new URL("../fixtures/story/proof-story.json", import.meta.url));
}

function goodArchitectureImpact(): JsonObject {
  return architectureImpact({
    reasonCodes: ["proof:e2e_harness", "proof:validation_gate", "proof:dogfood_evidence"],
    affectedPrimitive: "workflow",
    files: [
      "protocol-proof/src/harness/proof-harness.ts",
      "protocol-proof/src/validation/proof-validation-gate.ts",
      "protocol-proof/evidence/dogfood/architecture-impact.json",
      "protocol-proof/evidence/dogfood/validation-report.json",
      "protocol-proof/PROOF.md",
    ],
    workflowSteps: [
      "workflow:protocol-proof-e2e-harness",
      "workflow:protocol-proof-validation-gate",
    ],
  });
}

function badIntentArchitectureImpact(): JsonObject {
  return architectureImpact({
    reasonCodes: ["proof:unrelated"],
    affectedPrimitive: "workflow",
    files: ["protocol-proof/src/unrelated.ts"],
    workflowSteps: ["workflow:unrelated"],
  });
}

function architectureImpact(input: {
  readonly reasonCodes: readonly string[];
  readonly affectedPrimitive: ArchitectureImpact["payload"]["summary"]["affected_primitive"];
  readonly files: readonly string[];
  readonly workflowSteps: readonly string[];
}): JsonObject {
  const surfaces = {
    owns_files: [...input.files],
    owns_interfaces: ["interface:protocol-proof-harness"],
    owns_data: [],
    owns_workflow_steps: [...input.workflowSteps],
    depends_on: ["interface:daimyo-built-in-validation"],
  };
  return {
    artifact_id: "artifact:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    artifact_type: "ArchitectureImpact",
    schema_version: "1.0.0",
    protocol_version: "1.1.0",
    producer: {
      primitive: "role",
      name: ARCHITECT_ROLE_ID,
      version: ARCHITECT_ROLE_VERSION,
      invocation_id: "protocol-proof-dogfood-architect-001",
    },
    created_at: "2026-05-23T23:45:00.000Z",
    source_refs: [],
    output_refs: [],
    ownership: surfaces,
    confidence: {
      score: 0.9,
      level: "high",
      reason_codes: [...input.reasonCodes],
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
        affected_primitive: input.affectedPrimitive,
        reason_codes: [...input.reasonCodes],
      },
      affected_surfaces: surfaces,
      owned_surfaces: surfaces,
      proposed_changes: [
        {
          change_id: "add_proof_harness_gate",
          change_type: "add",
          component: {
            name: "ProtocolProofHarness",
            kind: "workflow",
          },
          target_surfaces: surfaces,
          rationale_codes: [...input.reasonCodes],
        },
      ],
      risks: [
        {
          risk_id: "validation_heuristic_too_narrow",
          category: "validation",
          severity: "medium",
          affected_surfaces: surfaces,
          mitigation_codes: ["test:good_and_bad_gate_cases"],
        },
      ],
      tradeoffs: [
        {
          tradeoff_id: "command_gate_over_prose",
          chosen_option: "daimyo_validation_command",
          rejected_options: ["prose_verdict_only"],
          reason_codes: ["proof:validation_gate"],
        },
      ],
      decisions: [
        {
          decision_id: "reuse_daimyo_builtin_validation",
          status: "accepted",
          decision: "gate_architecture_impact_with_daimyo_builtin_validation_command_path",
          applies_to_surfaces: surfaces,
          reason_codes: ["proof:validation_gate"],
        },
      ],
      assumptions: [
        {
          assumption_id: "story_intent_is_machine_checkable",
          subject: "required surfaces and reason codes are enough for this proof gate",
          confidence: "medium",
          validation_needed: false,
        },
      ],
    },
  };
}

function roleResultWithoutOutputs(): RoleResult {
  return {
    artifact_id: "artifact:sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    artifact_type: "RoleResult",
    schema_version: "1.0.0",
    protocol_version: "1.1.0",
    producer: {
      primitive: "role" as const,
      name: ARCHITECT_ROLE_ID,
      version: ARCHITECT_ROLE_VERSION,
      invocation_id: "protocol-proof-dogfood-architect-001",
    },
    created_at: "2026-05-23T23:45:00.000Z",
    source_refs: [],
    output_refs: [],
    ownership: {
      owns_files: [],
      owns_interfaces: [],
      owns_data: [],
      owns_workflow_steps: [],
    },
    confidence: {
      score: 0,
      level: "low" as const,
      reason_codes: ["test:schema_invalid"],
    },
    review_required: {
      required: false,
      reason_codes: [],
    },
    diagnostics: {
      status: "blocked" as const,
      warnings: [],
      errors: [],
      missing_context: [],
    },
    payload: {
      invocation_id: "protocol-proof-dogfood-architect-001",
      role_id: ARCHITECT_ROLE_ID,
      role_version: ARCHITECT_ROLE_VERSION,
      status: "blocked",
      confidence: {
        score: 0,
        level: "low" as const,
        reason_codes: ["test:schema_invalid"],
      },
      missing_context: [],
      human_review_required: false,
      source_artifacts: [],
      output_artifacts: [],
      trace: {
        trace_refs: [],
      },
    },
  };
}
