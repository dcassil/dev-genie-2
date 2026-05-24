import type { ArtifactEnvelope, JsonObject, JsonValue, RoleInvocation, RoleResult } from "protocol";
import { RoleRegistry } from "../registry/role-registry.js";
import type { RoleContext, RoleDefinition } from "../runner/role-definition.js";
import type { StructuredModelCaller, StructuredModelRequest } from "../runner/structured-model.js";
export type V1RoleHarnessArtifact = JsonObject;
export interface RolesHarnessCase {
    readonly case_name: string;
    readonly definition: RoleDefinition;
    readonly invocation: RoleInvocation;
    readonly roleContext: RoleContext;
    readonly modelArtifact: V1RoleHarnessArtifact;
}
export interface RolesHarnessFlow {
    readonly case_name: string;
    readonly invocation: RoleInvocation;
    readonly roleResult: RoleResult;
    readonly producedArtifact: ArtifactEnvelope;
}
export interface RolesHarnessOptions {
    readonly modelClient?: StructuredModelCaller;
    readonly registry?: RoleRegistry;
    readonly cases?: readonly RolesHarnessCase[];
    readonly now?: () => Date;
}
export interface RolesHarnessResult {
    readonly flows: readonly RolesHarnessFlow[];
}
export declare class DeterministicRolesHarnessModelClient implements StructuredModelCaller {
    private readonly responsesByOutputName;
    readonly outputNames: string[];
    constructor(responsesByOutputName: ReadonlyMap<string, JsonValue>);
    static forCases(cases: readonly RolesHarnessCase[]): DeterministicRolesHarnessModelClient;
    call<T>(request: StructuredModelRequest<T>): Promise<T>;
}
export declare function runRolesHarness(options?: RolesHarnessOptions): Promise<RolesHarnessResult>;
export declare function runRoleHarnessCase(harnessCase: RolesHarnessCase, options?: Pick<RolesHarnessOptions, "modelClient" | "registry" | "now">): Promise<RolesHarnessFlow>;
export declare function createV1RoleRegistry(): RoleRegistry;
export declare function createRegisteredV1RoleHarnessCases(): readonly RolesHarnessCase[];
