import type { JsonObject, PlanProposal, RoleInvocation, RoleResult } from "protocol";
import type { RoleContext, RoleDefinition } from "../runner/role-definition.js";
import type { StructuredModelCaller } from "../runner/structured-model.js";
export interface PlannerRoleContext extends RoleContext {
    readonly initiative?: JsonObject;
    readonly goal?: JsonObject;
}
export interface PlannerRoleRunnerOptions {
    readonly modelClient: StructuredModelCaller;
    readonly now?: () => Date;
    readonly artifactSink?: (artifact: PlanProposal) => void | Promise<void>;
}
export declare const plannerRoleDefinition: RoleDefinition;
export declare class PlannerRoleRunner {
    private readonly runner;
    constructor(options: PlannerRoleRunnerOptions);
    run(invocation: RoleInvocation, roleContext?: PlannerRoleContext): Promise<RoleResult>;
}
export declare function runPlannerRole(invocation: RoleInvocation, options: PlannerRoleRunnerOptions, roleContext?: PlannerRoleContext): Promise<RoleResult>;
