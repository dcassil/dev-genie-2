import type { ArtifactEnvelope, JsonObject, PlanProposal, RoleInvocation, RoleResult } from "protocol";

import {
  PLANNER_ROLE_ID,
  PLANNER_ROLE_PROMPT,
  PLANNER_ROLE_VERSION,
} from "../prompts/planner-role.js";
import {
  isPlanProposal,
  planProposalStructuredSchema,
  planProposalValidationErrors,
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

const PLAN_PROPOSAL_SCHEMA_VERSION = "1.0.0";
const SUPPORTED_OPERATIONS = ["propose_plan", "decompose_initiative"];

export interface PlannerRoleContext extends RoleContext {
  readonly initiative?: JsonObject;
  readonly goal?: JsonObject;
}

export interface PlannerRoleRunnerOptions {
  readonly modelClient: StructuredModelCaller;
  readonly now?: () => Date;
  readonly artifactSink?: (artifact: PlanProposal) => void | Promise<void>;
}

export const plannerRoleDefinition: RoleDefinition = {
  role_id: PLANNER_ROLE_ID,
  role_version: PLANNER_ROLE_VERSION,
  prompt: PLANNER_ROLE_PROMPT,
  supported_operations: SUPPORTED_OPERATIONS,
  expected_output_artifact_type: "PlanProposal",
  expected_output_schema_version: PLAN_PROPOSAL_SCHEMA_VERSION,
  output: planProposalStructuredSchema,
  validate_output: isPlanProposal,
  validation_errors: planProposalValidationErrors,
  normalize: ({ modelArtifact, invocation, createdAt, definition }) =>
    normalizePlanProposal(modelArtifact, invocation, createdAt, definition),
  context_profile: {
    rules: {
      role_contract: "Return exactly one PlanProposal artifact. Do not return prose-only output.",
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
        planning_goal: invocation.payload.decision_scope.objective,
        constraints: [...(invocation.payload.decision_scope.constraints ?? [])],
        input_artifacts: invocation.payload.input_artifacts.map(artifactReferenceJson),
        bounded_context: roleContext.context ?? {},
      }),
    },
  },
  autonomy: {
    domain: "engineering",
  },
  skip_codes: {
    missing_required_output: "role:no_required_plan_proposal",
  },
};

export class PlannerRoleRunner {
  private readonly runner: RoleRunner;

  constructor(options: PlannerRoleRunnerOptions) {
    const registry = new RoleRegistry().register(plannerRoleDefinition);
    this.runner = new RoleRunner({
      registry,
      modelClient: options.modelClient,
      ...(options.now === undefined ? {} : { now: options.now }),
      ...(options.artifactSink === undefined
        ? {}
        : { artifactSink: planProposalSink(options.artifactSink) }),
    });
  }

  async run(invocation: RoleInvocation, roleContext: PlannerRoleContext = {}): Promise<RoleResult> {
    return this.runner.run(invocation, roleContextForPlanner(roleContext));
  }
}

export async function runPlannerRole(
  invocation: RoleInvocation,
  options: PlannerRoleRunnerOptions,
  roleContext: PlannerRoleContext = {},
): Promise<RoleResult> {
  return new PlannerRoleRunner(options).run(invocation, roleContext);
}

function normalizePlanProposal(
  modelProposal: ArtifactEnvelope,
  invocation: RoleInvocation,
  createdAt: string,
  definition: RoleDefinition,
): ArtifactEnvelope {
  const artifactId = artifactIdFor("PlanProposal", createdAt, modelProposal.payload);
  return {
    ...modelProposal,
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

function planProposalSink(
  sink: (artifact: PlanProposal) => void | Promise<void>,
): (artifact: ArtifactEnvelope) => void | Promise<void> {
  return (artifact) => {
    if (!isPlanProposal(artifact)) {
      throw new Error("Planner artifact sink received a non-PlanProposal artifact");
    }
    return sink(artifact);
  };
}

function roleContextForPlanner(roleContext: PlannerRoleContext): RoleContext {
  const context: JsonObject = { ...(roleContext.context ?? {}) };
  if (roleContext.initiative !== undefined) {
    context.initiative = roleContext.initiative;
  }
  if (roleContext.goal !== undefined) {
    context.goal = roleContext.goal;
  }

  return {
    ...(roleContext.story === undefined ? {} : { story: roleContext.story }),
    context,
  };
}
