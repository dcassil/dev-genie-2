import type { ExecutionEvidence, TaskId } from "../core/domain.js";
import type { CreateTaskInput, PatchTaskInput, WorkSource, WorkStatus, WorkStatusMapping, WorkTask, WorkTaskSummary } from "../core/ports/work-source.js";
export type JsonWorkSourceNativeStatus = WorkStatus;
export declare const jsonWorkSourceStatusMapping: WorkStatusMapping<JsonWorkSourceNativeStatus>;
export interface JsonWorkSourceOptions {
    readonly filePath: string;
}
export declare class JsonWorkSource implements WorkSource {
    private readonly filePath;
    constructor(options: JsonWorkSourceOptions);
    listTasks(): Promise<readonly WorkTaskSummary[]>;
    getTask(id: TaskId): Promise<WorkTask>;
    markStatus(id: TaskId, status: WorkStatus, evidence: ExecutionEvidence): Promise<WorkTask>;
    patchTask(id: TaskId, patch: PatchTaskInput, evidence: ExecutionEvidence): Promise<WorkTask>;
    createTask(input: CreateTaskInput, parentId?: TaskId): Promise<TaskId>;
    private readStore;
    private writeStore;
}
