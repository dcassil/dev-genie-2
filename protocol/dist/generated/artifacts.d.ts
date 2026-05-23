/**
 * Shared protocol envelope carried by every Dev-Genie runtime artifact. Concrete artifact schemas compose this envelope with an artifact-type-specific payload schema by refining artifact_type and payload through allOf.
 */
export interface ArtifactEnvelope {
    /**
     * REQUIRED string. Content-addressed artifact identity in the form artifact:sha256:<64 lowercase hex characters>. The digest is computed from canonical JSON for the artifact with artifact_id omitted.
     */
    artifact_id: string;
    /**
     * REQUIRED string. Stable artifact catalog name such as ExecutionRecord, ValidationReport, DecisionRequest, DecisionRecord, RoleInvocation, or RoleResult. Concrete schemas refine this with const.
     */
    artifact_type: string;
    /**
     * REQUIRED string. Semantic version of the artifact_type-specific payload schema. This versions payload shape only, not the shared envelope contract.
     */
    schema_version: string;
    /**
     * REQUIRED string. Semantic version of this shared envelope and cross-artifact compatibility contract.
     */
    protocol_version: string;
    producer: Producer;
    /**
     * REQUIRED string. RFC 3339 timestamp for when the producer finalized this artifact.
     */
    created_at: string;
    /**
     * REQUIRED array. Inputs read or depended on to produce this artifact. Each entry names an artifact, file, task, policy, command, config, URL, or external source and may include a content hash for replay/diff validation.
     */
    source_refs: ArtifactReference[];
    /**
     * REQUIRED array. Artifacts or external outputs produced, superseded, or materially affected by this artifact. Each entry may include a content hash so consumers can validate handoff integrity and detect drift.
     */
    output_refs: ArtifactReference[];
    ownership: OwnershipSurface;
    confidence: Confidence;
    review_required: ReviewRequired;
    diagnostics: Diagnostics;
    /**
     * REQUIRED object. Concrete artifact body. Downstream artifact schemas refine this property with their typed payload schema through allOf composition.
     */
    payload: {
        [k: string]: unknown;
    };
}
/**
 * REQUIRED object. Machine-readable producer identity for the Engine, Role, Loop, adapter, or human-originated process that emitted the artifact.
 *
 * This interface was referenced by `ArtifactEnvelope`'s JSON-Schema
 * via the `definition` "producer".
 */
export interface Producer {
    /**
     * REQUIRED string. Runtime primitive class that produced the artifact.
     */
    primitive: "engine" | "role" | "loop" | "adapter" | "human";
    /**
     * REQUIRED string. Stable producer name.
     */
    name: string;
    /**
     * OPTIONAL string. Producer implementation, prompt, or adapter version.
     */
    version?: string;
    /**
     * OPTIONAL string. Correlation id for the producer invocation that emitted this artifact.
     */
    invocation_id?: string;
}
/**
 * Reference to an artifact or external source/output with optional hash metadata.
 *
 * This interface was referenced by `ArtifactEnvelope`'s JSON-Schema
 * via the `definition` "artifactReference".
 */
export interface ArtifactReference {
    /**
     * REQUIRED string. Target class for the referenced input or output.
     */
    ref_type: "artifact" | "file" | "task" | "policy" | "command" | "config" | "url" | "external";
    /**
     * REQUIRED string. Stable id for the target. Artifact refs use artifact_id; file refs use repo-relative paths; URL refs use the canonical URL.
     */
    id: string;
    /**
     * OPTIONAL string. Artifact catalog type when ref_type is artifact.
     */
    artifact_type?: string;
    /**
     * OPTIONAL string. Referenced artifact payload schema version when ref_type is artifact.
     */
    schema_version?: string;
    /**
     * OPTIONAL string. Referenced artifact envelope protocol version when ref_type is artifact.
     */
    protocol_version?: string;
    /**
     * OPTIONAL string. URI or URI-reference for locating the target when the id is not sufficient.
     */
    uri?: string;
    content_hash?: ContentHash;
    /**
     * OPTIONAL string. Machine-readable relation between this artifact and the referenced target.
     */
    relation?: "read" | "derived_from" | "validates" | "produces" | "supersedes" | "patches" | "blocks";
}
/**
 * Machine-readable content hash for replay, diffing, supersession, and handoff integrity checks.
 *
 * This interface was referenced by `ArtifactEnvelope`'s JSON-Schema
 * via the `definition` "contentHash".
 */
