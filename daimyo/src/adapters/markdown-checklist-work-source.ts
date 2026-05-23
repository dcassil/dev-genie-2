import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { asTaskId } from "../core/domain.js";
import type { ExecutionEvidence, JsonObject, TaskId } from "../core/domain.js";
import type {
  CreateTaskInput,
  PatchTaskInput,
  WorkSource,
  WorkStatus,
  WorkStatusMapping,
  WorkTask,
  WorkTaskSummary,
} from "../core/ports/work-source.js";
import { assertWorkStatus } from "../core/ports/work-source.js";

export const MARKDOWN_CHECKLIST_ID_SCHEME =
  "markdown-checklist:v1: id = md-<sha256(normalized visible item text)[0..16]>-<duplicate occurrence>. " +
  "The id is stable while the visible checklist text is unchanged; editing that text intentionally produces a new id. " +
  "Duplicate items are disambiguated by their occurrence among identical normalized texts.";

export type MarkdownChecklistNativeStatus = "unchecked" | "checked" | "active" | "blocked";

export const markdownChecklistStatusMapping: WorkStatusMapping<MarkdownChecklistNativeStatus> = {
  fromNative(status) {
    switch (status) {
      case "unchecked":
        return "todo";
      case "checked":
        return "done";
      case "active":
        return "active";
      case "blocked":
        return "blocked";
    }
  },
  toNative(status) {
    assertWorkStatus(status);
    switch (status) {
      case "todo":
        return "unchecked";
      case "done":
        return "checked";
      case "active":
        return "active";
      case "blocked":
        return "blocked";
    }
  },
};

export interface MarkdownChecklistWorkSourceOptions {
  readonly filePath: string;
}

interface MarkdownTaskMetadata {
  readonly status?: "active" | "blocked";
  readonly evidence?: ExecutionEvidence;
  readonly body?: string;
  readonly acceptanceCriteria?: readonly string[];
  readonly taskMetadata?: JsonObject;
  readonly parentId?: string;
}

interface MarkdownChecklistEntry {
  readonly id: TaskId;
  readonly lineIndex: number;
  readonly indent: string;
  readonly checked: boolean;
  readonly title: string;
  readonly metadata?: MarkdownTaskMetadata;
}

interface ParsedMarkdownChecklist {
  readonly content: string;
  readonly contentRevision: string;
  readonly lines: readonly string[];
  readonly entries: readonly MarkdownChecklistEntry[];
}

const CHECKLIST_PATTERN = /^(\s*)- \[([ xX])\] (.*)$/;
const METADATA_PATTERN = /^(\s*)<!-- daimyo-work-source: ([A-Za-z0-9_-]+) -->\s*$/;

export class MarkdownChecklistWorkSource implements WorkSource {
  private readonly filePath: string;

  constructor(options: MarkdownChecklistWorkSourceOptions) {
    this.filePath = options.filePath;
  }

  async listTasks(): Promise<readonly WorkTaskSummary[]> {
    const parsed = await this.readChecklist();
    return parsed.entries.map((entry) => {
      const task: WorkTaskSummary = {
        id: entry.id,
        title: entry.title,
        status: statusForEntry(entry),
        revision: parsed.contentRevision,
        ...(entry.metadata?.parentId === undefined
          ? {}
          : { parentId: asTaskId(entry.metadata.parentId) }),
      };
      return task;
    });
  }

  async getTask(id: TaskId): Promise<WorkTask> {
    const parsed = await this.readChecklist();
    const entry = findEntry(parsed, id);
    const task: WorkTask = {
      id: entry.id,
      title: entry.title,
      status: statusForEntry(entry),
      revision: parsed.contentRevision,
      body: entry.metadata?.body ?? entry.title,
      acceptanceCriteria: entry.metadata?.acceptanceCriteria ?? [],
      ...(entry.metadata?.taskMetadata === undefined
        ? {}
        : { metadata: entry.metadata.taskMetadata }),
      ...(entry.metadata?.parentId === undefined
        ? {}
        : { parentId: asTaskId(entry.metadata.parentId) }),
    };
    return task;
  }

  async markStatus(
    id: TaskId,
    status: WorkStatus,
    evidence: ExecutionEvidence,
  ): Promise<WorkTask> {
    assertWorkStatus(status);
    const parsed = await this.readChecklist();
    const entry = findEntry(parsed, id);
    const nativeStatus = markdownChecklistStatusMapping.toNative(status);
    const nextMetadata = withEvidenceAndStatus(entry.metadata, nativeStatus, evidence);
    const nextLines = [...parsed.lines];
    nextLines[entry.lineIndex] = `${entry.indent}- [${nativeStatus === "checked" ? "x" : " "}] ${entry.title}`;
    replaceMetadataLine(nextLines, entry, nextMetadata);
    await this.writeChecklist(nextLines.join("\n"));
    return this.getTask(id);
  }

