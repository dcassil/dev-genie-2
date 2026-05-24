import type { JsonObject, ReviewJudgment, RoleInvocation, RoleResult } from "protocol";
import type { RoleContext, RoleDefinition } from "../runner/role-definition.js";
import type { StructuredModelCaller } from "../runner/structured-model.js";
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
export declare const qualityGovernorRoleDefinition: RoleDefinition;
export declare class QualityGovernorRoleRunner {
    private readonly runner;
    constructor(options: QualityGovernorRoleRunnerOptions);
    run(invocation: RoleInvocation, roleContext?: QualityGovernorRoleContext): Promise<RoleResult>;
}
export declare function runQualityGovernorRole(invocation: RoleInvocation, options: QualityGovernorRoleRunnerOptions, roleContext?: QualityGovernorRoleContext): Promise<RoleResult>;
