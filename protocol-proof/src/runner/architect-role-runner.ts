import { createHash } from "node:crypto";

import type {
  ArtifactReference,
  ArchitectureImpact,
  DiagnosticEntry,
  JsonObject,
  MissingContext,
  OwnershipSurface,
  RoleResult,
  RoleResultPayload,
  RoleSkipReason,
  RoleTraceResult,
  RoleInvocation,
} from "protocol";

import {
  ARCHITECT_ROLE_ID,
  ARCHITECT_ROLE_PROMPT,
  ARCHITECT_ROLE_VERSION,
} from "../prompts/architect-role.js";
import {
  architectureImpactStructuredSchema,
  architectureImpactValidationErrors,
  isArchitectureImpact,
  isRoleResult,
  roleResultValidationErrors,
} from "./protocol-schemas.js";
import type {
  StructuredModelCaller,
  StructuredModelInput,
} from "./structured-model.js";

const ROLE_RESULT_SCHEMA_VERSION = "1.0.0";
const ARCHITECTURE_IMPACT_SCHEMA_VERSION = "1.0.0";
const SUPPORTED_OPERATIONS = ["assess_architecture_impact", "architecture_impact"];

interface RoleResultPayloadObject extends RoleResultPayload {
  readonly [key: string]: unknown;
}

export interface ArchitectRoleContext {
  readonly story?: JsonObject;
  readonly context?: JsonObject;
}

export interface ArchitectRoleRunnerOptions {
  readonly modelClient: StructuredModelCaller;
  readonly now?: () => Date;
  readonly artifactSink?: (artifact: ArchitectureImpact) => void | Promise<void>;
}

export class ArchitectRoleRunner {
  private readonly modelClient: StructuredModelCaller;
  private readonly now: () => Date;
  private readonly artifactSink: ((artifact: ArchitectureImpact) => void | Promise<void>) | undefined;

  constructor(options: ArchitectRoleRunnerOptions) {
    this.modelClient = options.modelClient;
    this.now = options.now ?? (() => new Date());
    this.artifactSink = options.artifactSink;
  }

  async run(invocation: RoleInvocation, roleContext: ArchitectRoleContext = {}): Promise<RoleResult> {
    const createdAt = this.now().toISOString();
    const skipReason = skipReasonFor(invocation);
    if (skipReason !== undefined) {
      return this.checkedResult(skippedResult(invocation, createdAt, skipReason));
    }

    if (!allowsModelBackedCall(invocation)) {
      return this.checkedResult(
        needsHumanResult(invocation, createdAt, {
          code: "model_tier_policy_requires_human",
          ref_type: "policy",
          id: "model_tier_policy",
        }),
      );
    }

    try {
      const modelImpact = await this.modelClient.call<ArchitectureImpact>({
        input: architectModelInput(invocation, roleContext),
        output: architectureImpactStructuredSchema,
      });
      const impact = normalizeArchitectureImpact(modelImpact, invocation, createdAt);
      if (!isArchitectureImpact(impact)) {
        return this.checkedResult(
          blockedResult(
            invocation,
            createdAt,
            schemaErrorDiagnostics("schema:invalid_architecture_impact", architectureImpactValidationErrors()),
          ),
        );
      }
      await this.artifactSink?.(impact);
      return this.checkedResult(producedResult(invocation, impact, createdAt));
    } catch (error) {
      return this.checkedResult(
        blockedResult(invocation, createdAt, [
          {
            code: "structured_model_call_failed",
            severity: "blocker",
            details: {
              message: errorMessage(error),
            },
          },
        ]),
      );
    }
  }

  private checkedResult(result: RoleResult): RoleResult {
    if (isRoleResult(result)) {
      return result;
    }
    throw new Error(`Constructed RoleResult is invalid: ${roleResultValidationErrors().join("; ")}`);
  }
}

export async function runArchitectRole(
  invocation: RoleInvocation,
  options: ArchitectRoleRunnerOptions,
  roleContext: ArchitectRoleContext = {},
): Promise<RoleResult> {
  return new ArchitectRoleRunner(options).run(invocation, roleContext);
}

