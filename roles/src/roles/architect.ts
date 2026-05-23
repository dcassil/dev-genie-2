import type { ArchitectureImpact, JsonObject, RoleInvocation, RoleResult } from "protocol";

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
  artifactReferenceJson,
  invocationReference,
  traceRequestJson,
} from "../runner/artifacts.js";
import type { RoleContext, RoleDefinition } from "../runner/role-definition.js";
import { RoleRunner } from "../runner/role-runner.js";
import type { StructuredModelCaller, StructuredModelInput } from "../runner/structured-model.js";

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

export const architectRoleDefinition: RoleDefinition<ArchitectureImpact, ArchitectRoleContext> = {
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
  buildInput: ({ invocation, roleContext, definition }) =>
    architectModelInput(invocation, roleContext, definition),
  autonomy: {
    domain: "engineering",
  },
  skip_codes: {
    unsupported_role: "role:not_architect_role",
    missing_required_output: "role:no_required_architecture_impact",
  },
};

export class ArchitectRoleRunner {
  private readonly runner: RoleRunner<ArchitectureImpact, ArchitectRoleContext>;

  constructor(options: ArchitectRoleRunnerOptions) {
    this.runner = new RoleRunner({
      definition: architectRoleDefinition,
      modelClient: options.modelClient,
      ...(options.now === undefined ? {} : { now: options.now }),
      ...(options.artifactSink === undefined ? {} : { artifactSink: options.artifactSink }),
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

function architectModelInput(
  invocation: RoleInvocation,
  roleContext: ArchitectRoleContext,
  definition: RoleDefinition<ArchitectureImpact, ArchitectRoleContext>,
): StructuredModelInput {
  return {
    context: {
      prompt_id: definition.prompt.id,
      prompt_version: definition.prompt.version,
      prompt_ref: definition.prompt.ref,
      prompt: definition.prompt.text,
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
        artifact_type: definition.expected_output_artifact_type,
        schema_version: definition.expected_output_schema_version,
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

function normalizeArchitectureImpact(
  modelImpact: ArchitectureImpact,
  invocation: RoleInvocation,
  createdAt: string,
  definition: RoleDefinition<ArchitectureImpact, ArchitectRoleContext>,
): ArchitectureImpact {
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
