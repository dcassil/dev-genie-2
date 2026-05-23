import type { ArtifactReference, JsonObject, OwnershipSurface, RoleInvocation, RoleTraceResult } from "protocol";
export declare function artifactReferenceFor(artifactType: string, schemaVersion: string, artifactId: string, protocolVersion: string): ArtifactReference;
export declare function invocationReference(invocation: RoleInvocation): ArtifactReference;
export declare function artifactReferenceJson(reference: ArtifactReference): JsonObject;
export declare function traceResult(invocation: RoleInvocation): RoleTraceResult;
export declare function traceRequestJson(invocation: RoleInvocation): JsonObject;
export declare function roleResultOwnership(): OwnershipSurface;
export declare function artifactIdFor(artifactType: string, createdAt: string, payload: object): string;
