import type { ExpectedOutputArtifact, JsonObject, RoleInvocation } from "protocol";

import { artifactReferenceJson, traceRequestJson } from "../runner/artifacts.js";
import type { ContextProfile, RoleContext, RoleDefinition } from "../runner/role-definition.js";
import type { StructuredModelInput } from "../runner/structured-model.js";

export class ContextProfileAssembler {
  assemble(
    invocation: RoleInvocation,
    definition: RoleDefinition,
    roleContext: RoleContext,
  ): StructuredModelInput {
    return {
      context: {
        prompt_id: definition.prompt.id,
        prompt_version: definition.prompt.version,
        prompt_ref: definition.prompt.ref,
        prompt: definition.prompt.text,
        invocation: invocationContext(invocation),
        bounded_context: boundedContextFor(roleContext, definition.context_profile),
      },
      rules: {
        role_contract: definition.context_profile.rules.role_contract,
        non_goals: [...definition.context_profile.rules.non_goals],
        expected_output_artifacts: invocation.payload.expected_output_artifacts.map(
          expectedOutputArtifactJson,
        ),
      },
      request: requestFor(invocation, definition, roleContext),
    };
  }
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

function expectedOutputArtifactJson(reference: ExpectedOutputArtifact): JsonObject {
  return {
    artifact_type: reference.artifact_type,
    schema_version: reference.schema_version,
    required: reference.required,
    ...(reference.relation === undefined ? {} : { relation: reference.relation }),
  };
}

function boundedContextFor(roleContext: RoleContext, profile: ContextProfile): JsonObject {
  const source = roleContext.context ?? {};
  const keys = profile.context?.context_bundle_keys;
  if (keys === undefined) {
    return source;
  }

  const selected: JsonObject = {};
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined) {
      selected[key] = value;
    }
  }
  return selected;
}

function requestFor(
  invocation: RoleInvocation,
  definition: RoleDefinition,
  roleContext: RoleContext,
): JsonObject {
  const request: JsonObject = {};
  if (definition.context_profile.request.include_operation !== false) {
    request.operation = invocation.payload.operation;
  }
  if (definition.context_profile.request.include_decision_scope !== false) {
    request.decision_scope = {
      scope_type: invocation.payload.decision_scope.scope_type,
      scope_id: invocation.payload.decision_scope.scope_id,
      objective: invocation.payload.decision_scope.objective,
      constraints: [...(invocation.payload.decision_scope.constraints ?? [])],
    };
  }

  const fields = definition.context_profile.request.fields?.({
    invocation,
    roleContext,
    definition,
  });
  if (fields !== undefined) {
    for (const [key, value] of Object.entries(fields)) {
      request[key] = value;
    }
  }

  if (definition.context_profile.request.include_output_schema === true) {
    request.output_schema = {
      artifact_type: definition.expected_output_artifact_type,
      schema_version: definition.expected_output_schema_version,
    };
  }
  return request;
}
