import type { ArtifactEnvelope, JsonObject, ReviewJudgment, RoleInvocation, RoleResult } from "protocol";

import {
  QUALITY_GOVERNOR_ROLE_ID,
  QUALITY_GOVERNOR_ROLE_PROMPT,
  QUALITY_GOVERNOR_ROLE_VERSION,
} from "../prompts/quality-governor-role.js";
import {
  isReviewJudgment,
  reviewJudgmentStructuredSchema,
  reviewJudgmentValidationErrors,
} from "../schemas/protocol-schemas.js";
import {
  artifactIdFor,
  artifactReferenceFor,
  artifactReferenceJson,
  invocationReference,
} from "../runner/artifacts.js";
import type { RoleContext, RoleDefinition } from "../runner/role-definition.js";
import { RoleRunner } from "../runner/role-runner.js";
import { RoleRegistry } from "../registry/role-registry.js";
import type { StructuredModelCaller } from "../runner/structured-model.js";

const REVIEW_JUDGMENT_SCHEMA_VERSION = "1.0.0";
const SUPPORTED_OPERATIONS = ["review_artifact", "govern_quality"];

export interface QualityGovernorRoleContext extends RoleContext {
  readonly target_artifact?: JsonObject;
  readonly acceptance_criteria?: readonly string[];
  readonly review_context?: JsonObject;
}

export interface QualityGovernorRoleRunnerOptions {
  readonly modelClient: StructuredModelCaller;
  readonly now?: () => Date;
  readonly artifactSink?: (artifact: ReviewJudgment) => void | Promise<void>;
}

export const qualityGovernorRoleDefinition: RoleDefinition = {
  role_id: QUALITY_GOVERNOR_ROLE_ID,
  role_version: QUALITY_GOVERNOR_ROLE_VERSION,
  prompt: QUALITY_GOVERNOR_ROLE_PROMPT,
  supported_operations: SUPPORTED_OPERATIONS,
  expected_output_artifact_type: "ReviewJudgment",
  expected_output_schema_version: REVIEW_JUDGMENT_SCHEMA_VERSION,
  output: reviewJudgmentStructuredSchema,
  validate_output: isReviewJudgment,
  validation_errors: reviewJudgmentValidationErrors,
  normalize: ({ modelArtifact, invocation, createdAt, definition }) =>
    normalizeReviewJudgment(modelArtifact, invocation, createdAt, definition),
  context_profile: {
    rules: {
      role_contract:
        "Return exactly one ReviewJudgment artifact. Judge the target against the acceptance criteria with no prose-only output.",
      non_goals: [
        "no_recursive_supervisor",
        "no_agent_transport",
        "no_tool_use",
        "no_filesystem_or_network_access",
        "no_long_running_state",
      ],
    },
    request: {
      include_output_schema: true,
      fields: ({ invocation, roleContext }) => ({
        review_scope_type: "review",
        target_artifact: targetArtifactFor(invocation, roleContext),
        acceptance_criteria: acceptanceCriteriaFor(roleContext),
        review_context: roleContext.context?.review_context ?? {},
        bounded_context: roleContext.context ?? {},
      }),
    },
  },
  autonomy: {
    domain: "engineering",
  },
  skip_codes: {
    missing_required_output: "role:no_required_review_judgment",
  },
};

export class QualityGovernorRoleRunner {
  private readonly runner: RoleRunner;

  constructor(options: QualityGovernorRoleRunnerOptions) {
    const registry = new RoleRegistry().register(qualityGovernorRoleDefinition);
    this.runner = new RoleRunner({
      registry,
      modelClient: options.modelClient,
      ...(options.now === undefined ? {} : { now: options.now }),
      ...(options.artifactSink === undefined
        ? {}
        : { artifactSink: reviewJudgmentSink(options.artifactSink) }),
    });
  }

  async run(
    invocation: RoleInvocation,
    roleContext: QualityGovernorRoleContext = {},
  ): Promise<RoleResult> {
    return this.runner.run(invocation, roleContextForQualityGovernor(roleContext));
  }
}

export async function runQualityGovernorRole(
  invocation: RoleInvocation,
  options: QualityGovernorRoleRunnerOptions,
  roleContext: QualityGovernorRoleContext = {},
): Promise<RoleResult> {
  return new QualityGovernorRoleRunner(options).run(invocation, roleContext);
}

function normalizeReviewJudgment(
  modelJudgment: ArtifactEnvelope,
  invocation: RoleInvocation,
  createdAt: string,
  definition: RoleDefinition,
): ArtifactEnvelope {
  const artifactId = artifactIdFor("ReviewJudgment", createdAt, modelJudgment.payload);
  return {
    ...modelJudgment,
    artifact_id: artifactId,
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
      artifactReferenceFor(
        definition.expected_output_artifact_type,
        definition.expected_output_schema_version,
        artifactId,
        invocation.protocol_version,
      ),
    ],
  };
}

function reviewJudgmentSink(
  sink: (artifact: ReviewJudgment) => void | Promise<void>,
): (artifact: ArtifactEnvelope) => void | Promise<void> {
  return (artifact) => {
    if (!isReviewJudgment(artifact)) {
      throw new Error("Quality Governor artifact sink received a non-ReviewJudgment artifact");
    }
    return sink(artifact);
  };
}

function roleContextForQualityGovernor(roleContext: QualityGovernorRoleContext): RoleContext {
  const context: JsonObject = { ...(roleContext.context ?? {}) };
  if (roleContext.target_artifact !== undefined) {
    context.target_artifact = roleContext.target_artifact;
  }
  if (roleContext.acceptance_criteria !== undefined) {
    context.acceptance_criteria = [...roleContext.acceptance_criteria];
  }
  if (roleContext.review_context !== undefined) {
    context.review_context = roleContext.review_context;
  }

  return {
    ...(roleContext.story === undefined ? {} : { story: roleContext.story }),
    context,
  };
}

function targetArtifactFor(invocation: RoleInvocation, roleContext: RoleContext): JsonObject {
  const contextTarget = roleContext.context?.target_artifact;
  if (isJsonObject(contextTarget)) {
    return contextTarget;
  }

  const firstInputArtifact = invocation.payload.input_artifacts[0];
  if (firstInputArtifact === undefined) {
    return {};
  }
  return artifactReferenceJson(firstInputArtifact);
}

function acceptanceCriteriaFor(roleContext: RoleContext): string[] {
  const criteria = roleContext.context?.acceptance_criteria;
  if (!Array.isArray(criteria)) {
    return [];
  }
  return criteria.filter(isString);
}

function isJsonObject(value: JsonObject[string] | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: JsonObject[string]): value is string {
  return typeof value === "string";
}
