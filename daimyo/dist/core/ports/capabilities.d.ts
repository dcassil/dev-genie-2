import type { DecisionRequest, ExecutionEvidence, JsonObject, NodeRef, TaskId, ValidationScope, ValidationStatus } from "../domain.js";
export interface CapabilityTask {
    readonly id: TaskId;
    readonly title: string;
    readonly status: string;
    readonly revision: string;
    readonly body: string;
    readonly acceptanceCriteria: readonly string[];
    readonly metadata?: JsonObject;
    readonly parentId?: TaskId;
}
export interface PlannedTask {
    readonly title: string;
    readonly body: string;
    readonly acceptanceCriteria?: readonly string[];
    readonly metadata?: JsonObject;
}
export interface ValidationRequest {
    readonly task: CapabilityTask;
    readonly node: NodeRef;
    readonly scope: ValidationScope;
    readonly evidence: ExecutionEvidence;
}
export interface ValidationResult {
    readonly status: ValidationStatus;
    readonly reasons: readonly string[];
    readonly report_ref: string;
}
/** Capability port for leaf-local and parent-authoritative validation. */
export interface Validation {
    validate(request: ValidationRequest): Promise<ValidationResult>;
}
export interface RepoIntelligenceQuery {
    readonly taskId: TaskId;
    readonly question: string;
    readonly scope?: readonly string[];
}
export interface RepoIntelligenceResult {
    readonly facts: readonly string[];
    readonly sources: readonly string[];
}
/** Optional capability port for indexed or live repository facts. */
export interface RepoIntelligence {
    query(request: RepoIntelligenceQuery): Promise<RepoIntelligenceResult>;
}
export interface ContextRequest {
    readonly task: CapabilityTask;
    readonly node: NodeRef;
    readonly purpose: "execution" | "validation" | "decision";
}
export interface ContextBundle {
    readonly summary: string;
    readonly artifacts: readonly string[];
    readonly data: JsonObject;
}
/** Optional capability port for assembling bounded task context. */
export interface Context {
    load(request: ContextRequest): Promise<ContextBundle>;
}
export interface PlanningRequest {
    readonly goal: string;
    readonly context?: JsonObject;
}
export interface PlanningResult {
    readonly tasks: readonly PlannedTask[];
    readonly decisions: readonly DecisionRequest[];
}
/** Optional Role/planning capability port. Implementations stay outside core. */
export interface RolesPlanning {
    plan(request: PlanningRequest): Promise<PlanningResult>;
}