function architectModelInput(invocation: RoleInvocation, roleContext: ArchitectRoleContext): StructuredModelInput {
  return {
    context: {
      prompt_id: ARCHITECT_ROLE_PROMPT.id,
      prompt_version: ARCHITECT_ROLE_PROMPT.version,
      prompt_ref: ARCHITECT_ROLE_PROMPT.ref,
      prompt: ARCHITECT_ROLE_PROMPT.text,
      invocation: invocationContext(invocation),
      bounded_context: roleContext.context ?? {},
    },
    rules: {
      role_contract:
        "Return exactly one ArchitectureImpact artifact. Do not return prose-only output.",
      non_goals: [
        "no_recursive_supervisor",
        "no_agent_transport",
        "no_tool_use",
        "no_filesystem_or_network_access",
      ],
      expected_output_artifacts: invocation.payload.expected_output_artifacts.map((artifact) => ({
        artifact_type: artifact.artifact_type,
        schema_version: artifact.schema_version,
        required: artifact.required,
        ...(artifact.relation === undefined ? {} : { relation: artifact.relation }),
      })),
    },
    request: {
      operation: invocation.payload.operation,
      decision_scope: {
        scope_type: invocation.payload.decision_scope.scope_type,
        scope_id: invocation.payload.decision_scope.scope_id,
        objective: invocation.payload.decision_scope.objective,
        constraints: [...(invocation.payload.decision_scope.constraints ?? [])],
      },
      story: roleContext.story ?? {},
      output_schema: {
        artifact_type: "ArchitectureImpact",
        schema_version: ARCHITECTURE_IMPACT_SCHEMA_VERSION,
      },
    },
  };
}

function invocationContext(invocation: RoleInvocation): JsonObject {
  return {
    invocation_id: invocation.payload.invocation_id,
    role_id: invocation.payload.role_id,
    role_version: invocation.payload.role_version,
    input_artifacts: invocation.payload.input_artifacts.map(artifactReferenceJson),
    context_bundle_refs: invocation.payload.context_bundle_refs.map(artifactReferenceJson),
    policy_decision_refs: invocation.payload.policy_decision_refs.map(artifactReferenceJson),
    timeout_ms: invocation.payload.timeout_ms,
    allowed_engines: invocation.payload.allowed_engines.map((engine) => ({
      engine_id: engine.engine_id,
      ...(engine.engine_version === undefined ? {} : { engine_version: engine.engine_version }),
      operations: [...(engine.operations ?? [])],
    })),
    allowed_tools: invocation.payload.allowed_tools.map((tool) => ({
      tool_id: tool.tool_id,
      permission: tool.permission,
      ...(tool.restrictions === undefined ? {} : { restrictions: tool.restrictions }),
    })),
    trace: traceRequestJson(invocation),
  };
}

function traceRequestJson(invocation: RoleInvocation): JsonObject {
  return {
    destination: artifactReferenceJson(invocation.payload.trace.destination),
    ...(invocation.payload.trace.trace_id === undefined ? {} : { trace_id: invocation.payload.trace.trace_id }),
  };
}

function normalizeArchitectureImpact(
  modelImpact: ArchitectureImpact,
  invocation: RoleInvocation,
  createdAt: string,
): ArchitectureImpact {
  const artifactId = artifactIdFor("ArchitectureImpact", createdAt, modelImpact.payload);
  return {
    ...modelImpact,
    artifact_id: artifactId,
    schema_version: ARCHITECTURE_IMPACT_SCHEMA_VERSION,
    protocol_version: invocation.protocol_version,
    producer: {
      primitive: "role",
      name: ARCHITECT_ROLE_ID,
      version: ARCHITECT_ROLE_VERSION,
      invocation_id: invocation.payload.invocation_id,
    },
    created_at: createdAt,
    source_refs: [invocationReference(invocation), ...invocation.payload.input_artifacts],
    output_refs: [architectureImpactReference(artifactId, invocation.protocol_version)],
  };
}

