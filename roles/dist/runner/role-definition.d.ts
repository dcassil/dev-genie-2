import type { ArtifactEnvelope, JsonObject, RoleInvocation } from "protocol";
import type { VersionedRolePrompt } from "../prompts/role-prompt.js";
import type { StructuredModelSchema } from "./structured-model.js";
export type AutonomyDomain = "engineering" | "product" | "design";
export interface RoleContext {
    readonly story?: JsonObject;
    readonly context?: JsonObject;
}
export interface ContextProfileRequestArgs {
    readonly invocation: RoleInvocation;
    readonly roleContext: RoleContext;
    readonly definition: RoleDefinition;
}
export interface RoleNormalizeArgs {
    readonly modelArtifact: ArtifactEnvelope;
    readonly invocation: RoleInvocation;
    readonly createdAt: string;
    readonly definition: RoleDefinition;
}
export interface RoleSkipCodes {
    readonly missing_required_output: string;
}
export interface ContextProfile {
    readonly context?: {
        readonly context_bundle_keys?: readonly string[];
    };
    readonly rules: {
        readonly role_contract: string;
        readonly non_goals: readonly string[];
    };
    readonly request: {
        readonly include_operation?: boolean;
        readonly include_decision_scope?: boolean;
        readonly include_output_schema?: boolean;
        readonly fields?: (args: ContextProfileRequestArgs) => JsonObject;
    };
}
export interface RoleDefinition {
    readonly role_id: string;
    readonly role_version: string;
    readonly prompt: VersionedRolePrompt;
    readonly supported_operations: readonly string[];
    readonly expected_output_artifact_type: string;
    readonly expected_output_schema_version: string;
    readonly output: StructuredModelSchema<ArtifactEnvelope>;
    readonly validate_output: (value: ArtifactEnvelope) => boolean;
    readonly validation_errors: () => readonly string[];
    readonly normalize: (args: RoleNormalizeArgs) => ArtifactEnvelope;
    readonly context_profile: ContextProfile;
    readonly autonomy: {
        readonly domain: AutonomyDomain;
    };
    readonly skip_codes?: RoleSkipCodes;
}
