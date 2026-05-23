import { describe, expect, it } from "vitest";
import type { ExecutionEvidence, JsonObject, TaskId } from "../../src/core/index.js";
import type {
  WorkSource,
  WorkStatusMapping,
  WorkTask,
} from "../../src/core/index.js";
import { asTaskId, makeExecutionEvidence, WORK_STATUSES } from "../../src/core/index.js";

interface WorkSourceRuntimeProbe {
  markStatus(id: TaskId, status: string, evidence: ExecutionEvidence): Promise<WorkTask>;
}

export interface WorkSourceConformanceHarness {
  readonly source: WorkSource;
  evidenceSummaryWasPersisted(summary: string): Promise<boolean>;
  dispose(): Promise<void>;
}

export interface WorkSourceConformanceAdapter<NativeStatus extends string> {
  readonly name: string;
  readonly nativeStatuses: readonly NativeStatus[];
  readonly mapping: WorkStatusMapping<NativeStatus>;
  createHarness(): Promise<WorkSourceConformanceHarness>;
}

const taskSpec = {
  title: "Implement adapter contract",
  body: "Make the created task visible to the next listTasks call.",
  acceptanceCriteria: ["visible after create", "status can be marked"],
  metadata: {
    priority: "p1",
  } satisfies JsonObject,
};

const evidence: ExecutionEvidence = makeExecutionEvidence({
  taskId: asTaskId("task-conformance"),
  summary: "contract status transition verified",
  producedArtifactIds: ["tests/adapters/work-source-conformance.ts"],
  touchedFiles: ["src/adapters/example.ts"],
});

export function defineWorkSourceConformanceSuite<NativeStatus extends string>(
  adapter: WorkSourceConformanceAdapter<NativeStatus>,
): void {
  describe(`${adapter.name} WorkSource conformance`, () => {
    it("round-trips the bidirectional native/LCD status mapping", () => {
      for (const status of WORK_STATUSES) {
        expect(adapter.mapping.fromNative(adapter.mapping.toNative(status))).toBe(status);
      }

      for (const nativeStatus of adapter.nativeStatuses) {
        expect(adapter.mapping.toNative(adapter.mapping.fromNative(nativeStatus))).toBe(nativeStatus);
      }
    });

    it("makes created tasks visible to the next listTasks call", async () => {
      const harness = await adapter.createHarness();
      try {
        const id = await harness.source.createTask(taskSpec);
        const summaries = await harness.source.listTasks();
        const summary = summaries.find((candidate) => candidate.id === id);
        const task = await harness.source.getTask(id);

        expect(summary).toEqual({
          id,
          title: taskSpec.title,
          status: "todo",
          revision: expect.stringMatching(/^(sha256:)?[a-f0-9]{64}$/),
        });
        expect(task).toMatchObject({
          id,
          title: taskSpec.title,
          body: taskSpec.body,
          acceptanceCriteria: taskSpec.acceptanceCriteria,
          metadata: taskSpec.metadata,
          status: "todo",
        });
      } finally {
        await harness.dispose();
      }
    });

    it("persists status transitions and attached evidence", async () => {
      const harness = await adapter.createHarness();
      try {
        const id = await harness.source.createTask(taskSpec);

        for (const status of WORK_STATUSES) {
          await harness.source.markStatus(id, status, evidence);
          const task = await harness.source.getTask(id);
          const summaries = await harness.source.listTasks();
          const summary = summaries.find((candidate) => candidate.id === id);

          expect(task.status).toBe(status);
          expect(summary?.status).toBe(status);
          expect(task.revision.length).toBeGreaterThan(0);
        }

        await expect(harness.evidenceSummaryWasPersisted(evidence.summary)).resolves.toBe(true);
      } finally {
        await harness.dispose();
      }
    });

    it("rejects statuses outside the WorkSource LCD set", async () => {
      const harness = await adapter.createHarness();
      try {
        const id = await harness.source.createTask(taskSpec);
        const runtimeProbe: WorkSourceRuntimeProbe = harness.source;

        await expect(runtimeProbe.markStatus(id, "needs-decision", evidence)).rejects.toThrow(
          /Unsupported WorkSource status "needs-decision"/,
        );
      } finally {
        await harness.dispose();
      }
    });
  });
}