function producedResult(invocation: RoleInvocation, impact: ArchitectureImpact, createdAt: string): RoleResult {
  const outputArtifact = architectureImpactReference(impact.artifact_id, impact.protocol_version);
  const payload: RoleResultPayloadObject = {
    invocation_id: invocation.payload.invocation_id,
    role_id: invocation.payload.role_id,
    role_version: invocation.payload.role_version,
    status: "produced",
    confidence: impact.confidence,
    missing_context: [...impact.diagnostics.missing_context],
    human_review_required: impact.review_required.required,
    source_artifacts: [...invocation.payload.input_artifacts],
    output_artifacts: [outputArtifact],
    trace: traceResult(invocation),
  };
  return roleResultEnvelope(invocation, createdAt, payload, [outputArtifact], "produced", [], []);
}

function skippedResult(
  invocation: RoleInvocation,
  createdAt: string,
  skipReason: RoleSkipReason,
): RoleResult {
  const payload: RoleResultPayloadObject = {
    invocation_id: invocation.payload.invocation_id,
    role_id: invocation.payload.role_id,
    role_version: invocation.payload.role_version,
    status: "skipped",
    confidence: { score: 1, level: "high", reason_codes: [skipReason.code] },
    missing_context: [],
    human_review_required: false,
    source_artifacts: [...invocation.payload.input_artifacts],
    output_artifacts: [],
    skip_reason: skipReason,
    trace: traceResult(invocation),
  };
  return roleResultEnvelope(invocation, createdAt, payload, [], "skipped", [], []);
}

function needsHumanResult(
  invocation: RoleInvocation,
  createdAt: string,
  missingContext: MissingContext,
): RoleResult {
  const payload: RoleResultPayloadObject = {
    invocation_id: invocation.payload.invocation_id,
    role_id: invocation.payload.role_id,
    role_version: invocation.payload.role_version,
    status: "needs_human",
    confidence: { score: 0, level: "low", reason_codes: ["role:needs_human"] },
    missing_context: [missingContext],
    human_review_required: true,
    source_artifacts: [...invocation.payload.input_artifacts],
    output_artifacts: [],
    trace: traceResult(invocation),
  };
  return roleResultEnvelope(invocation, createdAt, payload, [], "blocked", [], [missingContext]);
}

function blockedResult(
  invocation: RoleInvocation,
  createdAt: string,
  errors: readonly DiagnosticEntry[],
): RoleResult {
  const payload: RoleResultPayloadObject = {
    invocation_id: invocation.payload.invocation_id,
    role_id: invocation.payload.role_id,
    role_version: invocation.payload.role_version,
    status: "blocked",
    confidence: { score: 0, level: "low", reason_codes: errors.map((error) => error.code) },
    missing_context: [],
    human_review_required: false,
    source_artifacts: [...invocation.payload.input_artifacts],
    output_artifacts: [],
    trace: traceResult(invocation),
    retry_recommendation: {
      recommended: true,
      reason_codes: ["role:structured_output_retry"],
    },
  };
  return roleResultEnvelope(invocation, createdAt, payload, [], "blocked", errors, []);
}

function roleResultEnvelope(
  invocation: RoleInvocation,
  createdAt: string,
  payload: RoleResultPayloadObject,
  outputRefs: readonly ArtifactReference[],
  diagnosticStatus: RoleResult["diagnostics"]["status"],
  errors: readonly DiagnosticEntry[],
  missingContext: readonly MissingContext[],
): RoleResult {
  return {
    artifact_id: artifactIdFor("RoleResult", createdAt, payload),
    artifact_type: "RoleResult",
    schema_version: ROLE_RESULT_SCHEMA_VERSION,
    protocol_version: invocation.protocol_version,
    producer: {
      primitive: "role",
      name: ARCHITECT_ROLE_ID,
      version: ARCHITECT_ROLE_VERSION,
      invocation_id: invocation.payload.invocation_id,
    },
    created_at: createdAt,
    source_refs: [invocationReference(invocation), ...invocation.payload.input_artifacts],
    output_refs: [...outputRefs],
    ownership: roleResultOwnership(),
    confidence: payload.confidence,
    review_required: {
      required: payload.human_review_required,
      reason_codes: payload.human_review_required ? ["role:human_review_required"] : [],
    },
    diagnostics: {
      status: diagnosticStatus,
      warnings: [],
      errors: [...errors],
      missing_context: [...missingContext],
    },
    payload,
  };
}