  async patchTask(
    id: TaskId,
    patch: PatchTaskInput,
    evidence: ExecutionEvidence,
  ): Promise<WorkTask> {
    const parsed = await this.readChecklist();
    const entry = findEntry(parsed, id);
    const nextMetadata: MarkdownTaskMetadata = {
      ...metadataWithoutStatus(entry.metadata),
      evidence,
      body: patch.body ?? entry.metadata?.body ?? entry.title,
      acceptanceCriteria: patch.acceptanceCriteria ?? entry.metadata?.acceptanceCriteria ?? [],
      ...(patch.metadata === undefined
        ? entry.metadata?.taskMetadata === undefined
          ? {}
          : { taskMetadata: entry.metadata.taskMetadata }
        : { taskMetadata: patch.metadata }),
      ...(entry.metadata?.status === undefined ? {} : { status: entry.metadata.status }),
      ...(entry.metadata?.parentId === undefined ? {} : { parentId: entry.metadata.parentId }),
    };
    const nextLines = [...parsed.lines];
    replaceMetadataLine(nextLines, entry, nextMetadata);
    await this.writeChecklist(nextLines.join("\n"));
    return this.getTask(id);
  }

  async createTask(input: CreateTaskInput, parentId?: TaskId): Promise<TaskId> {
    const parsed = await this.readChecklist();
    const normalizedTitle = normalizeTitle(input.title);
    const existingOccurrences = parsed.entries.filter(
      (entry) => normalizeTitle(entry.title) === normalizedTitle,
    ).length;
    const createdId = idForTitle(normalizedTitle, existingOccurrences + 1);
    const metadata: MarkdownTaskMetadata = {
      body: input.body,
      acceptanceCriteria: input.acceptanceCriteria ?? [],
      ...(input.metadata === undefined ? {} : { taskMetadata: input.metadata }),
      ...(parentId === undefined ? {} : { parentId }),
    };
    const line = `- [ ] ${input.title}`;
    const nextContent = appendMarkdownTask(parsed.content, line, buildMetadataLine("  ", metadata));
    await this.writeChecklist(nextContent);
    return createdId;
  }

  private async readChecklist(): Promise<ParsedMarkdownChecklist> {
    const content = await readTextFileIfPresent(this.filePath);
    const lines = content.length === 0 ? [] : content.split("\n");
    const entries = parseEntries(lines);
    return {
      content,
      contentRevision: contentHash(content),
      lines,
      entries,
    };
  }

  private async writeChecklist(content: string): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, content, "utf8");
  }
}

function parseEntries(lines: readonly string[]): readonly MarkdownChecklistEntry[] {
  const entries: MarkdownChecklistEntry[] = [];
  const duplicateCounts = new Map<string, number>();

  lines.forEach((line, lineIndex) => {
    const match = CHECKLIST_PATTERN.exec(line);
    if (match === null) return;
    const indent = requireMatchGroup(match, 1);
    const marker = requireMatchGroup(match, 2);
    const title = requireMatchGroup(match, 3).trim();
    const normalizedTitle = normalizeTitle(title);
    const occurrence = (duplicateCounts.get(normalizedTitle) ?? 0) + 1;
    duplicateCounts.set(normalizedTitle, occurrence);
    entries.push({
      id: idForTitle(normalizedTitle, occurrence),
      lineIndex,
      indent,
      checked: marker.toLowerCase() === "x",
      title,
      ...metadataForNextLine(lines, lineIndex),
    });
  });

  return entries;
}

function statusForEntry(entry: MarkdownChecklistEntry): WorkStatus {
  if (entry.checked) return markdownChecklistStatusMapping.fromNative("checked");
  if (entry.metadata?.status === "active") return markdownChecklistStatusMapping.fromNative("active");
  if (entry.metadata?.status === "blocked") return markdownChecklistStatusMapping.fromNative("blocked");
  return markdownChecklistStatusMapping.fromNative("unchecked");
}

function withEvidenceAndStatus(
  existing: MarkdownTaskMetadata | undefined,
  nativeStatus: MarkdownChecklistNativeStatus,
  evidence: ExecutionEvidence,
): MarkdownTaskMetadata {
  return {
    ...metadataWithoutStatus(existing),
    evidence,
    ...(nativeStatus === "active" || nativeStatus === "blocked" ? { status: nativeStatus } : {}),
  };
}

function metadataWithoutStatus(
  metadata: MarkdownTaskMetadata | undefined,
): Partial<MarkdownTaskMetadata> {
  if (metadata === undefined) return {};
  return {
    ...(metadata.evidence === undefined ? {} : { evidence: metadata.evidence }),
    ...(metadata.body === undefined ? {} : { body: metadata.body }),
    ...(metadata.acceptanceCriteria === undefined
      ? {}
      : { acceptanceCriteria: metadata.acceptanceCriteria }),
    ...(metadata.taskMetadata === undefined ? {} : { taskMetadata: metadata.taskMetadata }),
    ...(metadata.parentId === undefined ? {} : { parentId: metadata.parentId }),
  };
}

