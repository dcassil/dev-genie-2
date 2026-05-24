/*
 * GENERATED FILE. Do not edit directly.
 * Regenerate with: npm run codegen
 */

// Source: schemas/architecture-impact.schema.json
/**
 * Envelope-composed architecture impact artifact emitted by an Architect Role for the Protocol Proof MVP. The payload is intentionally small and machine-readable so validation can judge architectural impact without parsing a prose report.
 */
export type ArchitectureImpact = ArtifactEnvelope & {
  artifact_type: "ArchitectureImpact";
  payload: ArchitectureImpactPayload;
  [k: string]: unknown;
};
/**
 * Machine-readable reason code used for routing, policy, review, or adapter decisions.
 *
 * This interface was referenced by `ArtifactEnvelope`'s JSON-Schema
 * via the `definition` "reasonCode".
 */
export type EnvelopeReasonCode = string;
/**
 * Machine-readable reason codes used for routing, policy, review, or adapter decisions.
 *
 * This interface was referenced by `ArtifactEnvelope`'s JSON-Schema
 * via the `definition` "reasonCodes".
 */
export type EnvelopeReasonCodes = EnvelopeReasonCode[];
/**
 * Structured JSON value.
 *
 * This interface was referenced by `ArtifactEnvelope`'s JSON-Schema
 * via the `definition` "jsonValue".
 */
export type ArtifactJsonValue = string | number | boolean | null | ArtifactJsonValue[] | ArtifactJsonObject;
/**
 * Machine-readable reason codes; consumers must not parse prose to understand the decision.
 *
 * @minItems 1
 */
export type ReasonCodes = [ReasonCode, ...ReasonCode[]];
export type ReasonCode = string;
/**
 * Stable lower-case architecture-impact local id.
 */
export type ArchitectureId = string;
/**
 * Risk or impact severity bucket.
 */
export type Severity = "low" | "medium" | "high";

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
 * REQUIRED object. Declared ownership surface for this artifact. This field $refs the reusable ownership-surface sub-schema.
 */