export interface ContentHash {
    /**
     * REQUIRED string. Hash algorithm.
     */
    algorithm: "sha256";
    /**
     * REQUIRED string. Lowercase hexadecimal SHA-256 digest.
     */
    value: string;
    /**
     * OPTIONAL string. Canonicalization method used before hashing.
     */
    canonicalization?: "canonical-json-v1" | "raw-bytes";
}
/**
 * REQUIRED object. Declared ownership surface for this artifact. DGOS-T-0015 owns and will expand the referenced subschema.
 */
export interface OwnershipSurface {
    /**
     * REQUIRED array. Repo-relative file paths or glob patterns this artifact declares ownership over.
     */
    owns_files: string[];
    /**
     * REQUIRED array. Interface names, routes, commands, or API contracts this artifact declares ownership over.
     */
    owns_interfaces: string[];
    /**
     * REQUIRED array. Data stores, config keys, or logical data resources this artifact declares ownership over.
     */
    owns_data: string[];
    /**
     * REQUIRED array. Workflow steps this artifact declares ownership over.
     */
    owns_workflow_steps: string[];
    /**
     * OPTIONAL array. Ownership surfaces this artifact depends on but does not own.
     */
    depends_on?: string[];
}
/**
 * REQUIRED object. Machine-readable confidence signal. Use score for numeric comparison and level/codes for policy routing.
 *
 * This interface was referenced by `ArtifactEnvelope`'s JSON-Schema
 * via the `definition` "confidence".
 */
export interface Confidence {
    /**
     * REQUIRED number. Normalized confidence from 0.0 to 1.0.
     */
    score: number;
    /**
     * REQUIRED string. Bucketed confidence for simple consumers.
     */
    level: "low" | "medium" | "high";
    /**
     * OPTIONAL array. Machine-readable reason codes supporting the confidence value.
     */
    reason_codes?: string[];
}
/**
 * REQUIRED object. Machine-readable human or policy review requirement.
 *
 * This interface was referenced by `ArtifactEnvelope`'s JSON-Schema
 * via the `definition` "reviewRequired".
 */
export interface ReviewRequired {
    /**
     * REQUIRED boolean. True when a human or higher-level policy gate must review before the artifact is treated as complete.
     */
    required: boolean;
    /**
     * REQUIRED array. Machine-readable reasons requiring review. Empty when required is false.
     */
    reason_codes: string[];
    /**
     * OPTIONAL array. Policy, config, or decision references that triggered review.
     */
    policy_refs?: ArtifactReference[];
}
/**
 * REQUIRED object. Machine-readable completion, skip, block, failure, warning, and missing-context signals.
 *
 * This interface was referenced by `ArtifactEnvelope`'s JSON-Schema
 * via the `definition` "diagnostics".
 */
export interface Diagnostics {
    /**
     * REQUIRED string. Producer outcome for this artifact.
     */
    status: "produced" | "partial" | "skipped" | "blocked" | "failed";
    /**
     * REQUIRED array. Non-blocking diagnostic codes.
     */
    warnings: DiagnosticEntry[];
    /**
     * REQUIRED array. Blocking or failed diagnostic codes.
     */
    errors: DiagnosticEntry[];
    /**
     * REQUIRED array. Context the producer needed but did not have.
     */
    missing_context: MissingContext[];
}
/**
 * This interface was referenced by `ArtifactEnvelope`'s JSON-Schema
 * via the `definition` "diagnosticEntry".
 */
export interface DiagnosticEntry {
    /**
     * REQUIRED string. Stable diagnostic code.
     */
    code: string;
    /**
     * REQUIRED string. Diagnostic severity.
     */
    severity: "info" | "warning" | "error" | "blocker";
    /**
     * OPTIONAL string. JSON Pointer or repo path associated with this diagnostic.
     */
    path?: string;
    ref?: ArtifactReference;
    /**
     * OPTIONAL JSON value. Structured metadata for the diagnostic; consumers must not parse prose from this field.
     */
    details?: {
        [k: string]: unknown;
    };
}
/**
 * This interface was referenced by `ArtifactEnvelope`'s JSON-Schema
 * via the `definition` "missingContext".
 */
export interface MissingContext {
    /**
     * REQUIRED string. Stable missing-context code.
     */
    code: string;
    /**
     * REQUIRED string. Class of missing context.
     */
    ref_type: "artifact" | "file" | "task" | "policy" | "command" | "config" | "url" | "external";
    /**
     * OPTIONAL string. Stable id for the missing target when known.
     */
    id?: string;
}
