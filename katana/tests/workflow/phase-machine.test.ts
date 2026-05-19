import { describe, it, expect } from "vitest";
import {
  phasesFor,
  nextPhase,
  isTerminal,
  validateTransition,
  allTransitions,
} from "../../src/workflow/phase-machine.js";
import type { DocumentType } from "../../src/types/document.js";

const ALL_LEVELS: DocumentType[] = [
  "product-doc",
  "epic",
  "user-story",
  "task-high-pass",
  "task-low-pass",
  "task-ui",
];

const EXPECTED: Record<DocumentType, string[]> = {
  "product-doc": ["draft", "review", "published"],
  epic: ["discovery", "design", "ready", "active", "completed"],
  "user-story": ["discovery", "design", "ready", "active", "completed"],
  "task-high-pass": ["todo", "active", "completed"],
  "task-low-pass": ["todo", "active", "completed"],
  "task-ui": ["todo", "active", "completed"],
};

describe("phasesFor", () => {
  for (const lvl of ALL_LEVELS) {
    it(`${lvl} matches schema`, () => {
      expect([...phasesFor(lvl)]).toEqual(EXPECTED[lvl]);
    });
  }
});

describe("nextPhase / isTerminal", () => {
  for (const lvl of ALL_LEVELS) {
    const phases = EXPECTED[lvl];
    it(`${lvl} walks forward to terminal`, () => {
      for (let i = 0; i < phases.length - 1; i++) {
        expect(nextPhase(lvl, phases[i]!)).toBe(phases[i + 1]);
        expect(isTerminal(lvl, phases[i]!)).toBe(false);
      }
      expect(nextPhase(lvl, phases.at(-1)!)).toBe(null);
      expect(isTerminal(lvl, phases.at(-1)!)).toBe(true);
    });
  }
});

describe("validateTransition", () => {
  it("accepts each adjacent forward step", () => {
    for (const lvl of ALL_LEVELS) {
      for (const { from, to } of allTransitions(lvl)) {
        expect(validateTransition(lvl, from, to)).toBeNull();
      }
    }
  });

  it("rejects skip-ahead with not-forward", () => {
    expect(validateTransition("epic", "discovery", "ready"))
      .toEqual({ kind: "not-forward", from: "discovery", to: "ready" });
  });

  it("rejects backwards with not-forward", () => {
    expect(validateTransition("epic", "ready", "design"))
      .toEqual({ kind: "not-forward", from: "ready", to: "design" });
  });

  it("rejects same-phase with not-forward", () => {
    expect(validateTransition("task-high-pass", "active", "active"))
      .toEqual({ kind: "not-forward", from: "active", to: "active" });
  });

  it("rejects unknown target phase with no-such-phase", () => {
    expect(validateTransition("product-doc", "draft", "shipped"))
      .toEqual({ kind: "no-such-phase", phase: "shipped" });
  });

  it("rejects out-of-table from-phase with wrong-level", () => {
    expect(validateTransition("product-doc", "todo", "draft"))
      .toEqual({ kind: "wrong-level", level: "product-doc", phase: "todo" });
  });
});

describe("allTransitions", () => {
  it("yields N-1 pairs for an N-state level", () => {
    for (const lvl of ALL_LEVELS) {
      expect(allTransitions(lvl).length).toBe(EXPECTED[lvl].length - 1);
    }
  });
});
