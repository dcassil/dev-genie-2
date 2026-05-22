import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  JsonWorkSource,
  MarkdownChecklistWorkSource,
  jsonWorkSourceStatusMapping,
  markdownChecklistStatusMapping,
  MARKDOWN_CHECKLIST_ID_SCHEME,
} from "../../src/adapters/index.js";
import type { WorkSourceConformanceHarness } from "./work-source-conformance.js";
import { defineWorkSourceConformanceSuite } from "./work-source-conformance.js";

const tempDirs: string[] = [];

afterEach(async () => {
  const dirs = tempDirs.splice(0);
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

defineWorkSourceConformanceSuite({
  name: "markdown checklist",
  nativeStatuses: ["unchecked", "checked", "active", "blocked"],
  mapping: markdownChecklistStatusMapping,
  async createHarness() {
    const dir = await makeTempDir("daimyo-md-work-source-");
    const filePath = join(dir, "plan.md");
    return {
      source: new MarkdownChecklistWorkSource({ filePath }),
      async evidenceSummaryWasPersisted(summary) {
        return markdownEvidenceSummaryWasPersisted(await readFile(filePath, "utf8"), summary);
      },
      async dispose() {
        await rm(dir, { recursive: true, force: true });
      },
    } satisfies WorkSourceConformanceHarness;
  },
});

defineWorkSourceConformanceSuite({
  name: "JSON",
  nativeStatuses: ["todo", "active", "done", "blocked"],
  mapping: jsonWorkSourceStatusMapping,
  async createHarness() {
    const dir = await makeTempDir("daimyo-json-work-source-");
    const filePath = join(dir, "tasks.json");
    return {
      source: new JsonWorkSource({ filePath }),
      async evidenceSummaryWasPersisted(summary) {
        return (await readFile(filePath, "utf8")).includes(summary);
      },
      async dispose() {
        await rm(dir, { recursive: true, force: true });
      },
    } satisfies WorkSourceConformanceHarness;
  },
});

describe("MarkdownChecklistWorkSource", () => {
  it("parses checklist tasks with stable ids and toggles done to - [x]", async () => {
    const dir = await makeTempDir("daimyo-md-work-source-");
    const filePath = join(dir, "plan.md");
    await writeFile(
      filePath,
      "# Plan\n\n- [ ] First task\n- [x] Completed task\n",
      "utf8",
    );
    const source = new MarkdownChecklistWorkSource({ filePath });

    const firstList = await source.listTasks();
    const secondList = await source.listTasks();
    const firstTask = firstList.find((task) => task.title === "First task");
    const completedTask = firstList.find((task) => task.title === "Completed task");

    expect(MARKDOWN_CHECKLIST_ID_SCHEME).toContain("sha256(normalized visible item text)");
    expect(firstList.map((task) => task.id)).toEqual(secondList.map((task) => task.id));
    expect(firstTask?.status).toBe("todo");
    expect(completedTask?.status).toBe("done");

    if (firstTask === undefined) throw new Error("Expected first markdown task");
    await source.markStatus(firstTask.id, "done", { summary: "completed from test" });

    await expect(readFile(filePath, "utf8")).resolves.toContain("- [x] First task");
  });

  it("appends newly created tasks to the markdown checklist", async () => {
    const dir = await makeTempDir("daimyo-md-work-source-");
    const filePath = join(dir, "plan.md");
    await writeFile(filePath, "# Plan\n\n- [ ] Existing task\n", "utf8");
    const source = new MarkdownChecklistWorkSource({ filePath });

    const id = await source.createTask({
      title: "Appended task",
      body: "Created through the WorkSource adapter.",
    });

    const content = await readFile(filePath, "utf8");
    const task = await source.getTask(id);
    expect(content.trimEnd().split("\n").at(-2)).toBe("- [ ] Appended task");
    expect(task.title).toBe("Appended task");
  });
});

describe("JsonWorkSource", () => {
  it("stores explicit status, revision, and evidence fields", async () => {
    const dir = await makeTempDir("daimyo-json-work-source-");
    const filePath = join(dir, "tasks.json");
    const source = new JsonWorkSource({ filePath });
    const id = await source.createTask({
      title: "Structured task",
      body: "Persist all fields.",
      acceptanceCriteria: ["has revision"],
    });

    await source.markStatus(id, "blocked", { summary: "waiting on input" });

    const content = await readFile(filePath, "utf8");
    expect(content).toContain('"status": "blocked"');
    expect(content).toContain('"revision": "sha256:');
    expect(content).toContain('"summary": "waiting on input"');
  });
});

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function markdownEvidenceSummaryWasPersisted(content: string, summary: string): boolean {
  const metadataPattern = /<!-- daimyo-work-source: ([A-Za-z0-9_-]+) -->/g;
  for (const match of content.matchAll(metadataPattern)) {
    const encoded = match[1];
    if (encoded === undefined) continue;
    const metadata = decodeMarkdownMetadata(encoded);
    if (metadataContainsEvidenceSummary(metadata, summary)) return true;
  }
  return false;
}

function decodeMarkdownMetadata(encoded: string): unknown {
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch (_error) {
    return undefined;
  }
}

function metadataContainsEvidenceSummary(metadata: unknown, summary: string): boolean {
  return (
    isRecord(metadata) &&
    isRecord(metadata.evidence) &&
    metadata.evidence.summary === summary
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