function skipReasonFor(invocation: RoleInvocation): RoleSkipReason | undefined {
  if (invocation.payload.role_id !== ARCHITECT_ROLE_ID) {
    return {
      code: "role:not_architect_role",
      category: "not_applicable",
      details: {
        requested_role_id: invocation.payload.role_id,
        supported_role_id: ARCHITECT_ROLE_ID,
      },
    };
  }
  if (invocation.payload.role_version !== ARCHITECT_ROLE_VERSION) {
    return {
      code: "role:unsupported_version",
      category: "policy",
      details: {
        requested_role_version: invocation.payload.role_version,
        supported_role_version: ARCHITECT_ROLE_VERSION,
      },
    };
  }
  if (!SUPPORTED_OPERATIONS.includes(invocation.payload.operation)) {
    return {
      code: "role:unsupported_operation",
      category: "not_applicable",
      details: {
        requested_operation: invocation.payload.operation,
      },
    };
  }
  if (!expectsArchitectureImpact(invocation)) {
    return {
      code: "role:no_required_architecture_impact",
      category: "not_applicable",
      details: {
        expected_artifact_types: invocation.payload.expected_output_artifacts.map(
          (artifact) => artifact.artifact_type,
        ),
      },
    };
  }
  return undefined;
}

function expectsArchitectureImpact(invocation: RoleInvocation): boolean {
  return invocation.payload.expected_output_artifacts.some(
    (artifact) =>
      artifact.artifact_type === "ArchitectureImpact" &&
      artifact.schema_version === ARCHITECTURE_IMPACT_SCHEMA_VERSION &&
      artifact.required,
  );
}

function allowsModelBackedCall(invocation: RoleInvocation): boolean {
  return invocation.payload.model_tier_policy.allowed_tiers.some(
    (tier) => tier === "small" || tier === "standard" || tier === "frontier",
  );
}

function architectureImpactReference(artifactId: string, protocolVersion: string): ArtifactReference {
  return {
    ref_type: "artifact",
    id: artifactId,
    artifact_type: "ArchitectureImpact",
    schema_version: ARCHITECTURE_IMPACT_SCHEMA_VERSION,
    protocol_version: protocolVersion,
    relation: "produces",
  };
}

function invocationReference(invocation: RoleInvocation): ArtifactReference {
  return {
    ref_type: "artifact",
    id: invocation.artifact_id,
    artifact_type: "RoleInvocation",
    schema_version: invocation.schema_version,
    protocol_version: invocation.protocol_version,
    relation: "derived_from",
  };
}

function artifactReferenceJson(reference: ArtifactReference): JsonObject {
  return {
    ref_type: reference.ref_type,
    id: reference.id,
    ...(reference.artifact_type === undefined ? {} : { artifact_type: reference.artifact_type }),
    ...(reference.schema_version === undefined ? {} : { schema_version: reference.schema_version }),
    ...(reference.protocol_version === undefined ? {} : { protocol_version: reference.protocol_version }),
    ...(reference.uri === undefined ? {} : { uri: reference.uri }),
    ...(reference.relation === undefined ? {} : { relation: reference.relation }),
  };
}

function traceResult(invocation: RoleInvocation): RoleTraceResult {
  const traceRefs = [invocation.payload.trace.destination];
  if (invocation.payload.trace.trace_id === undefined) {
    return { trace_refs: traceRefs };
  }
  return { trace_refs: traceRefs, trace_id: invocation.payload.trace.trace_id };
}

function roleResultOwnership(): OwnershipSurface {
  return {
    owns_files: [],
    owns_interfaces: ["interface:role-result"],
    owns_data: [],
    owns_workflow_steps: ["workflow:protocol-proof-architect-role"],
  };
}

function artifactIdFor(artifactType: string, createdAt: string, payload: object): string {
  const digest = createHash("sha256")
    .update(JSON.stringify({ artifact_type: artifactType, created_at: createdAt, payload }))
    .digest("hex");
  return `artifact:sha256:${digest}`;
}

function schemaErrorDiagnostics(
  code: string,
  errors: readonly string[],
): readonly DiagnosticEntry[] {
  if (errors.length === 0) {
    return [{ code, severity: "blocker" }];
  }
  return errors.map((message) => ({
    code,
    severity: "blocker",
    details: { message },
  }));
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown structured model call failure";
}
