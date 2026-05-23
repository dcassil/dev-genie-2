import type { ArtifactEnvelope, RoleInvocation, RoleResult } from "protocol";
import type { RoleContext, RoleDefinition } from "./role-definition.js";
import type { StructuredModelCaller } from "./structured-model.js";
export declare const ROLE_RUNNER_STATUSES: readonly ["produced", "skipped", "blocked", "needs_human", "failed"];
export interface RoleRunnerOptions<TArtifact extends ArtifactEnvelope, TContext extends RoleContext = RoleContext> {
    readonly definition: RoleDefinition<TArtifact, TContext>;
    readonly modelClient: StructuredModelCaller;
    readonly now?: () => Date;
    readonly artifactSink?: (artifact: TArtifact) => void | Promise<void>;
}
export declare class RoleRunner<TArtifact extends ArtifactEnvelope, TContext extends RoleContext = RoleContext> {
    private readonly definition;
    private readonly modelClient;
    private readonly now;
    private readonly artifactSink;
    constructor(options: RoleRunnerOptions<TArtifact, TContext>);
    run(invocation: RoleInvocation, roleContext: TContext): Promise<RoleResult>;
    private checkedResult;
}
