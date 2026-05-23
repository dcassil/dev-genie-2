import { createHash } from "node:crypto";

import type {
  ArtifactReference,
  JsonObject,
  OwnershipSurface,
  RoleInvocation,
  RoleTraceResult,
} from "protocol";

export function artifactReferenceFor(
  artifactType: string,
  schemaVersion: string,
  artifactId: string,
  protocolVersion: string,
): ArtifactReference {
  return {
    ref_type: "artifact",
    id: artifactId,
    artifact_type: artifactType,
    schema_version: schemaVersion,
    protocol_version: protocolVersion,
    relation: "produces",
  };
}

export function invocationReference(invocation: RoleInvocation): ArtifactReference {
  return {
    ref_type: "artifact",
    id: invocation.artifact_id,
    artifact_type: "RoleInvocation",
    schema_version: invocation.schema_version,
    protocol_version: invocation.protocol_version,
    relation: "derived_from",
  };
}

export function artifactReferenceJson(reference: ArtifactReference): JsonObject {
  return {
    ref_type: reference.ref_type,
    id: reference.id,
    ...(reference.artifact_type === undefined ? {} : { artifact_type: reference.artifact_type }),
    ...(reference.schema_version === undefined ? {} : { schema_version: reference.schema_version }),
    ...(reference.protocol_version === undefined ? {} : { protocol_version: reference.protocol_version }),
    ...(reference.uri === undefined ? {} : { uri: reference.uri }),
    ...(reference.relation === undefined ? {} : { relation: reference.relation }),
  };
}

export function traceResult(invocation: RoleInvocation): RoleTraceResult {
  const traceRefs = [invocation.payload.trace.destination];
  if (invocation.payload.trace.trace_id === undefined) {
    return { trace_refs: traceRefs };
  }
  return { trace_refs: traceRefs, trace_id: invocation.payload.trace.trace_id };
}

export function traceRequestJson(invocation: RoleInvocation): JsonObject {
  return {
    destination: artifactReferenceJson(invocation.payload.trace.destination),
    ...(invocation.payload.trace.trace_id === undefined ? {} : { trace_id: invocation.payload.trace.trace_id }),
  };
}

export function roleResultOwnership(): OwnershipSurface {
  return {
    owns_files: [],
    owns_interfaces: ["interface:role-result"],
    owns_data: [],
    owns_workflow_steps: ["workflow:role-runner"],
  };
}

export function artifactIdFor(artifactType: string, createdAt: string, payload: object): string {
  const digest = createHash("sha256")
    .update(JSON.stringify({ artifact_type: artifactType, created_at: createdAt, payload }))
    .digest("hex");
  return `artifact:sha256:${digest}`;
}
