import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_MODEL_CONFIG,
  loadWorkflowConfig,
  mergeConfig,
  resolveTier,
} from "../../src/workflow/model-config.js";

describe("resolveTier (defaults)", () => {
  it("strong for product-doc / epic / user-story", () => {
    for (const lvl of ["product-doc", "epic", "user-story"] as const) {
      expect(resolveTier(DEFAULT_MODEL_CONFIG, lvl)).toBe("strong");
    }
  });
  it("strong for task-high-pass with pass=high", () => {
    expect(resolveTier(DEFAULT_MODEL_CONFIG, "task-high-pass", "high")).toBe("strong");
  });
  it("cheap for task-low-pass with pass=low", () => {
    expect(resolveTier(DEFAULT_MODEL_CONFIG, "task-low-pass", "low")).toBe("cheap");
  });
  it("ui for task-ui", () => {
    expect(resolveTier(DEFAULT_MODEL_CONFIG, "task-ui")).toBe("ui");
  });
  it("throws if no entry matches", () => {
    const empty = { version: 1 as const, models: [] };
    expect(() => resolveTier(empty, "epic")).toThrow();
  });
});

describe("mergeConfig", () => {
  it("replaces an exact (level,pass) match", () => {
    const merged = mergeConfig(DEFAULT_MODEL_CONFIG, {
      models: [{ level: "task-low-pass", pass: "low", tier: "strong" }],
    });
    expect(resolveTier(merged, "task-low-pass", "low")).toBe("strong");
  });
  it("appends a new entry without removing defaults", () => {
    const merged = mergeConfig(DEFAULT_MODEL_CONFIG, {
      models: [{ level: "task-high-pass", pass: "low", tier: "cheap" }],
    });
    expect(resolveTier(merged, "task-high-pass", "high")).toBe("strong"); // default preserved
    expect(resolveTier(merged, "task-high-pass", "low")).toBe("cheap");   // new entry honored
  });
});

describe("loadWorkflowConfig", () => {
  it("returns defaults when no file", () => {
    const root = mkdtempSync(join(tmpdir(), "kat-cfg-"));
    expect(loadWorkflowConfig(root)).toEqual(DEFAULT_MODEL_CONFIG);
  });

  it("merges an override file", () => {
    const root = mkdtempSync(join(tmpdir(), "kat-cfg-"));
    mkdirSync(join(root, ".katana"));
    writeFileSync(
      join(root, ".katana", "workflow.json"),
      JSON.stringify({ version: 1, models: [{ level: "task-low-pass", pass: "low", tier: "strong" }] }),
    );
    expect(resolveTier(loadWorkflowConfig(root), "task-low-pass", "low")).toBe("strong");
  });

  it("throws on version mismatch", () => {
    const root = mkdtempSync(join(tmpdir(), "kat-cfg-"));
    mkdirSync(join(root, ".katana"));
    writeFileSync(
      join(root, ".katana", "workflow.json"),
      JSON.stringify({ version: 2, models: [] }),
    );
    expect(() => loadWorkflowConfig(root)).toThrow(/version/);
  });
});
