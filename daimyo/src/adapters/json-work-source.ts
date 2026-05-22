import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { asTaskId } from "../core/domain.js";
import type { ExecutionEvidence, JsonObject, TaskId } from "../core/domain.js";
import type {
  CreateTaskInput,
  WorkSource,
  WorkStatus,
  WorkStatusMapping,
  WorkTask,
  WorkTaskSummary,
} from "../core/ports/work-source.js";
import { assertWorkStatus, isWorkStatus } from "../core/ports/work-source.js";

export type JsonWorkSourceNativeStatus = WorkStatus;

export const jsonWorkSourceStatusMapping: WorkStatusMapping<JsonWorkSourceNativeStatus> = {
  fromNative(status) {
    assertWorkStatus(status);
    return status;
  },
  toNative(status) {
    assertWorkStatus(status);
    return status;
  },
};

export interface JsonWorkSourceOptions {
  readonly filePath: string;
}

interface JsonWorkSourceStore {
  readonly version: 1;
  readonly tasks: readonly JsonWorkTaskRecord[];
}

interface JsonWorkTaskRecord {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly acceptanceCriteria: readonly string[];
  readonly status: JsonWorkSourceNativeStatus;
  readonly revision: string;
  readonly parentId?: string;
  readonly metadata?: JsonObject;
  readonly evidence: readonly ExecutionEvidence[];
}

export class JsonWorkSource implements WorkSource {
  private readonly filePath: string;

  constructor(options: JsonWorkSourceOptions) {
    this.filePath = options.filePath;
  }

  async listTasks(): Promise<readonly WorkTaskSummary[]> {
    const store = await this.readStore();
    return store.tasks.map((task) => {
      const summary: WorkTaskSummary = {
        id: asTaskId(task.id),
        title: task.title,
        status: jsonWorkSourceStatusMapping.fromNative(task.status),
        revision: task.revision,
        ...(task.parentId === undefined ? {} : { parentId: asTaskId(task.parentId) }),
      };
      return summary;
    });
  }

  async getTask(id: TaskId): Promise<WorkTask> {
    const store = await this.readStore();
    return toWorkTask(findTask(store, id));
  }

  async markStatus(
    id: TaskId,
    status: WorkStatus,
    evidence: ExecutionEvidence,
  ): Promise<WorkTask> {
    assertWorkStatus(status);
    const store = await this.readStore();
    const task = findTask(store, id);
    const updatedTask = withRevision({
      ...task,
      status: jsonWorkSourceStatusMapping.toNative(status),
      evidence: [...task.evidence, evidence],
    });
    const updatedStore: JsonWorkSourceStore = {
      version: 1,
      tasks: store.tasks.map((candidate) => (candidate.id === task.id ? updatedTask : candidate)),
    };
    await this.writeStore(updatedStore);
    return toWorkTask(updatedTask);
  }

  async createTask(input: CreateTaskInput, parentId?: TaskId): Promise<TaskId> {
    const store = await this.readStore();
    const id = nextJsonTaskId(input, store.tasks);
    const task = withRevision({
      id,
      title: input.title,
      body: input.body,
      acceptanceCriteria: input.acceptanceCriteria ?? [],
      status: "todo",
      evidence: [],
      revision: "",
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
      ...(parentId === undefined ? {} : { parentId }),
    });
    await this.writeStore({
      version: 1,
      tasks: [...store.tasks, task],
    });
    return asTaskId(id);
  }

  private async readStore(): Promise<JsonWorkSourceStore> {
    const content = await readTextFileIfPresent(this.filePath);
    if (content.trim().length === 0) return { version: 1, tasks: [] };
    const parsed: unknown = JSON.parse(content);
    if (!isJsonWorkSourceStore(parsed)) {
      throw new Error(`Invalid JSON WorkSource file: ${this.filePath}`);
    }
    return parsed;
  }

  private async writeStore(store: JsonWorkSourceStore): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  }
}

function toWorkTask(task: JsonWorkTaskRecord): WorkTask {
  return {
    id: asTaskId(task.id),
    title: task.title,
    status: jsonWorkSourceStatusMapping.fromNative(task.status),
    revision: task.revision,
    body: task.body,
    acceptanceCriteria: task.acceptanceCriteria,
    ...(task.metadata === undefined ? {} : { metadata: task.metadata }),
    ...(task.parentId === undefined ? {} : { parentId: asTaskId(task.parentId) }),
  };
}

function findTask(store: JsonWorkSourceStore, id: TaskId): JsonWorkTaskRecord {
  const task = store.tasks.find((candidate) => candidate.id === id);
  if (task === undefined) throw new Error(`JSON task not found: ${id}`);
  return task;
}

function nextJsonTaskId(
  input: CreateTaskInput,
  tasks: readonly JsonWorkTaskRecord[],
): string {
  const existingIds = new Set(tasks.map((task) => task.id));
  const base = `json-${hash(`${input.title}\n${input.body}`).slice(0, 16)}`;
  if (!existingIds.has(base)) return base;
  for (let index = 2; index < Number.MAX_SAFE_INTEGER; index += 1) {
    const candidate = `${base}-${index}`;
    if (!existingIds.has(candidate)) return candidate;
  }
  throw new Error("Unable to allocate JSON task id");
}

function withRevision(task: JsonWorkTaskRecord): JsonWorkTaskRecord {
  const revisionInput = {
    id: task.id,
    title: task.title,
    body: task.body,
    acceptanceCriteria: task.acceptanceCriteria,
    status: task.status,
    parentId: task.parentId ?? null,
    metadata: task.metadata ?? null,
    evidence: task.evidence,
  };
  return {
    ...task,
    revision: `sha256:${hash(JSON.stringify(revisionInput))}`,
  };
}

function hash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

async function readTextFileIfPresent(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) return "";
    throw error;
  }
}

function isJsonWorkSourceStore(value: unknown): value is JsonWorkSourceStore {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.tasks)) return false;
  return value.tasks.every(isJsonWorkTaskRecord);
}

function isJsonWorkTaskRecord(value: unknown): value is JsonWorkTaskRecord {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.title === "string" &&
    typeof value.body === "string" &&
    Array.isArray(value.acceptanceCriteria) &&
    value.acceptanceCriteria.every((item) => typeof item === "string") &&
    isWorkStatusValue(value.status) &&
    typeof value.revision === "string" &&
    optionalString(value.parentId) &&
    optionalJsonObject(value.metadata) &&
    Array.isArray(value.evidence) &&
    value.evidence.every(isExecutionEvidence)
  );
}

function isWorkStatusValue(value: unknown): value is WorkStatus {
  return typeof value === "string" && isWorkStatus(value);
}

function optionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function optionalStringArray(value: unknown): value is readonly string[] | undefined {
  return value === undefined || (Array.isArray(value) && value.every((item) => typeof item === "string"));
}

function isExecutionEvidence(value: unknown): value is ExecutionEvidence {
  if (!isRecord(value) || typeof value.summary !== "string") return false;
  return optionalStringArray(value.artifacts) && optionalStringArray(value.touchedFiles);
}

function optionalJsonObject(value: unknown): value is JsonObject | undefined {
  return value === undefined || isJsonObject(value);
}

function isJsonObject(value: unknown): value is JsonObject {
  if (!isRecord(value)) return false;
  return Object.values(value).every(isJsonValue);
}

function isJsonValue(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isJsonObject(value);
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return isRecord(error) && error.code === code;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
