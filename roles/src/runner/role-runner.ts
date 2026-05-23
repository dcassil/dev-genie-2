import type {
  ArtifactEnvelope,
  ArtifactReference,
  DiagnosticEntry,
  MissingContext,
  RoleInvocation,
  RoleResult,
  RoleResultPayload,
  RoleSkipReason,
} from "protocol";

import {
  artifactIdFor,
  artifactReferenceFor,
  invocationReference,
  roleResultOwnership,
  traceResult,
} from "./artifacts.js";
import type { RoleContext, RoleDefinition } from "./role-definition.js";
import type { StructuredModelCaller } from "./structured-model.js";
import { isRoleResult, roleResultValidationErrors } from "../schemas/protocol-schemas.js";

const ROLE_RESULT_SCHEMA_VERSION = "1.0.0";

export const ROLE_RUNNER_STATUSES = [
  "produced",
  "skipped",
  "blocked",
  "needs_human",
  "failed",
] as const;

interface RoleResultPayloadObject extends RoleResultPayload {
  readonly [key: string]: unknown;
}

export interface RoleRunnerOptions<
  TArtifact extends ArtifactEnvelope,
  TContext extends RoleContext = RoleContext,
> {
  readonly definition: RoleDefinition<TArtifact, TContext>;
  readonly modelClient: StructuredModelCaller;
  readonly now?: () => Date;
  readonly artifactSink?: (artifact: TArtifact) => void | Promise<void>;
}

export class RoleRunner<
  TArtifact extends ArtifactEnvelope,
  TContext extends RoleContext = RoleContext,
