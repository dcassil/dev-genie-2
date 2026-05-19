import { describe, it, expect } from "vitest";
import {
  assertCanStart,
  explainHandoffRejection,
  type DocLookup,
  type HandoffDocView,
} from "../../src/workflow/handoff.js";

function lookup(docs: HandoffDocView[]): DocLookup {
  const m = new Map(docs.map((d) => [d.short_code, d]));
  return { get: (sc) => m.get(sc) ?? null };
}

const HP_DONE: HandoffDocView = { short_code: "KAT-TH-0001", level: "task-high-pass", phase: "completed" };
const HP_ACTIVE: HandoffDocView = { short_code: "KAT-TH-0002", level: "task-high-pass", phase: "active" };

describe("assertCanStart", () => {
  it("returns null for non-low-pass levels regardless of scaffold field", () => {
    for (const level of ["product-doc", "epic", "user-story", "task-high-pass", "task-ui"] as const) {
      const doc: HandoffDocView = { short_code: "X", level, phase: "todo", scaffold_task: "KAT-TH-9999" };
      expect(assertCanStart(doc, lookup([]))).toBeNull();
    }
  });

  it("rejects when scaffold_task is unset", () => {
    const lp: HandoffDocView = { short_code: "KAT-TL-0001", level: "task-low-pass", phase: "todo" };
    expect(assertCanStart(lp, lookup([]))).toEqual({
      kind: "scaffold-incomplete",
      lowPass: "KAT-TL-0001",
      scaffold: "",
      scaffoldPhase: "missing",
    });
  });

  it("rejects when scaffold short_code does not resolve", () => {
    const lp: HandoffDocView = { short_code: "KAT-TL-0001", level: "task-low-pass", phase: "todo", scaffold_task: "KAT-TH-9999" };
    expect(assertCanStart(lp, lookup([]))).toEqual({
      kind: "scaffold-incomplete",
      lowPass: "KAT-TL-0001",
      scaffold: "KAT-TH-9999",
      scaffoldPhase: "missing",
    });
  });

  it("rejects when scaffold resolves to wrong level", () => {
    const wrong: HandoffDocView = { short_code: "KAT-TU-0001", level: "task-ui", phase: "completed" };
    const lp: HandoffDocView = { short_code: "KAT-TL-0001", level: "task-low-pass", phase: "todo", scaffold_task: "KAT-TU-0001" };
    expect(assertCanStart(lp, lookup([wrong]))).toEqual({
      kind: "scaffold-incomplete",
      lowPass: "KAT-TL-0001",
      scaffold: "KAT-TU-0001",
      scaffoldPhase: "missing",
    });
  });

  it("rejects when scaffold high-pass is not completed", () => {
    const lp: HandoffDocView = { short_code: "KAT-TL-0001", level: "task-low-pass", phase: "todo", scaffold_task: "KAT-TH-0002" };
    expect(assertCanStart(lp, lookup([HP_ACTIVE]))).toEqual({
      kind: "scaffold-incomplete",
      lowPass: "KAT-TL-0001",
      scaffold: "KAT-TH-0002",
      scaffoldPhase: "active",
    });
  });

  it("returns null when scaffold high-pass is completed", () => {
    const lp: HandoffDocView = { short_code: "KAT-TL-0001", level: "task-low-pass", phase: "todo", scaffold_task: "KAT-TH-0001" };
    expect(assertCanStart(lp, lookup([HP_DONE]))).toBeNull();
  });
});

describe("explainHandoffRejection", () => {
  it("renders a missing scaffold message", () => {
    const msg = explainHandoffRejection({
      kind: "scaffold-incomplete",
      lowPass: "KAT-TL-0001" as any,
      scaffold: "" as any,
      scaffoldPhase: "missing",
    });
    expect(msg).toMatch(/KAT-TL-0001/);
    expect(msg).toMatch(/not found/);
  });

  it("renders a non-completed scaffold message", () => {
    const msg = explainHandoffRejection({
      kind: "scaffold-incomplete",
      lowPass: "KAT-TL-0001" as any,
      scaffold: "KAT-TH-0002" as any,
      scaffoldPhase: "active",
    });
    expect(msg).toMatch(/active/);
    expect(msg).toMatch(/completed/);
  });

  it("returns a placeholder for non-handoff rejections", () => {
    expect(explainHandoffRejection({ kind: "not-forward", from: "todo", to: "completed" }))
      .toMatch(/non-handoff/);
  });
});
