import type { ArtifactEnvelope, JsonObject, RoleInvocation } from "protocol";

import type { VersionedRolePrompt } from "../prompts/role-prompt.js";
import type { StructuredModelInput, StructuredModelSchema } from "./structured-model.js";

export type AutonomyDomain = "engineering" | "product" | "design";

export interface RoleContext {
  readonly story?: JsonObject;
  readonly context?: JsonObject;
}

export interface RoleBuildInputArgs<
  TArtifact extends ArtifactEnvelope,
  TContext extends RoleContext,
> {
  readonly invocation: RoleInvocation;
  readonly roleContext: TContext;
  readonly definition: RoleDefinition<TArtifact, TContext>;
}

export interface RoleNormalizeArgs<
  TArtifact extends ArtifactEnvelope,
  TContext extends RoleContext,
> {
  readonly modelArtifact: TArtifact;
  readonly invocation: RoleInvocation;
  readonly createdAt: string;
  readonly definition: RoleDefinition<TArtifact, TContext>;
}

export interface RoleSkipCodes {
  readonly unsupported_role: string;
  readonly missing_required_output: string;
}

export interface RoleDefinition<
  TArtifact extends ArtifactEnvelope,
  TContext extends RoleContext = RoleContext,
> {
  readonly role_id: string;
  readonly role_version: string;
  readonly prompt: VersionedRolePrompt;
  readonly supported_operations: readonly string[];
  readonly expected_output_artifact_type: string;
  readonly expected_output_schema_version: string;
  readonly output: StructuredModelSchema<TArtifact>;
  readonly validate_output: (value: TArtifact) => boolean;
  readonly validation_errors: () => readonly string[];
  readonly normalize: (args: RoleNormalizeArgs<TArtifact, TContext>) => TArtifact;
  readonly buildInput: (args: RoleBuildInputArgs<TArtifact, TContext>) => StructuredModelInput;
  readonly autonomy: {
    readonly domain: AutonomyDomain;
  };
  readonly skip_codes?: RoleSkipCodes;
}