function replaceMetadataLine(
  lines: string[],
  entry: MarkdownChecklistEntry,
  metadata: MarkdownTaskMetadata,
): void {
  const metadataIndex = entry.lineIndex + 1;
  const metadataLine = buildMetadataLine(`${entry.indent}  `, metadata);
  if (isMetadataLine(lines[metadataIndex])) {
    lines[metadataIndex] = metadataLine;
    return;
  }
  lines.splice(metadataIndex, 0, metadataLine);
}

function metadataForNextLine(
  lines: readonly string[],
  lineIndex: number,
): { readonly metadata?: MarkdownTaskMetadata } {
  const metadataLine = lines[lineIndex + 1];
  if (metadataLine === undefined) return {};
  const match = METADATA_PATTERN.exec(metadataLine);
  if (match === null) return {};
  const metadata = decodeMetadata(requireMatchGroup(match, 2));
  return metadata === undefined ? {} : { metadata };
}

function buildMetadataLine(indent: string, metadata: MarkdownTaskMetadata): string {
  return `${indent}<!-- daimyo-work-source: ${encodeMetadata(metadata)} -->`;
}

function encodeMetadata(metadata: MarkdownTaskMetadata): string {
  return Buffer.from(JSON.stringify(metadata), "utf8").toString("base64url");
}

function decodeMetadata(encoded: string): MarkdownTaskMetadata | undefined {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!isMarkdownTaskMetadata(parsed)) return undefined;
    return parsed;
  } catch (_error) {
    return undefined;
  }
}

function isMarkdownTaskMetadata(value: unknown): value is MarkdownTaskMetadata {
  if (!isRecord(value)) return false;
  return (
    optionalStatus(value.status) &&
    optionalEvidence(value.evidence) &&
    optionalString(value.body) &&
    optionalStringArray(value.acceptanceCriteria) &&
    optionalJsonObject(value.taskMetadata) &&
    optionalString(value.parentId)
  );
}

function appendMarkdownTask(content: string, taskLine: string, metadataLine: string): string {
  const prefix = content.length === 0 ? "" : content.endsWith("\n") ? content : `${content}\n`;
  return `${prefix}${taskLine}\n${metadataLine}\n`;
}

function findEntry(parsed: ParsedMarkdownChecklist, id: TaskId): MarkdownChecklistEntry {
  const entry = parsed.entries.find((candidate) => candidate.id === id);
  if (entry === undefined) throw new Error(`Markdown checklist task not found: ${id}`);
  return entry;
}

function idForTitle(normalizedTitle: string, occurrence: number): TaskId {
  return asTaskId(`md-${hash(normalizedTitle).slice(0, 16)}-${occurrence}`);
}

function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ");
}

function contentHash(content: string): string {
  return `sha256:${hash(content)}`;
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

function isMetadataLine(line: string | undefined): boolean {
  return line !== undefined && METADATA_PATTERN.test(line);
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return isRecord(error) && error.code === code;
}

function requireMatchGroup(match: RegExpExecArray, index: number): string {
  const value = match[index];
  if (value === undefined) throw new Error(`Expected markdown regex match group ${index}`);
  return value;
}

function optionalStatus(value: unknown): value is "active" | "blocked" | undefined {
  return value === undefined || value === "active" || value === "blocked";
}

function optionalEvidence(value: unknown): value is ExecutionEvidence | undefined {
  return value === undefined || isExecutionEvidence(value);
}

function isExecutionEvidence(value: unknown): value is ExecutionEvidence {
  if (!isRecord(value) || typeof value.summary !== "string") return false;
  return (
    isTouchReport(value.touch_report) &&
    Array.isArray(value.produced_artifact_refs) &&
    value.produced_artifact_refs.every(isArtifactReference) &&
    optionalStringArray(value.intended_files) &&
    optionalStringArray(value.intended_interfaces) &&
    optionalStringArray(value.intended_data) &&
    optionalString(value.report_ref)
  );
}

function isTouchReport(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.task_id === "string" &&
    value.report_type === "touch_report" &&
    Array.isArray(value.touched_files) &&
    value.touched_files.every((item) => typeof item === "string") &&
    Array.isArray(value.touched_interfaces) &&
    value.touched_interfaces.every((item) => typeof item === "string") &&
    Array.isArray(value.touched_data) &&
    value.touched_data.every((item) => typeof item === "string") &&
    Array.isArray(value.touched_workflow_steps) &&
    value.touched_workflow_steps.every((item) => typeof item === "string")
  );
}

function isArtifactReference(value: unknown): boolean {
  return isRecord(value) && typeof value.ref_type === "string" && typeof value.id === "string";
}

function optionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function optionalStringArray(value: unknown): value is readonly string[] | undefined {
  return value === undefined || (Array.isArray(value) && value.every((item) => typeof item === "string"));
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
