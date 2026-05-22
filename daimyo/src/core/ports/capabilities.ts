import type {
  DecisionRequest,
  ExecutionEvidence,
  JsonObject,
  NodeRef,
  TaskId,
} from "../domain.js";
import type { WorkTask } from "./work-source.js";

export interface ValidationRequest {
  readonly task: WorkTask;
  readonly node: NodeRef;
  readonly evidence: ExecutionEvidence;
}

export interface ValidationResult {
  readonly passed: boolean;
  readonly reasons: readonly string[];
}

/** Capability port for parent-authoritative validation. */
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
  readonly task: WorkTask;
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
  readonly tasks: readonly WorkTask[];
  readonly decisions: readonly DecisionRequest[];
}

/** Optional Role/planning capability port. Implementations stay outside core. */
export interface RolesPlanning {
  plan(request: PlanningRequest): Promise<PlanningResult>;
}
