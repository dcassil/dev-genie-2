import type { ArchitectureImpact, JsonObject, RoleInvocation, RoleResult } from "protocol";
import type { RoleContext, RoleDefinition } from "../runner/role-definition.js";
import type { StructuredModelCaller } from "../runner/structured-model.js";
export interface ArchitectRoleContext extends RoleContext {
    readonly story?: JsonObject;
    readonly context?: JsonObject;
}
export interface ArchitectRoleRunnerOptions {
    readonly modelClient: StructuredModelCaller;
    readonly now?: () => Date;
    readonly artifactSink?: (artifact: ArchitectureImpact) => void | Promise<void>;
}
export declare const architectRoleDefinition: RoleDefinition;
export declare class ArchitectRoleRunner {
    private readonly runner;
    constructor(options: ArchitectRoleRunnerOptions);
    run(invocation: RoleInvocation, roleContext?: ArchitectRoleContext): Promise<RoleResult>;
}
export declare function runArchitectRole(invocation: RoleInvocation, options: ArchitectRoleRunnerOptions, roleContext?: ArchitectRoleContext): Promise<RoleResult>;
