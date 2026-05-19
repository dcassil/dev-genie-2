import { describe, it, expect, vi } from "vitest";
import { runLoop, type DocStore } from "../../src/workflow/loop.js";
import { FakeDispatcher } from "../../src/workflow/dispatcher.js";
import type { Document } from "../../src/types/document.js";
import { DEFAULT_MODEL_CONFIG } from "../../src/workflow/model-config.js";
import type { GateAdapter, GateAdapterReport } from "../../src/workflow/gate-adapter.js";
import type { DocLookup } from "../../src/workflow/handoff.js";

function mkDoc(over: Partial<Document["frontmatter"]> = {}, body = ""): Document {
  return {
    frontmatter: {
      id: "x", level: "task-high-pass", title: "T", short_code: "KAT-TH-0001" as any,
      subtype: null, created_at: "", updated_at: "", archived: false, tags: [], exit_criteria_met: false,
      phase: "todo", pass: "high", model_tier: "strong", story_id: "KAT-US-0001" as any,
      parent: "KAT-US-0001" as any,
      ...over,
    },
    body, filepath: "/tmp/x.md", file_hash: "0",
  } as Document;
}

function inMemoryStore(initial: Document): DocStore {
  let cur = initial;
  return {
    read: () => cur,
    write: (doc, patch) => {
      cur = {
        ...doc,
        body: patch.body ?? doc.body,
        frontmatter: { ...doc.frontmatter, phase: patch.phase ?? doc.frontmatter.phase },
      };
      return cur;
    },
  };
}

const emptyLookup: DocLookup = { get: () => null };

function gates(seq: boolean[]): GateAdapter {
  let i = 0;
  return {
    async evaluate(): Promise<GateAdapterReport> {
      const ok = seq[i++] ?? true;
      return ok
        ? { ok: true, failures: [], raw: { document: { path: "", short_code: "" }, results: [], ok: true } }
        : { ok: false, failures: [{ gate: "g", code: "x", message: "nope" }], raw: { document: { path: "", short_code: "" }, results: [], ok: false } };
    },
  };
}

describe("runLoop happy path", () => {
  it("completes on first iteration when gates pass", async () => {
    const doc = mkDoc();
    const store = inMemoryStore(doc);
    const trace = await runLoop({
      doc, store, lookup: emptyLookup,
      dispatcher: new FakeDispatcher([{ appendOnDispatch: "\n## Goal\nx" }]),
      gates: gates([true]),
      config: DEFAULT_MODEL_CONFIG,
    });
    expect(trace.outcome.kind).toBe("completed");
    expect(trace.iterations.length).toBe(1);
    expect(store.read("KAT-TH-0001" as any).frontmatter.phase).toBe("completed");
  });

  it("retries then completes", async () => {
    const doc = mkDoc();
    const trace = await runLoop({
      doc, store: inMemoryStore(doc), lookup: emptyLookup,
      dispatcher: new FakeDispatcher([{ appendOnDispatch: "a" }, { appendOnDispatch: "b" }]),
      gates: gates([false, true]),
      config: DEFAULT_MODEL_CONFIG,
    });
    expect(trace.outcome.kind).toBe("completed");
    expect(trace.iterations.length).toBe(2);
  });
});

describe("runLoop block paths", () => {
  it("blocks with max-iterations after 3 failed gates", async () => {
    const doc = mkDoc();
    const trace = await runLoop({
      doc, store: inMemoryStore(doc), lookup: emptyLookup,
      dispatcher: new FakeDispatcher([
        { appendOnDispatch: "1" }, { appendOnDispatch: "2" }, { appendOnDispatch: "3" },
      ]),
      gates: gates([false, false, false]),
      config: DEFAULT_MODEL_CONFIG,
    });
    expect(trace.outcome.kind).toBe("blocked");
    if (trace.outcome.kind === "blocked") {
      expect(trace.outcome.reason.kind).toBe("max-iterations");
    }
    expect(trace.iterations.length).toBe(3);
  });

  it("blocks with dispatcher-error when dispatcher throws", async () => {
    const doc = mkDoc();
    const trace = await runLoop({
      doc, store: inMemoryStore(doc), lookup: emptyLookup,
      dispatcher: new FakeDispatcher([]),
      gates: gates([true]),
      config: DEFAULT_MODEL_CONFIG,
    });
    expect(trace.outcome.kind).toBe("blocked");
    if (trace.outcome.kind === "blocked") {
      expect(trace.outcome.reason.kind).toBe("dispatcher-error");
    }
  });

  it("blocks low-pass with scaffold-incomplete when scaffold missing", async () => {
    const doc = mkDoc({
      level: "task-low-pass", short_code: "KAT-TL-0001" as any,
      pass: "low", model_tier: "cheap", scaffold_task: "KAT-TH-9999" as any,
    });
    const trace = await runLoop({
      doc, store: inMemoryStore(doc), lookup: emptyLookup,
      dispatcher: new FakeDispatcher([{ appendOnDispatch: "x" }]),
      gates: gates([true]),
      config: DEFAULT_MODEL_CONFIG,
    });
    expect(trace.outcome.kind).toBe("blocked");
    if (trace.outcome.kind === "blocked") {
      expect(trace.outcome.reason.kind).toBe("scaffold-incomplete");
    }
    expect(trace.iterations.length).toBe(0); // never dispatched
  });
});

describe("runLoop priorGateFailures threading", () => {
  it("hands prior failures to the next dispatch call", async () => {
    const doc = mkDoc();
    const dispatcher = new FakeDispatcher([{ appendOnDispatch: "a" }, { appendOnDispatch: "b" }]);
    const spy = vi.spyOn(dispatcher, "dispatch");
    await runLoop({
      doc, store: inMemoryStore(doc), lookup: emptyLookup,
      dispatcher, gates: gates([false, true]), config: DEFAULT_MODEL_CONFIG,
    });
    expect(spy.mock.calls[0]![0].priorGateFailures).toEqual([]);
    expect(spy.mock.calls[1]![0].priorGateFailures.length).toBe(1);
    expect(spy.mock.calls[1]![0].priorGateFailures[0]!.code).toBe("x");
  });
});
