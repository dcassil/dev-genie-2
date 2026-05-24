import type { ArtifactEnvelope, RoleInvocation, RoleResult } from "protocol";
import { ContextProfileAssembler } from "../assembler/context-profile-assembler.js";
import type { RoleRegistry } from "../registry/role-registry.js";
import type { RoleContext } from "./role-definition.js";
import type { StructuredModelCaller } from "./structured-model.js";
export declare const ROLE_RUNNER_STATUSES: readonly ["produced", "skipped", "blocked", "needs_human", "failed"];
export interface RoleRunnerOptions {
    readonly registry: RoleRegistry;
    readonly modelClient: StructuredModelCaller;
    readonly assembler?: ContextProfileAssembler;
    readonly now?: () => Date;
    readonly artifactSink?: (artifact: ArtifactEnvelope) => void | Promise<void>;
}
export declare class RoleRunner {
    private readonly registry;
    private readonly modelClient;
    private readonly assembler;
    private readonly now;
    private readonly artifactSink;
    constructor(options: RoleRunnerOptions);
    run(invocation: RoleInvocation, roleContext: RoleContext): Promise<RoleResult>;
    private checkedResult;
}
