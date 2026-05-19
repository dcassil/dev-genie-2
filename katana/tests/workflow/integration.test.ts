import { describe, it, expect } from "vitest";
import type { Document } from "../../src/types/document.js";
import { runLoop, type DocStore } from "../../src/workflow/loop.js";
import { FakeDispatcher } from "../../src/workflow/dispatcher.js";
import { DEFAULT_MODEL_CONFIG } from "../../src/workflow/model-config.js";
import type { GateAdapter, GateAdapterReport } from "../../src/workflow/gate-adapter.js";
import type { DocLookup, HandoffDocView } from "../../src/workflow/handoff.js";

// ─── Fixture ─────────────────────────────────────────
function mkTH(): Document {
  return {
    frontmatter: {
      id: "h", level: "task-high-pass", title: "HP", short_code: "KAT-TH-0001" as any,
      subtype: null, created_at: "", updated_at: "", archived: false, tags: [],
      exit_criteria_met: false, phase: "todo", pass: "high", model_tier: "strong",
      story_id: "KAT-US-0001" as any, parent: "KAT-US-0001" as any,
    },
    body: "## Goal\nDesign scaffold.", filepath: "/tmp/h.md", file_hash: "0",
  } as Document;
}
function mkTL(): Document {
  return {
    frontmatter: {
      id: "l", level: "task-low-pass", title: "LP", short_code: "KAT-TL-0001" as any,
      subtype: null, created_at: "", updated_at: "", archived: false, tags: [],
      exit_criteria_met: false, phase: "todo", pass: "low", model_tier: "cheap",
      story_id: "KAT-US-0001" as any, parent: "KAT-US-0001" as any,
      scaffold_task: "KAT-TH-0001" as any,
    },
    body: "## Goal\nFill scaffold.", filepath: "/tmp/l.md", file_hash: "0",
  } as Document;
}

// ─── In-memory workspace ─────────────────────────────
class Workspace {
  private docs = new Map<string, Document>();
  add(d: Document) { this.docs.set(d.frontmatter.short_code, d); }
  store(): DocStore {
    return {
      read: (sc) => {
        const d = this.docs.get(sc);
        if (!d) throw new Error(`no such doc: ${sc}`);
        return d;
      },
      write: (doc, patch) => {
        const next: Document = {
          ...doc,
          body: patch.body ?? doc.body,
          frontmatter: { ...doc.frontmatter, phase: patch.phase ?? doc.frontmatter.phase },
        };
        this.docs.set(next.frontmatter.short_code, next);
        return next;
      },
    };
  }
  lookup(): DocLookup {
    return {
      get: (sc): HandoffDocView | null => {
        const d = this.docs.get(sc);
        return d ? {
          short_code: d.frontmatter.short_code,
          level: d.frontmatter.level,
          phase: d.frontmatter.phase,
          scaffold_task: d.frontmatter.scaffold_task,
        } : null;
      },
    };
  }
}

// ─── Stub gate adapter: passes once the body contains a "## Scaffold" section ───
function bodyContainsGate(needle: string): GateAdapter {
  return {
    async evaluate(doc): Promise<GateAdapterReport> {
      const ok = doc.body.includes(needle);
      return ok
        ? { ok: true, failures: [], raw: { document: { path: "", short_code: "" }, results: [], ok: true } }
        : { ok: false, failures: [{ gate: "stub", code: "missing", message: `body must include "${needle}"` }],
            raw: { document: { path: "", short_code: "" }, results: [], ok: false } };
    },
  };
}

// ─── The test ────────────────────────────────────────
describe("two-pass workflow integration", () => {
  it("low-pass blocks until high-pass completes; then both reach completed", async () => {
    const ws = new Workspace();
    const hp = mkTH(); const lp = mkTL();
    ws.add(hp); ws.add(lp);

    // 1. Low-pass first attempt: scaffold not done → blocked.
    const lpEarly = await runLoop({
      doc: lp, store: ws.store(), lookup: ws.lookup(),
      dispatcher: new FakeDispatcher([{ appendOnDispatch: "\n## Filled\nyes" }]),
      gates: bodyContainsGate("## Filled"),
      config: DEFAULT_MODEL_CONFIG,
    });
    expect(lpEarly.outcome.kind).toBe("blocked");
    if (lpEarly.outcome.kind === "blocked") {
      expect(lpEarly.outcome.reason.kind).toBe("scaffold-incomplete");
    }
    expect(lpEarly.iterations.length).toBe(0);

    // 2. Run high-pass loop. Dispatcher appends a "## Scaffold" section; gate passes.
    const hpTrace = await runLoop({
      doc: hp, store: ws.store(), lookup: ws.lookup(),
      dispatcher: new FakeDispatcher([{ appendOnDispatch: "\n## Scaffold\nlocked-types" }]),
      gates: bodyContainsGate("## Scaffold"),
      config: DEFAULT_MODEL_CONFIG,
    });
    expect(hpTrace.outcome.kind).toBe("completed");
    expect(ws.store().read("KAT-TH-0001" as any).frontmatter.phase).toBe("completed");

    // 3. Low-pass second attempt: scaffold completed → loop runs, gate passes after one iter.
    const lpFresh = ws.store().read("KAT-TL-0001" as any);
    const lpTrace = await runLoop({
      doc: lpFresh, store: ws.store(), lookup: ws.lookup(),
      dispatcher: new FakeDispatcher([{ appendOnDispatch: "\n## Filled\nyes" }]),
      gates: bodyContainsGate("## Filled"),
      config: DEFAULT_MODEL_CONFIG,
    });
    expect(lpTrace.outcome.kind).toBe("completed");
    expect(ws.store().read("KAT-TL-0001" as any).frontmatter.phase).toBe("completed");
    expect(lpTrace.iterations.length).toBe(1);
  });
});
