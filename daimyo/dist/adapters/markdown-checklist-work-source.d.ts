import type { ExecutionEvidence, TaskId } from "../core/domain.js";
import type { CreateTaskInput, PatchTaskInput, WorkSource, WorkStatus, WorkStatusMapping, WorkTask, WorkTaskSummary } from "../core/ports/work-source.js";
export declare const MARKDOWN_CHECKLIST_ID_SCHEME: string;
export type MarkdownChecklistNativeStatus = "unchecked" | "checked" | "active" | "blocked";
export declare const markdownChecklistStatusMapping: WorkStatusMapping<MarkdownChecklistNativeStatus>;
export interface MarkdownChecklistWorkSourceOptions {
    readonly filePath: string;
}
export declare class MarkdownChecklistWorkSource implements WorkSource {
    private readonly filePath;
    constructor(options: MarkdownChecklistWorkSourceOptions);
    listTasks(): Promise<readonly WorkTaskSummary[]>;
    getTask(id: TaskId): Promise<WorkTask>;
    markStatus(id: TaskId, status: WorkStatus, evidence: ExecutionEvidence): Promise<WorkTask>;
    patchTask(id: TaskId, patch: PatchTaskInput, evidence: ExecutionEvidence): Promise<WorkTask>;
    createTask(input: CreateTaskInput, parentId?: TaskId): Promise<TaskId>;
    private readChecklist;
    private writeChecklist;
}
