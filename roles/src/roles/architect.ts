import type { ArchitectureImpact, ArtifactEnvelope, JsonObject, RoleInvocation, RoleResult } from "protocol";

import {
  ARCHITECT_ROLE_ID,
  ARCHITECT_ROLE_PROMPT,
  ARCHITECT_ROLE_VERSION,
} from "../prompts/architect-role.js";
import {
  architectureImpactStructuredSchema,
  architectureImpactValidationErrors,
  isArchitectureImpact,
} from "../schemas/protocol-schemas.js";
import {
  artifactIdFor,
  artifactReferenceFor,
  invocationReference,
} from "../runner/artifacts.js";
import type { RoleContext, RoleDefinition } from "../runner/role-definition.js";
import { RoleRunner } from "../runner/role-runner.js";
import { RoleRegistry } from "../registry/role-registry.js";
import type { StructuredModelCaller } from "../runner/structured-model.js";

const ARCHITECTURE_IMPACT_SCHEMA_VERSION = "1.0.0";
const SUPPORTED_OPERATIONS = ["assess_architecture_impact", "architecture_impact"];

export interface ArchitectRoleContext extends RoleContext {
  readonly story?: JsonObject;
  readonly context?: JsonObject;
}

export interface ArchitectRoleRunnerOptions {
  readonly modelClient: StructuredModelCaller;
  readonly now?: () => Date;
  readonly artifactSink?: (artifact: ArchitectureImpact) => void | Promise<void>;
}

export const architectRoleDefinition: RoleDefinition = {
  role_id: ARCHITECT_ROLE_ID,
  role_version: ARCHITECT_ROLE_VERSION,
  prompt: ARCHITECT_ROLE_PROMPT,
  supported_operations: SUPPORTED_OPERATIONS,
  expected_output_artifact_type: "ArchitectureImpact",
  expected_output_schema_version: ARCHITECTURE_IMPACT_SCHEMA_VERSION,
  output: architectureImpactStructuredSchema,
  validate_output: isArchitectureImpact,
  validation_errors: architectureImpactValidationErrors,
  normalize: ({ modelArtifact, invocation, createdAt, definition }) =>
    normalizeArchitectureImpact(modelArtifact, invocation, createdAt, definition),
  context_profile: {
    rules: {
      role_contract:
        "Return exactly one ArchitectureImpact artifact. Do not return prose-only output.",
      non_goals: [
        "no_recursive_supervisor",
        "no_agent_transport",
        "no_tool_use",
        "no_filesystem_or_network_access",
      ],
    },
    request: {
      include_output_schema: true,
      fields: ({ roleContext }) => ({
        story: roleContext.story ?? {},
      }),
    },
  },
  autonomy: {
    domain: "engineering",
  },
  skip_codes: {
    missing_required_output: "role:no_required_architecture_impact",
  },
};

export class ArchitectRoleRunner {
  private readonly runner: RoleRunner;

  constructor(options: ArchitectRoleRunnerOptions) {
    const registry = new RoleRegistry().register(architectRoleDefinition);
    this.runner = new RoleRunner({
      registry,
      modelClient: options.modelClient,
      ...(options.now === undefined ? {} : { now: options.now }),
      ...(options.artifactSink === undefined
        ? {}
        : { artifactSink: architectureImpactSink(options.artifactSink) }),
    });
  }

  async run(invocation: RoleInvocation, roleContext: ArchitectRoleContext = {}): Promise<RoleResult> {
    return this.runner.run(invocation, roleContext);
  }
}

export async function runArchitectRole(
  invocation: RoleInvocation,
  options: ArchitectRoleRunnerOptions,
  roleContext: ArchitectRoleContext = {},
): Promise<RoleResult> {
  return new ArchitectRoleRunner(options).run(invocation, roleContext);
}

function normalizeArchitectureImpact(
  modelImpact: ArtifactEnvelope,
  invocation: RoleInvocation,
  createdAt: string,
  definition: RoleDefinition,
): ArtifactEnvelope {
  const artifactId = artifactIdFor("ArchitectureImpact", createdAt, modelImpact.payload);
  return {
    ...modelImpact,
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

function architectureImpactSink(
  sink: (artifact: ArchitectureImpact) => void | Promise<void>,
): (artifact: ArtifactEnvelope) => void | Promise<void> {
  return (artifact) => {
    if (!isArchitectureImpact(artifact)) {
      throw new Error("Architect artifact sink received a non-ArchitectureImpact artifact");
    }
    return sink(artifact);
  };
}
