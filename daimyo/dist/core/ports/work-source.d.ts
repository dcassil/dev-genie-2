import type { ExecutionEvidence, JsonObject, TaskId } from "../domain.js";
export declare const WORK_STATUSES: readonly ["todo", "active", "done", "blocked"];
export type WorkStatus = (typeof WORK_STATUSES)[number];
export interface WorkStatusMapping<NativeStatus extends string> {
    fromNative(status: NativeStatus): WorkStatus;
    toNative(status: WorkStatus): NativeStatus;
}
export declare function isWorkStatus(value: string): value is WorkStatus;
export declare function assertWorkStatus(value: string): asserts value is WorkStatus;
export interface WorkTaskSummary {
    readonly id: TaskId;
    readonly title: string;
    readonly status: WorkStatus;
    readonly revision: string;
    readonly parentId?: TaskId;
}
export interface WorkTask extends WorkTaskSummary {
    readonly body: string;
    readonly acceptanceCriteria: readonly string[];
    readonly metadata?: JsonObject;
}
export interface CreateTaskInput {
    readonly title: string;
    readonly body: string;
    readonly acceptanceCriteria?: readonly string[];
    readonly metadata?: JsonObject;
}
export interface PatchTaskInput {
    readonly body?: string;
    readonly acceptanceCriteria?: readonly string[];
    readonly metadata?: JsonObject;
}
/**
 * Authority over task definition and LCD task status.
 *
 * `needs-decision` is intentionally not a WorkSource status. Mid-decision
 * state belongs to Daimyo execution state, while task truth stays here.
 */
export interface WorkSource {
    /** List visible tasks with status and revision/etag data for checkpoint diffs. */
    listTasks(): Promise<readonly WorkTaskSummary[]>;
    /** Load the authoritative current task definition. */
    getTask(id: TaskId): Promise<WorkTask>;
    /** Mark LCD task status with evidence from the Supervisor or child session. */
    markStatus(id: TaskId, status: WorkStatus, evidence: ExecutionEvidence): Promise<WorkTask>;
    /** Patch task definition fields on the targeted authoritative task. */
    patchTask(id: TaskId, patch: PatchTaskInput, evidence: ExecutionEvidence): Promise<WorkTask>;
    /** Create follow-up work; it must be visible to the next `listTasks` call. */
    createTask(input: CreateTaskInput, parentId?: TaskId): Promise<TaskId>;
}
