import { createHash } from "node:crypto";

import type {
  ArchitectureImpact,
  ArtifactReference,
  OwnershipSurface,
  RoleInvocation,
  RoleResult,
  ValidationReport,
} from "protocol";

import {
  ARCHITECT_ROLE_ID,
  ARCHITECT_ROLE_VERSION,
} from "../prompts/architect-role.js";
import { ArchitectRoleRunner } from "../runner/architect-role-runner.js";
import type { StructuredModelCaller } from "../runner/structured-model.js";
import { proofStoryAsJson, type ProofStory } from "../proof/story.js";
import { validateProofArchitectureImpact } from "../validation/proof-validation-gate.js";

const ROLE_INVOCATION_SCHEMA_VERSION = "1.0.0";
const PROTOCOL_VERSION = "1.1.0";

export interface ProofHarnessOptions {
  readonly story: ProofStory;
  readonly modelClient: StructuredModelCaller;
  readonly now?: () => Date;
}

export interface ProofHarnessResult {
  readonly invocation: RoleInvocation;
  readonly roleResult: RoleResult;
  readonly architectureImpact: ArchitectureImpact;
  readonly validationReport: ValidationReport;
}

export async function runProofHarness(options: ProofHarnessOptions): Promise<ProofHarnessResult> {
  const now = options.now ?? (() => new Date());
  const invocation = createProofRoleInvocation(options.story, now());
  const producedArtifacts: ArchitectureImpact[] = [];
  const runner = new ArchitectRoleRunner({
    modelClient: options.modelClient,
    now,
    artifactSink: (artifact) => {
      producedArtifacts.push(artifact);
    },
  });
  const roleResult = await runner.run(invocation, {
    story: proofStoryAsJson(options.story),
    context: options.story.bounded_context,
  });
  const architectureImpact = producedArtifacts[0];
  if (architectureImpact === undefined) {
    throw new Error(`Architect Role did not produce an ArchitectureImpact; status=${roleResult.payload.status}`);
  }
  const validation = await validateProofArchitectureImpact({
    story: options.story,
    candidate: architectureImpact,
    roleResult,
    now,
  });
  return {
    invocation,
    roleResult,
    architectureImpact,
    validationReport: validation.report,
  };
}

export function createProofRoleInvocation(story: ProofStory, createdAtDate: Date): RoleInvocation {
  const createdAt = createdAtDate.toISOString();
  const inputArtifacts: [ArtifactReference, ...ArtifactReference[]] = [storyReference(story)];
  const contextBundleRefs: [ArtifactReference, ...ArtifactReference[]] = [
    {
      ref_type: "artifact",
      id: "context:protocol-proof-dgos-t-0023",
      artifact_type: "ContextBundle",
      schema_version: "1.0.0",
      protocol_version: PROTOCOL_VERSION,
      relation: "read",
    },
  ];
  const payload: RoleInvocation["payload"] = {
    invocation_id: "protocol-proof-dogfood-architect-001",
    role_id: ARCHITECT_ROLE_ID,
    role_version: ARCHITECT_ROLE_VERSION,
    operation: "assess_architecture_impact",
    decision_scope: {
      scope_type: "task" as const,
      scope_id: "DGOS-T-0023",
      objective: "Assess the ArchitectureImpact for the protocol proof's immediate validation-gated dogfood step.",
      constraints: [
        "proof:no_recursive_supervisor",
        "proof:bounded_context_only",
        "proof:single_architecture_impact",
      ],
    },
    input_artifacts: inputArtifacts,
    context_bundle_refs: contextBundleRefs,
    policy_decision_refs: [],
    budget: {
      max_input_tokens: 8000,
      max_output_tokens: 4000,
    },
    model_tier_policy: {
      allowed_tiers: ["standard", "frontier"] as const,
      preferred_tier: "frontier" as const,
      fallback_allowed: true,
    },
    timeout_ms: 60000,
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
        id: "protocol-proof/evidence/dogfood/trace.jsonl",
        relation: "produces",
      },
      trace_id: "trace-protocol-proof-dogfood-architect-001",
    },
  };
  return {
    artifact_id: artifactIdFor("RoleInvocation", createdAt, payload),
    artifact_type: "RoleInvocation",
    schema_version: ROLE_INVOCATION_SCHEMA_VERSION,
    protocol_version: PROTOCOL_VERSION,
    producer: {
      primitive: "loop",
      name: "protocol-proof-harness",
      invocation_id: payload.invocation_id,
    },
    created_at: createdAt,
    source_refs: [storyReference(story)],
    output_refs: [],
    ownership: emptyOwnership(),
    confidence: {
      score: 1,
      level: "high",
      reason_codes: ["proof:e2e_harness"],
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

function storyReference(story: ProofStory): ArtifactReference {
  return {
    ref_type: "artifact",
    id: story.id,
    artifact_type: "Story",
    schema_version: "1.0.0",
    protocol_version: PROTOCOL_VERSION,
    relation: "read",
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

function artifactIdFor(artifactType: string, createdAt: string, payload: object): string {
  const digest = createHash("sha256")
    .update(JSON.stringify({ artifact_type: artifactType, created_at: createdAt, payload }))
    .digest("hex");
  return `artifact:sha256:${digest}`;
}
