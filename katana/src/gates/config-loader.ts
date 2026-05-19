import { readFileSync } from "node:fs";
import type { GateConfig } from "./config-schema.js";

const VALID_LEVELS = new Set([
  "product-doc",
  "epic",
  "user-story",
  "task-high-pass",
  "task-low-pass",
  "task-ui",
]);

const VALID_PHASES = new Set([
  "draft",
  "review",
  "published",
  "discovery",
  "design",
  "ready",
  "active",
  "completed",
  "todo",
]);

const VALID_TRIGGER_KINDS = new Set([
  "phase-transition",
  "decomposition",
  "create",
  "edit",
]);

/**
 * Load and validate a gate config from disk.
 * Throws an Error with a descriptive message on any structural failure.
 */
export function loadGateConfig(path: string): GateConfig {
  const raw = readFileSync(path, "utf8");
  const parsed: unknown = JSON.parse(raw);
  return validateGateConfig(parsed);
}

/**
 * Pure validator. Exposed for tests and for callers that already
 * have a parsed JSON value.
 */
export function validateGateConfig(value: unknown): GateConfig {
  if (typeof value !== "object" || value === null) {
    throw new Error("gate config must be an object");
  }
  const obj = value as Record<string, unknown>;
  if (obj.version !== 1) {
    throw new Error(`gate config: unsupported version ${String(obj.version)}`);
  }
  if (!Array.isArray(obj.disabled) || !obj.disabled.every((s) => typeof s === "string")) {
    throw new Error("gate config: `disabled` must be string[]");
  }
  if (!Array.isArray(obj.rules)) {
    throw new Error("gate config: `rules` must be an array");
  }
  for (const [i, rule] of obj.rules.entries()) {
    if (typeof rule !== "object" || rule === null) {
      throw new Error(`gate config: rules[${i}] must be an object`);
    }
    const r = rule as Record<string, unknown>;
    const t = r.trigger as Record<string, unknown> | null;
    if (!t || typeof t !== "object") {
      throw new Error(`gate config: rules[${i}].trigger missing`);
    }
    if (typeof t.kind !== "string" || !VALID_TRIGGER_KINDS.has(t.kind)) {
      throw new Error(`gate config: rules[${i}].trigger.kind invalid`);
    }
    if (typeof t.level !== "string" || !VALID_LEVELS.has(t.level)) {
      throw new Error(`gate config: rules[${i}].trigger.level invalid`);
    }
    if (t.kind === "phase-transition") {
      if (typeof t.to !== "string" || !VALID_PHASES.has(t.to)) {
        throw new Error(`gate config: rules[${i}].trigger.to invalid`);
      }
    }
    if (!Array.isArray(r.gates) || !r.gates.every((s) => typeof s === "string")) {
      throw new Error(`gate config: rules[${i}].gates must be string[]`);
    }
  }
  return value as GateConfig;
}