> {
  private readonly definition: RoleDefinition<TArtifact, TContext>;
  private readonly modelClient: StructuredModelCaller;
  private readonly now: () => Date;
  private readonly artifactSink: ((artifact: TArtifact) => void | Promise<void>) | undefined;

  constructor(options: RoleRunnerOptions<TArtifact, TContext>) {
    this.definition = options.definition;
    this.modelClient = options.modelClient;
    this.now = options.now ?? (() => new Date());
    this.artifactSink = options.artifactSink;
  }

  async run(invocation: RoleInvocation, roleContext: TContext): Promise<RoleResult> {
    const createdAt = this.now().toISOString();
    const skipReason = skipReasonFor(invocation, this.definition);
    if (skipReason !== undefined) {
      return this.checkedResult(skippedResult(invocation, this.definition, createdAt, skipReason));
    }

    if (!allowsModelBackedCall(invocation)) {
      return this.checkedResult(
        needsHumanResult(invocation, this.definition, createdAt, {
          code: "model_tier_policy_requires_human",
          ref_type: "policy",
          id: "model_tier_policy",
        }),
      );
    }

    try {
      const modelArtifact = await this.modelClient.call<TArtifact>({
        input: this.definition.buildInput({ invocation, roleContext, definition: this.definition }),
        output: this.definition.output,
      });
      const artifact = this.definition.normalize({
        modelArtifact,
        invocation,
        createdAt,
        definition: this.definition,
      });
      if (!this.definition.validate_output(artifact)) {
        return this.checkedResult(
          blockedResult(
            invocation,
            this.definition,
            createdAt,
            schemaErrorDiagnostics(
              `schema:invalid_${this.definition.expected_output_artifact_type}`,
              this.definition.validation_errors(),
            ),
          ),
        );
      }
      await this.artifactSink?.(artifact);
      return this.checkedResult(producedResult(invocation, this.definition, artifact, createdAt));
    } catch (error) {
      return this.checkedResult(
        blockedResult(invocation, this.definition, createdAt, [
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

function producedResult<TArtifact extends ArtifactEnvelope, TContext extends RoleContext>(
  invocation: RoleInvocation,
  definition: RoleDefinition<TArtifact, TContext>,
  artifact: TArtifact,
  createdAt: string,
): RoleResult {
  const outputArtifact = outputReference(definition, artifact);
  const payload: RoleResultPayloadObject = {
    invocation_id: invocation.payload.invocation_id,
    role_id: invocation.payload.role_id,
    role_version: invocation.payload.role_version,
    status: "produced",
    confidence: artifact.confidence,
    missing_context: [...artifact.diagnostics.missing_context],
    human_review_required: artifact.review_required.required,
    source_artifacts: [...invocation.payload.input_artifacts],
    output_artifacts: [outputArtifact],
    trace: traceResult(invocation),
  };
  return roleResultEnvelope(invocation, definition, createdAt, payload, [outputArtifact], "produced", [], []);
}

function skippedResult<TArtifact extends ArtifactEnvelope, TContext extends RoleContext>(
  invocation: RoleInvocation,
  definition: RoleDefinition<TArtifact, TContext>,
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
  return roleResultEnvelope(invocation, definition, createdAt, payload, [], "skipped", [], []);
}

function needsHumanResult<TArtifact extends ArtifactEnvelope, TContext extends RoleContext>(
  invocation: RoleInvocation,
  definition: RoleDefinition<TArtifact, TContext>,
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
  return roleResultEnvelope(invocation, definition, createdAt, payload, [], "blocked", [], [missingContext]);
}

function blockedResult<TArtifact extends ArtifactEnvelope, TContext extends RoleContext>(
  invocation: RoleInvocation,
  definition: RoleDefinition<TArtifact, TContext>,
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
  return roleResultEnvelope(invocation, definition, createdAt, payload, [], "blocked", errors, []);
}

function roleResultEnvelope<TArtifact extends ArtifactEnvelope, TContext extends RoleContext>(
  invocation: RoleInvocation,
  definition: RoleDefinition<TArtifact, TContext>,
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
      name: definition.role_id,
      version: definition.role_version,
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

function skipReasonFor<TArtifact extends ArtifactEnvelope, TContext extends RoleContext>(
  invocation: RoleInvocation,
  definition: RoleDefinition<TArtifact, TContext>,
): RoleSkipReason | undefined {
  if (invocation.payload.role_id !== definition.role_id) {
    return {
      code: definition.skip_codes?.unsupported_role ?? "role:unsupported_role",
      category: "not_applicable",
      details: {
        requested_role_id: invocation.payload.role_id,
        supported_role_id: definition.role_id,
      },
    };
  }
  if (invocation.payload.role_version !== definition.role_version) {
    return {
      code: "role:unsupported_version",
      category: "policy",
      details: {
        requested_role_version: invocation.payload.role_version,
        supported_role_version: definition.role_version,
      },
    };
  }
  if (!definition.supported_operations.includes(invocation.payload.operation)) {
    return {
      code: "role:unsupported_operation",
      category: "not_applicable",
      details: {
        requested_operation: invocation.payload.operation,
      },
    };
  }
  if (!expectsRequiredOutput(invocation, definition)) {
    return {
      code: definition.skip_codes?.missing_required_output ?? "role:no_required_output_artifact",
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

function expectsRequiredOutput<TArtifact extends ArtifactEnvelope, TContext extends RoleContext>(
  invocation: RoleInvocation,
  definition: RoleDefinition<TArtifact, TContext>,
): boolean {
  return invocation.payload.expected_output_artifacts.some(
    (artifact) =>
      artifact.artifact_type === definition.expected_output_artifact_type &&
      artifact.schema_version === definition.expected_output_schema_version &&
      artifact.required,
  );
}

function allowsModelBackedCall(invocation: RoleInvocation): boolean {
  return invocation.payload.model_tier_policy.allowed_tiers.some(
    (tier) => tier === "small" || tier === "standard" || tier === "frontier",
  );
}

function outputReference<TArtifact extends ArtifactEnvelope, TContext extends RoleContext>(
  definition: RoleDefinition<TArtifact, TContext>,
  artifact: TArtifact,
): ArtifactReference {
  return artifactReferenceFor(
    definition.expected_output_artifact_type,
    definition.expected_output_schema_version,
    artifact.artifact_id,
    artifact.protocol_version,
  );
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