export interface OwnershipSurface {
  /**
   * REQUIRED array. Repo-relative file paths or glob patterns this artifact declares ownership over. File surfaces are intentionally unprefixed unless referenced from depends_on as file:<path>.
   */
  owns_files: string[];
  /**
   * REQUIRED array. Interface, route, command, or API-contract surfaces this artifact declares ownership over. Use HTTP route signatures such as GET /api/example or symbolic interface:<name> identifiers.
   */
  owns_interfaces: string[];
  /**
   * REQUIRED array. Data-store, config, or logical data-resource surfaces this artifact declares ownership over. Use prefixed identifiers such as table:<name> or config:<key>.
   */
  owns_data: string[];
  /**
   * REQUIRED array. Workflow steps this artifact declares ownership over. Use workflow:<step> for cross-artifact references or a domain-scoped step such as admin-settings:save.
   */
  owns_workflow_steps: string[];
  /**
   * OPTIONAL array. Surface identifiers this artifact depends on but does not own. Dependencies must be explicitly prefixed, for example interface:auth-session, workflow:admin-shell-navigation, table:admin_settings, config:admin.settings.*, or file:src/shared/auth.ts.
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
/**
 * Structured JSON object value for metadata; consumers must not parse prose from it.
 *
 * This interface was referenced by `ArtifactEnvelope`'s JSON-Schema
 * via the `definition` "jsonObject".
 */
export interface ArtifactJsonObject {
  [k: string]: ArtifactJsonValue;
}
export interface ArchitectureImpactPayload {
  summary: ArchitectureImpactSummary;
  affected_surfaces: OwnershipSurface1;
  owned_surfaces: OwnershipSurface2;
  /**
   * REQUIRED array. Proposed architectural changes or components. At least one change is required for a produced ArchitectureImpact.
   *
   * @minItems 1
   */
  proposed_changes: [ProposedArchitectureChange, ...ProposedArchitectureChange[]];
  /**
   * REQUIRED array. Machine-readable risks introduced or exposed by the proposed architecture.
   */
  risks: ArchitectureRisk[];
  /**
   * REQUIRED array. Machine-readable chosen-vs-rejected tradeoffs behind the proposed architecture.
   */
  tradeoffs: ArchitectureTradeoff[];
  /**
   * REQUIRED array. Explicit architectural decisions or deferred decisions the proof validation gate can inspect.
   */
  decisions: ArchitectureDecision[];
  /**
   * REQUIRED array. Assumptions the Architect Role relied on when context was incomplete or future validation is needed.
   */
  assumptions: ArchitectureAssumption[];
}
/**
 * REQUIRED object. Compact structured summary of the impact classification; detailed analysis belongs in sibling arrays.
 */
export interface ArchitectureImpactSummary {
  /**
   * REQUIRED string. Overall architectural impact level for routing and review gates.
   */
  impact_level: "none" | "low" | "medium" | "high";
  /**
   * REQUIRED string. Dominant change category.
   */
  primary_change:
    | "preserve_existing_behavior"
    | "extend_existing_surface"
    | "add_new_surface"
    | "change_contract"
    | "deprecate_surface";
  /**
   * REQUIRED string. ADR-1 primitive most directly affected by this impact.
   */
  affected_primitive: "engine" | "role" | "loop" | "artifact" | "adapter" | "workflow" | "none";
  reason_codes: ReasonCodes;
}
/**
 * REQUIRED object. Surfaces the story is expected to affect, using the shared ownership-surface categories for machine comparison.
 */
export interface OwnershipSurface1 {
  /**
   * REQUIRED array. Repo-relative file paths or glob patterns this artifact declares ownership over. File surfaces are intentionally unprefixed unless referenced from depends_on as file:<path>.
   */
  owns_files: string[];
  /**
   * REQUIRED array. Interface, route, command, or API-contract surfaces this artifact declares ownership over. Use HTTP route signatures such as GET /api/example or symbolic interface:<name> identifiers.
   */
  owns_interfaces: string[];
  /**
   * REQUIRED array. Data-store, config, or logical data-resource surfaces this artifact declares ownership over. Use prefixed identifiers such as table:<name> or config:<key>.
   */
  owns_data: string[];
  /**
   * REQUIRED array. Workflow steps this artifact declares ownership over. Use workflow:<step> for cross-artifact references or a domain-scoped step such as admin-settings:save.
   */
  owns_workflow_steps: string[];
  /**
   * OPTIONAL array. Surface identifiers this artifact depends on but does not own. Dependencies must be explicitly prefixed, for example interface:auth-session, workflow:admin-shell-navigation, table:admin_settings, config:admin.settings.*, or file:src/shared/auth.ts.
   */
  depends_on?: string[];
}
/**
 * REQUIRED object. Surfaces this architecture impact artifact claims as its direct architectural scope, using the reusable ownership-surface sub-schema.
 */
export interface OwnershipSurface2 {
  /**
   * REQUIRED array. Repo-relative file paths or glob patterns this artifact declares ownership over. File surfaces are intentionally unprefixed unless referenced from depends_on as file:<path>.
   */
  owns_files: string[];
  /**
   * REQUIRED array. Interface, route, command, or API-contract surfaces this artifact declares ownership over. Use HTTP route signatures such as GET /api/example or symbolic interface:<name> identifiers.
   */
  owns_interfaces: string[];
  /**
   * REQUIRED array. Data-store, config, or logical data-resource surfaces this artifact declares ownership over. Use prefixed identifiers such as table:<name> or config:<key>.
   */
  owns_data: string[];
  /**
   * REQUIRED array. Workflow steps this artifact declares ownership over. Use workflow:<step> for cross-artifact references or a domain-scoped step such as admin-settings:save.
   */
  owns_workflow_steps: string[];
  /**
   * OPTIONAL array. Surface identifiers this artifact depends on but does not own. Dependencies must be explicitly prefixed, for example interface:auth-session, workflow:admin-shell-navigation, table:admin_settings, config:admin.settings.*, or file:src/shared/auth.ts.
   */
  depends_on?: string[];
}
export interface ProposedArchitectureChange {
  change_id: ArchitectureId;
  /**
   * REQUIRED string. Action proposed for the component or surface.
   */
  change_type: "add" | "modify" | "remove" | "deprecate" | "replace";
  component: ArchitectureComponent;
  target_surfaces: OwnershipSurface3;
  rationale_codes: ReasonCodes;
}
export interface ArchitectureComponent {
  /**
   * REQUIRED string. Stable component, package, schema, primitive, workflow, or module name.
   */
  name: string;
  /**
   * REQUIRED string. Component category for downstream validation and routing.
   */
  kind:
    | "package"
    | "module"
    | "schema"
    | "artifact"
    | "engine"
    | "role"
    | "loop"
    | "adapter"
    | "api"
    | "data_store"
    | "workflow"
    | "test"
    | "documentation"
    | "other";
}
/**
 * REQUIRED object. Concrete surfaces targeted by this change.
 */
export interface OwnershipSurface3 {
  /**
   * REQUIRED array. Repo-relative file paths or glob patterns this artifact declares ownership over. File surfaces are intentionally unprefixed unless referenced from depends_on as file:<path>.
   */
  owns_files: string[];
  /**
   * REQUIRED array. Interface, route, command, or API-contract surfaces this artifact declares ownership over. Use HTTP route signatures such as GET /api/example or symbolic interface:<name> identifiers.
   */
  owns_interfaces: string[];
  /**
   * REQUIRED array. Data-store, config, or logical data-resource surfaces this artifact declares ownership over. Use prefixed identifiers such as table:<name> or config:<key>.
   */
  owns_data: string[];
  /**
   * REQUIRED array. Workflow steps this artifact declares ownership over. Use workflow:<step> for cross-artifact references or a domain-scoped step such as admin-settings:save.
   */
  owns_workflow_steps: string[];
  /**
   * OPTIONAL array. Surface identifiers this artifact depends on but does not own. Dependencies must be explicitly prefixed, for example interface:auth-session, workflow:admin-shell-navigation, table:admin_settings, config:admin.settings.*, or file:src/shared/auth.ts.
   */
  depends_on?: string[];
}
export interface ArchitectureRisk {
  risk_id: ArchitectureId;
  /**
   * REQUIRED string. Risk category.
   */
  category: "compatibility" | "validation" | "ownership" | "runtime" | "data" | "security" | "delivery";
  severity: Severity;
  affected_surfaces: OwnershipSurface4;
  /**
   * REQUIRED array. Machine-readable mitigation or follow-up codes. Empty means no mitigation is known yet.
   */
  mitigation_codes: ReasonCode[];
}
/**
 * REQUIRED object. Surfaces exposed to this risk.
 */
export interface OwnershipSurface4 {
  /**
   * REQUIRED array. Repo-relative file paths or glob patterns this artifact declares ownership over. File surfaces are intentionally unprefixed unless referenced from depends_on as file:<path>.
   */
  owns_files: string[];
  /**
   * REQUIRED array. Interface, route, command, or API-contract surfaces this artifact declares ownership over. Use HTTP route signatures such as GET /api/example or symbolic interface:<name> identifiers.
   */
  owns_interfaces: string[];
  /**
   * REQUIRED array. Data-store, config, or logical data-resource surfaces this artifact declares ownership over. Use prefixed identifiers such as table:<name> or config:<key>.
   */
  owns_data: string[];
  /**
   * REQUIRED array. Workflow steps this artifact declares ownership over. Use workflow:<step> for cross-artifact references or a domain-scoped step such as admin-settings:save.
   */
  owns_workflow_steps: string[];
  /**
   * OPTIONAL array. Surface identifiers this artifact depends on but does not own. Dependencies must be explicitly prefixed, for example interface:auth-session, workflow:admin-shell-navigation, table:admin_settings, config:admin.settings.*, or file:src/shared/auth.ts.
   */
  depends_on?: string[];
}
export interface ArchitectureTradeoff {
  tradeoff_id: ArchitectureId;
  /**
   * REQUIRED string. Stable label for the option selected by the architecture.
   */
  chosen_option: string;
  /**
   * REQUIRED array. Stable labels for meaningful alternatives that were not selected.
   *
   * @minItems 1
   */
  rejected_options: [string, ...string[]];
  reason_codes: ReasonCodes;
}
export interface ArchitectureDecision {
  decision_id: ArchitectureId;
  /**
   * REQUIRED string. Decision state at emission time.
   */
  status: "proposed" | "accepted" | "deferred";
  /**
   * REQUIRED string. Stable decision label or short decision statement.
   */
  decision: string;
  applies_to_surfaces: OwnershipSurface5;
  reason_codes: ReasonCodes;
}
/**
 * REQUIRED object. Surfaces governed by this decision.
 */
export interface OwnershipSurface5 {
  /**
   * REQUIRED array. Repo-relative file paths or glob patterns this artifact declares ownership over. File surfaces are intentionally unprefixed unless referenced from depends_on as file:<path>.
   */
  owns_files: string[];
  /**
   * REQUIRED array. Interface, route, command, or API-contract surfaces this artifact declares ownership over. Use HTTP route signatures such as GET /api/example or symbolic interface:<name> identifiers.
   */
  owns_interfaces: string[];
  /**
   * REQUIRED array. Data-store, config, or logical data-resource surfaces this artifact declares ownership over. Use prefixed identifiers such as table:<name> or config:<key>.
   */
  owns_data: string[];
  /**
   * REQUIRED array. Workflow steps this artifact declares ownership over. Use workflow:<step> for cross-artifact references or a domain-scoped step such as admin-settings:save.
   */
  owns_workflow_steps: string[];
  /**
   * OPTIONAL array. Surface identifiers this artifact depends on but does not own. Dependencies must be explicitly prefixed, for example interface:auth-session, workflow:admin-shell-navigation, table:admin_settings, config:admin.settings.*, or file:src/shared/auth.ts.
   */
  depends_on?: string[];
}
export interface ArchitectureAssumption {
  assumption_id: ArchitectureId;
  /**
   * REQUIRED string. Stable label for the assumed fact or constraint.
   */
  subject: string;
  /**
   * REQUIRED string. Confidence bucket for this assumption.
   */
  confidence: "low" | "medium" | "high";
  /**
   * REQUIRED boolean. True when a later validation gate or human must confirm the assumption.
   */
  validation_needed: boolean;
}

// Source: schemas/decision-record.schema.json
/**
 * Envelope-composed ADR-3 sideways-channel durable record for a resolved decision request.
 */
export type DecisionRecord = ArtifactEnvelope & {
  artifact_type: "DecisionRecord";
  payload: DecisionRecordPayload;
  [k: string]: unknown;
};
/**
 * REQUIRED object. Originating DecisionRequest payload.
 */
export type DecisionRequestPayload = PermissionDecisionRequest | RoutingDecisionRequest;
/**
 * Daimyo-compatible JSON value.
 */
export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;
/**
 * Daimyo-compatible bounded integer score.
 *
 * This interface was referenced by `DecisionVerdict`'s JSON-Schema
 * via the `definition` "score0To10".
 */
export type Score0To10 = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
/**
 * REQUIRED integer. Daimyo DecisionTier that resolved the request.
 */
export type DecisionTier = 0 | 1 | 2 | 3;

export interface DecisionRecordPayload {
  /**
   * Protocol snake_case representation of daimyo's DecisionRecord id field.
   */
  decision_id: string;
  request: DecisionRequestPayload;
  verdict: DecisionVerdict;
  tier: DecisionTier;
  /**
   * REQUIRED string. Durable rationale for the verdict and selected tier.
   */
  rationale: string;
}
export interface PermissionDecisionRequest {
  /**
   * Protocol snake_case representation of daimyo's DecisionId-bearing id field.
   */
  decision_id: string;
  /**
   * Protocol snake_case representation of daimyo's NodeId.
   */
  node_id: string;
  /**
   * Protocol snake_case representation of daimyo's TaskId.
   */
  task_id: string;
  surface: "permission";
  /**
   * REQUIRED string. Decision prompt or permission question.
   */
  prompt: string;
  context?: JsonObject;
  /**
   * REQUIRED string. Tool name for the permission-gating surface.
   */
  tool_name: string;
  arguments: JsonObject;
}
/**
 * Daimyo-compatible JSON object value.
 */
export interface JsonObject {
  [k: string]: JsonValue;
}
export interface RoutingDecisionRequest {
  /**
   * Protocol snake_case representation of daimyo's DecisionId-bearing id field.
   */
  decision_id: string;
  /**
   * Protocol snake_case representation of daimyo's NodeId.
   */
  node_id: string;
  /**
   * Protocol snake_case representation of daimyo's TaskId.
   */
  task_id: string;
  surface: "routing";
  /**
   * REQUIRED string. Needs-decision content bubble routed sideways by a parent loop.
   */
  prompt: string;
  context?: JsonObject;
  /**
   * OPTIONAL array. Candidate choices available to the decision-routing surface.
   */
  options?: string[];
}
/**
 * REQUIRED object. Minimal DecisionVerdict payload returned by decision routing.
 */
export interface DecisionVerdict {
  /**
   * REQUIRED string. Verdict category from daimyo's shipped shape.
   */
  type: "decision" | "access" | "human";
  /**
   * REQUIRED string or null. Machine-readable option, action, or access choice suggested by the decision provider.
   */
  suggested_choice: string | null;
  /**
   * REQUIRED string or null. Human-readable response or instruction associated with the suggested choice.
   */
  suggested_response: string | null;
  confidence: Score0To10;
  risk: Score0To10;
  /**
   * REQUIRED boolean. True when the verdict should block execution or escalate instead of proceeding.
   */
  block_trigger: boolean;
}
// Source: schemas/decision-request.schema.json
/**
 * Envelope-composed artifact for a typed escalation from executing work. The payload is a discriminated union that preserves daimyo's mechanically distinct permission and routing surfaces.
 */
export type DecisionRequest = ArtifactEnvelope & {
  artifact_type: "DecisionRequest";
  payload: DecisionRequestPayload;
  [k: string]: unknown;
};


// Source: schemas/execution-record.schema.json
/**
 * Envelope-composed durable execution evidence emitted by a leaf node after bounded work. The payload mirrors daimyo's ExecutionEvidence semantics using protocol snake_case and structured artifact/touch-report refs.
 */
export type ExecutionRecord = ArtifactEnvelope & {
  artifact_type: "ExecutionRecord";
  payload: ExecutionRecordPayload;
  [k: string]: unknown;
};

export interface ExecutionRecordPayload {
  /**
   * REQUIRED string. Protocol snake_case representation of the Daimyo TaskId whose leaf produced this evidence.
   */
  task_id: string;
  /**
   * REQUIRED string. Protocol snake_case representation of the Daimyo NodeId whose leaf produced this evidence.
   */
  node_id: string;
  /**
   * REQUIRED string. Human-readable but durable execution summary from daimyo's ExecutionEvidence.summary field. Consumers must use structured sibling fields for decisions.
   */
  summary: string;
  touch_report: TouchReport;
  /**
   * REQUIRED array. Structured protocol replacement for daimyo's string artifacts field. Empty means the leaf produced no separate durable artifact refs beyond this record.
   */
  produced_artifact_refs: ArtifactReference[];
  /**
   * OPTIONAL string. Daimyo-compatible external or store-local report reference associated with this evidence.
   */
  report_ref?: string;
  /**
   * OPTIONAL array. Protocol snake_case representation of daimyo's intendedFiles field for conservative conflict checks before actual writes.
   */
  intended_files?: string[];
  /**
   * OPTIONAL array. Protocol snake_case representation of daimyo's intendedInterfaces field.
   */
  intended_interfaces?: string[];
  /**
   * OPTIONAL array. Protocol snake_case representation of daimyo's intendedData field.
   */
  intended_data?: string[];
}
/**
 * REQUIRED object. Concrete touched surfaces reported by the leaf, using the reusable DGOS-T-0015 TouchReport sub-schema.
 */
export interface TouchReport {
  /**
   * REQUIRED string. Stable task id for the leaf that produced this report.
   */
  task_id: string;
  /**
   * REQUIRED string. Discriminator for touch-report payloads.
   */
  report_type: "touch_report";
  /**
   * REQUIRED array. Concrete repo-relative files or glob-scoped file surfaces touched by the leaf.
   */
  touched_files: string[];
  /**
   * REQUIRED array. Concrete interface, route, command, or API-contract surfaces touched by the leaf. Use HTTP route signatures such as PUT /api/example or symbolic interface:<name> identifiers.
   */
  touched_interfaces: string[];
  /**
   * REQUIRED array. Concrete data-store, config, or logical data-resource surfaces touched by the leaf. Use prefixed identifiers such as table:<name> or config:<key>.
   */
  touched_data: string[];
  /**
   * REQUIRED array. Concrete workflow steps touched by the leaf. Use workflow:<step> for cross-artifact references or a domain-scoped step such as admin-settings:save.
   */
  touched_workflow_steps: string[];
}
// Source: schemas/plan-proposal.schema.json
/**
 * Envelope-composed Planner Role artifact. The payload is shaped to project onto daimyo's RolesPlanning PlanningResult with snake_case wire fields and no prose parsing.
 */
export type PlanProposal = ArtifactEnvelope & {
  artifact_type: "PlanProposal";
  payload: PlanProposalPayload;
  [k: string]: unknown;
};

/**
 * Planner output that maps to daimyo's PlanningResult: tasks become PlannedTask entries and decision_requests become DecisionRequest payloads.
 */
export interface PlanProposalPayload {
  /**
   * REQUIRED string. Goal or request the Planner decomposed.
   */
  planning_goal: string;
  /**
   * REQUIRED ordered array. Each entry maps losslessly to daimyo's PlannedTask after snake_case to camelCase conversion.
   *
   * @minItems 1
   */
  tasks: [ProposedPlanTask, ...ProposedPlanTask[]];
  /**
   * REQUIRED array. Decision requests the caller must route before or during execution; empty means the plan can proceed without extra decisions.
   */
  decision_requests: DecisionRequestPayload[];
  confidence: Confidence;
  /**
   * REQUIRED array. Context the Planner needed but did not have.
   */
  missing_context: MissingContext[];
  review_required: ReviewRequired;
  reason_codes: EnvelopeReasonCodes;
}
/**
 * One ordered task proposed by the Planner. Field names intentionally mirror PlannedTask with protocol snake_case.
 */
export interface ProposedPlanTask {
  /**
   * OPTIONAL string. Planner-local stable reference for dependency links before a durable task id exists.
   */
  task_ref?: string;
  /**
   * REQUIRED string. Proposed task title.
   */
  title: string;
  /**
   * REQUIRED string. Proposed task objective/body, mapping to PlannedTask.body.
   */
  body: string;
  /**
   * REQUIRED array. Acceptance criteria mapping to PlannedTask.acceptanceCriteria.
   *
   * @minItems 1
   */
  acceptance_criteria: [string, ...string[]];
  /**
   * OPTIONAL array. Planner-local task_refs or existing task ids that must precede this task.
   */
  depends_on?: string[];
  ordering?: PlanTaskOrdering;
  metadata?: ArtifactJsonObject;
}
/**
 * OPTIONAL ordering hints beyond array position for adapters that need explicit before/after constraints.
 */
export interface PlanTaskOrdering {
  /**
   * OPTIONAL array. Planner-local task_refs or existing task ids that should execute before this task.
   */
  after?: string[];
  /**
   * OPTIONAL array. Planner-local task_refs or existing task ids that should execute after this task.
   */
  before?: string[];
  /**
   * OPTIONAL integer. Lower numbers execute earlier when dependencies do not decide ordering.
   */
  priority?: number;
}
// Source: schemas/policy-config.schema.json
/**
 * This interface was referenced by `PolicyConfig`'s JSON-Schema
 * via the `definition` "autonomyLevel".
 */
export type PolicyAutonomyLevel = "always_in_loop" | "big_questions_only" | "delegate";

/**
 * Governance configuration consumed by the Decision Policy Engine. The static_rules member is intentionally permissive until DGOS-T-0039 finalizes detailed rule shape.
 */
export interface PolicyConfig {
  autonomy_profile: PolicyAutonomyProfile;
  /**
   * REQUIRED boolean. False keeps delegated product decisions guarded until the product baseline is approved.
   */
  product_baseline_approved: boolean;
  static_rules: PolicyStaticRules;
}
/**
 * This interface was referenced by `PolicyConfig`'s JSON-Schema
 * via the `definition` "autonomyProfile".
 */
export interface PolicyAutonomyProfile {
  engineering: PolicyAutonomyLevel;
  product: PolicyAutonomyLevel;
  design: PolicyAutonomyLevel;
}
/**
 * Reserved container for structured static allow/deny rules. DGOS-T-0039 narrows this shape.
 *
 * This interface was referenced by `PolicyConfig`'s JSON-Schema
 * via the `definition` "staticRules".
 */
export interface PolicyStaticRules {
  [k: string]: unknown;
}
// Source: schemas/policy-verdict.schema.json
/**
 * Deterministic Decision Policy Engine output. This is the ADR-1 Engine verdict returned by evaluate(input), distinct from daimyo's DecisionVerdict wire payload.
 */
export interface PolicyVerdict {
  /**
   * REQUIRED string. Deterministic policy outcome for the caller.
   */
  outcome: "permit" | "route" | "stop";
  /**
   * REQUIRED string. Sibling or shared-contract conflict classification.
   */
  conflict_class: "no_conflict" | "soft_conflict" | "hard_conflict";
  /**
   * REQUIRED boolean. True when the verdict requires explicit human review before proceeding.
   */
  review_required: boolean;
  /**
   * REQUIRED string or null. Target for routed or stopped decisions.
   */
  route_to: "parent_loop" | "role" | "human" | null;
  /**
   * REQUIRED string. Deterministically classified ADR-4 autonomy domain.
   */
  classified_domain: "engineering" | "product" | "design";
  /**
   * REQUIRED string. Deterministically classified decision scope.
   */
  classified_scope: "local" | "moderate" | "major";
  /**
   * REQUIRED string. Human-readable deterministic rationale for replay and audit.
   */
  rationale: string;
  /**
   * REQUIRED array. Static rule identifiers that materially affected the verdict.
   */
  matched_rule_refs: string[];
  /**
   * REQUIRED string. Decision Policy Engine implementation version.
   */
  engine_version: string;
}
// Source: schemas/review-judgment.schema.json
/**
 * Envelope-composed Quality Governor Role artifact. The payload captures a structured review verdict and reuses ValidationReport completion-decision vocabulary for completion authority and blockers.
 */
export type ReviewJudgment = ArtifactEnvelope & {
  artifact_type: "ReviewJudgment";
  payload: ReviewJudgmentPayload;
  [k: string]: unknown;
};
/**
 * Quality Governor review verdict.
 */
export type ReviewVerdict = "pass" | "fail" | "needs_human";
/**
 * Machine-readable reason codes for blocked completion.
 */
export type BlockingReasonCodes = string[];

/**
 * Quality Governor review judgment with ValidationReport-compatible completion authority and blocker semantics.
 */
export interface ReviewJudgmentPayload {
  review_subject: ArtifactReference;
  verdict: ReviewVerdict;
  /**
   * REQUIRED array. Per-criterion findings supporting the overall verdict.
   *
   * @minItems 1
   */
  criteria: [ReviewCriterionFinding, ...ReviewCriterionFinding[]];
  completion_decision: CompletionDecision;
  blocking_reason_codes: BlockingReasonCodes;
  confidence: Confidence;
  /**
   * REQUIRED array. Context the Quality Governor needed but did not have.
   */
  missing_context: MissingContext[];
  review_required: ReviewRequired;
  /**
   * REQUIRED boolean. True when the Quality Governor requires human review before the caller treats the reviewed work as complete.
   */
  human_review_required: boolean;
  reason_codes: EnvelopeReasonCodes;
}
/**
 * One criterion-level review finding.
 */
export interface ReviewCriterionFinding {
  /**
   * REQUIRED string. Stable criterion identifier.
   */
  criterion_id: string;
  /**
   * REQUIRED string. Human-readable criterion label.
   */
  criterion: string;
  status: ReviewVerdict;
  /**
   * REQUIRED array. Structured finding statements for this criterion.
   */
  findings: string[];
  blocking_reason_codes: BlockingReasonCodes;
  /**
   * REQUIRED array. Artifacts, files, commands, or external sources supporting the finding.
   */
  evidence_refs: ArtifactReference[];
  confidence?: Confidence;
}
/**
 * REQUIRED object. Structured ADR-3 completion judgement; consumers must not infer completion from prose reasons.
 */
export interface CompletionDecision {
  /**
   * REQUIRED boolean. True only when this report is sufficient to mark the validated work complete.
   */
  can_mark_complete: boolean;
  /**
   * REQUIRED string. Whether this result is merely leaf-local evidence or parent-authoritative completion authority.
   */
  authority: "leaf_claim" | "parent_authoritative";
  /**
   * REQUIRED array. Machine-readable blockers when can_mark_complete is false. Empty when the parent report passes and can mark complete.
   */
  blocking_reason_codes: string[];
}
// Source: schemas/role-invocation.schema.json
/**
 * Envelope-composed Role subprocess input artifact. This formalizes DGOS-A-0002's Role Invocation Convention with protocol snake_case fields under the shared artifact envelope.
 */
export type RoleInvocation = ArtifactEnvelope & {
  artifact_type: "RoleInvocation";
  payload: RoleInvocationPayload;
  [k: string]: unknown;
};
/**
 * Structured JSON value.
 */
export type RoleInvocationJsonValue =
  | string
  | number
  | boolean
  | null
  | RoleInvocationJsonValue[]
  | RoleInvocationJsonObject;

export interface RoleInvocationPayload {
  /**
   * REQUIRED string. Stable correlation id for this one-shot Role invocation and its matching RoleResult.
   */
  invocation_id: string;
  /**
   * REQUIRED string. Stable Role identity being invoked.
   */
  role_id: string;
  /**
   * REQUIRED string. Version of the role prompt, profile, and artifact contract.
   */
  role_version: string;
  /**
   * REQUIRED string. Machine-readable operation requested from the Role.
   */
  operation: string;
  decision_scope: RoleDecisionScope;
  /**
   * REQUIRED array. Source artifact references supplied to the Role, including content hashes where available.
   *
   * @minItems 1
   */
  input_artifacts: [ArtifactReference, ...ArtifactReference[]];
  /**
   * REQUIRED array. ContextBundle artifact references bounding the Role's context window.
   *
   * @minItems 1
   */
  context_bundle_refs: [ArtifactReference, ...ArtifactReference[]];
  /**
   * REQUIRED array. Policy, DecisionRecord, or other decision references that constrain this invocation. Empty means no prior policy decision was provided.
   */
  policy_decision_refs: ArtifactReference[];
  budget: RoleInvocationBudget;
  model_tier_policy: ModelTierPolicy;
  /**
   * REQUIRED integer. Caller-enforced timeout in milliseconds.
   */
  timeout_ms: number;
  /**
   * REQUIRED array. Deterministic Engines the Role runner may call. Empty means no Engines are allowed.
   */
  allowed_engines: AllowedEngine[];
  /**
   * REQUIRED array. Tools the Role runner may call behind the subprocess boundary. Empty means no tools are allowed.
   */
  allowed_tools: AllowedTool[];
  /**
   * REQUIRED array. Output artifact schemas the caller expects the Role to produce or reference.
   *
   * @minItems 1
   */
  expected_output_artifacts: [ExpectedOutputArtifact, ...ExpectedOutputArtifact[]];
  trace: RoleTraceRequest;
}
/**
 * REQUIRED object. Machine-readable scope that bounds what the Role is allowed to decide.
 */
export interface RoleDecisionScope {
  /**
   * REQUIRED string. Scope category such as task, initiative, artifact, patch, review, or decision.
   */
  scope_type: "task" | "initiative" | "artifact" | "patch" | "review" | "decision" | "workflow";
  /**
   * REQUIRED string. Stable id of the scoped work, artifact, or decision.
   */
  scope_id: string;
  /**
   * REQUIRED string. Bounded outcome requested from the Role.
   */
  objective: string;
  /**
   * OPTIONAL array. Machine-readable constraints or policy codes for this invocation.
   */
  constraints?: string[];
  /**
   * OPTIONAL array. Prior decisions that shape this scope.
   */
  decision_refs?: ArtifactReference[];
}
/**
 * REQUIRED object. Machine-readable spend and token budget for the Role runner.
 */
export interface RoleInvocationBudget {
  /**
   * OPTIONAL number. Maximum allowed estimated or actual cost in USD.
   */
  max_cost_usd?: number;
  /**
   * OPTIONAL integer. Maximum input tokens available to the Role.
   */
  max_input_tokens?: number;
  /**
   * OPTIONAL integer. Maximum output tokens available to the Role.
   */
  max_output_tokens?: number;
}
/**
 * REQUIRED object. Machine-readable policy for model/provider tier selection.
 */
export interface ModelTierPolicy {
  /**
   * REQUIRED array. Model tiers the Role runner may use.
   *
   * @minItems 1
   */
  allowed_tiers: [
    "deterministic" | "small" | "standard" | "frontier" | "human",
    ...("deterministic" | "small" | "standard" | "frontier" | "human")[]
  ];
  /**
   * OPTIONAL string. Preferred model tier when several allowed tiers are available.
   */
  preferred_tier?: "deterministic" | "small" | "standard" | "frontier" | "human";
  /**
   * REQUIRED boolean. Whether the runner may choose a non-preferred allowed tier.
   */
  fallback_allowed: boolean;
}
export interface AllowedEngine {
  /**
   * REQUIRED string. Stable Engine identity.
   */
  engine_id: string;
  /**
   * OPTIONAL string. Required Engine version or version range.
   */
  engine_version?: string;
  /**
   * OPTIONAL array. Engine operations allowed for this invocation.
   */
  operations?: string[];
}
export interface AllowedTool {
  /**
   * REQUIRED string. Stable tool identity as understood by the Role runner.
   */
  tool_id: string;
  /**
   * REQUIRED string. Permission level granted for this invocation.
   */
  permission: "read_only" | "write" | "deny";
  restrictions?: RoleInvocationJsonObject;
}
/**
 * Structured JSON object; consumers must not parse prose from it.
 */
export interface RoleInvocationJsonObject {
  [k: string]: RoleInvocationJsonValue;
}
export interface ExpectedOutputArtifact {
  /**
   * REQUIRED string. Expected output artifact catalog type.
   */
  artifact_type: string;
  /**
   * REQUIRED string. Expected payload schema version.
   */
  schema_version: string;
  /**
   * REQUIRED boolean. Whether absence of this output blocks the invocation result.
   */
  required: boolean;
  /**
   * OPTIONAL string. Expected relationship to the invocation.
   */
  relation?: "produces" | "patches" | "validates" | "supersedes";
}
/**
 * REQUIRED object. Durable trace destination for invocation logs and related records.
 */
export interface RoleTraceRequest {
  destination: ArtifactReference;
  /**
   * OPTIONAL string. Stable trace id when allocated by the caller.
   */
  trace_id?: string;
}
// Source: schemas/role-result.schema.json
/**
 * Envelope-composed Role subprocess output artifact. This encodes DGOS-A-0001's canonical Role output and the DGOS-A-0002 RoleResult handoff with machine-readable status, confidence, missing context, review, and artifact refs.
 */
export type RoleResult = ArtifactEnvelope & {
  artifact_type: "RoleResult";
  payload: RoleResultPayload;
  [k: string]: unknown;
};
/**
 * ADR-1 canonical Role-result status, aligned with daimyo's DecisionVerdict adapter mapping.
 */
export type RoleResultStatus = "produced" | "skipped" | "blocked" | "needs_human";
/**
 * Structured JSON value.
 */
export type RoleResultJsonValue = string | number | boolean | null | RoleResultJsonValue[] | RoleResultJsonObject;

export interface RoleResultPayload {
  /**
   * REQUIRED string. Correlation id from the matching RoleInvocation.
   */
  invocation_id: string;
  /**
   * REQUIRED string. Stable Role identity that produced this result.
   */
  role_id: string;
  /**
   * REQUIRED string. Version of the role prompt, profile, and artifact contract.
   */
  role_version: string;
  status: RoleResultStatus;
  confidence: Confidence;
  /**
   * REQUIRED array. Machine-readable context the Role needed but did not have.
   */
  missing_context: MissingContext[];
  /**
   * REQUIRED boolean. Daimyo-compatible review gate flag for RoleResult to DecisionVerdict projection.
   */
  human_review_required: boolean;
  /**
   * REQUIRED array. Source artifacts the Role actually consumed or relied on.
   */
  source_artifacts: ArtifactReference[];
  /**
   * REQUIRED array. Output artifacts produced, skipped, blocked, or proposed by this Role result.
   */
  output_artifacts: ArtifactReference[];
  skip_reason?: RoleSkipReason;
  decision_verdict?: DecisionVerdict;
  /**
   * OPTIONAL array. Patches proposed when the Role does not own the target artifact.
   */
  proposed_artifact_patches?: ProposedArtifactPatch[];
  usage?: RoleUsage;
  retry_recommendation?: RetryRecommendation;
  trace: RoleTraceResult;
}
/**
 * OPTIONAL object. Machine-readable reason for status=skipped; consumers must not parse prose.
 */
export interface RoleSkipReason {
  /**
   * REQUIRED string. Stable skip reason code.
   */
  code: string;
  /**
   * REQUIRED string. Skip category for routing and metrics.
   */
  category: "not_applicable" | "duplicate" | "policy" | "missing_context" | "upstream_result";
  ref?: ArtifactReference;
  details?: RoleResultJsonObject;
}
/**
 * Structured JSON object; consumers must not parse prose from it.
 */
export interface RoleResultJsonObject {
  [k: string]: RoleResultJsonValue;
}
/**
 * Machine-readable proposed artifact patch emitted when the Role does not own the target artifact.
 */
export interface ProposedArtifactPatch {
  target: ArtifactReference;
  /**
   * REQUIRED string. Patch format.
   */
  patch_type: "json_patch" | "merge_patch" | "unified_diff" | "artifact_seed";
  patch_ref: ArtifactReference;
}
/**
 * OPTIONAL object. Cost estimate or actual usage when available.
 */
export interface RoleUsage {
  /**
   * OPTIONAL number. Estimated invocation cost in USD.
   */
  estimated_cost_usd?: number;
  /**
   * OPTIONAL number. Actual invocation cost in USD when known.
   */
  actual_cost_usd?: number;
  /**
   * OPTIONAL integer. Input tokens consumed when known.
   */
  input_tokens?: number;
  /**
   * OPTIONAL integer. Output tokens consumed when known.
   */
  output_tokens?: number;
  /**
   * OPTIONAL string. Model/provider identity when available.
   */
  model_id?: string;
}
/**
 * OPTIONAL object. Machine-readable retry guidance from the Role runner.
 */
export interface RetryRecommendation {
  /**
   * REQUIRED boolean. Whether the caller should retry this Role invocation.
   */
  recommended: boolean;
  /**
   * OPTIONAL array. Machine-readable reasons for the retry recommendation.
   */
  reason_codes?: string[];
  /**
   * OPTIONAL integer. Minimum delay before retry.
   */
  after_ms?: number;
}
/**
 * REQUIRED object. Durable trace records emitted by the Role runner.
 */
export interface RoleTraceResult {
  /**
   * REQUIRED array. Trace artifacts, logs, stdout/stderr captures, or external trace ids.
   */
  trace_refs: ArtifactReference[];
  /**
   * OPTIONAL string. Stable trace id allocated by the caller or runner.
   */
  trace_id?: string;
}
// Source: schemas/validation-report.schema.json
/**
 * Envelope-composed authoritative validation result. The payload mirrors daimyo's ValidationReport and ValidationResult fields while making ADR-3 completion authority machine-judgable.
 */
export type ValidationReport = ArtifactEnvelope & {
  artifact_type: "ValidationReport";
  payload: ValidationReportPayload;
  [k: string]: unknown;
};
/**
 * Daimyo-compatible ValidationReport payload. The union encodes ADR-3 completion authority: leaf reports cannot mark complete; parent pass can; parent fail cannot.
 */
export type ValidationReportPayload =
  | LeafValidationReportPayload
  | ParentPassValidationReportPayload
  | ParentFailValidationReportPayload;
/**
 * REQUIRED string. Daimyo-compatible stable reference to the persisted validation report.
 */
export type ReportRef = string;
/**
 * REQUIRED string. Protocol snake_case representation of daimyo's taskId.
 */
export type TaskId = string;
/**
 * REQUIRED string. Protocol snake_case representation of daimyo's nodeId.
 */
export type NodeId = string;
/**
 * Daimyo-compatible validation status.
 */
export type ValidationStatus = "pass" | "fail";
/**
 * REQUIRED array. Daimyo-compatible validation reasons. Consumers may display these but must not parse them for completion decisions.
 */
export type Reasons = string[];
/**
 * Daimyo-compatible evidence-strength indicator distinguishing declared command results from model fallback acceptance checks.
 */
export type ValidationEvidenceStrength = "command" | "model_fallback";
/**
 * Structured JSON value.
 */
export type ValidationReportJsonValue =
  | string
  | number
  | boolean
  | null
  | ValidationReportJsonValue[]
  | ValidationDetails;

export interface LeafValidationReportPayload {
  report_ref: ReportRef;
  task_id: TaskId;
  node_id: NodeId;
  scope: "leaf";
  status: ValidationStatus;
  reasons: Reasons;
  evidence_strength: ValidationEvidenceStrength;
  evidence: ExecutionEvidence;
  details: ValidationDetails;
  completion_decision: LeafCompletionDecision;
}
export interface ExecutionEvidence {
  /**
   * REQUIRED string. Daimyo-compatible execution evidence summary.
   */
  summary: string;
  touch_report: TouchReport;
  /**
   * REQUIRED array. Structured artifact refs corresponding to daimyo's ExecutionEvidence.artifacts values.
   */
  produced_artifact_refs: ArtifactReference[];
  /**
   * OPTIONAL string. External or store-local report reference associated with this evidence.
   */
  report_ref?: string;
  /**
   * OPTIONAL array. Intended file surfaces from daimyo's ExecutionEvidence.intendedFiles.
   */
  intended_files?: string[];
  /**
   * OPTIONAL array. Intended interface surfaces from daimyo's ExecutionEvidence.intendedInterfaces.
   */
  intended_interfaces?: string[];
  /**
   * OPTIONAL array. Intended data surfaces from daimyo's ExecutionEvidence.intendedData.
   */
  intended_data?: string[];
}
/**
 * REQUIRED object. Structured details from the validation engine, such as command exit data or model fallback booleans.
 */
export interface ValidationDetails {
  [k: string]: ValidationReportJsonValue;
}
/**
 * Leaf-scope validation can support a completion claim but cannot mark work complete under ADR-3.
 */
export interface LeafCompletionDecision {
  can_mark_complete: false;
  authority: "leaf_claim";
  blocking_reason_codes: BlockingReasonCodes;
}
export interface ParentPassValidationReportPayload {
  report_ref: ReportRef;
  task_id: TaskId;
  node_id: NodeId;
  scope: "parent";
  status: "pass";
  reasons: Reasons;
  evidence_strength: ValidationEvidenceStrength;
  evidence: ExecutionEvidence;
  details: ValidationDetails;
  completion_decision: ParentPassCompletionDecision;
}
/**
 * Parent-scope pass is the authoritative ADR-3 condition for marking completion.
 */
export interface ParentPassCompletionDecision {
  can_mark_complete: true;
  authority: "parent_authoritative";
  /**
   * @maxItems 0
   */
  blocking_reason_codes: [];
}
export interface ParentFailValidationReportPayload {
  report_ref: ReportRef;
  task_id: TaskId;
  node_id: NodeId;
  scope: "parent";
  status: "fail";
  reasons: Reasons;
  evidence_strength: ValidationEvidenceStrength;
  evidence: ExecutionEvidence;
  details: ValidationDetails;
  completion_decision: ParentFailCompletionDecision;
}
/**
 * Parent-scope fail is authoritative and blocks completion.
 */
export interface ParentFailCompletionDecision {
  can_mark_complete: false;
  authority: "parent_authoritative";
  blocking_reason_codes: BlockingReasonCodes;
}
