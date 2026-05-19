/**
 * Model-tier selection per (level, pass).
 *
 * Resolution order:
 *   1. Override entry whose (level, pass) matches exactly.
 *   2. Override entry whose level matches and pass is undefined.
 *   3. Default entry from DEFAULT_MODEL_CONFIG.
 *
 * Loader merges a project file at <workspace>/.katana/workflow.json into
 * the defaults. Unknown keys log via the supplied logger and are ignored.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DocumentType } from "../types/document.js";
import type { ModelTier } from "./types.js";

export interface ModelConfigEntry {
  level: DocumentType;
  pass?: "high" | "low";
  tier: ModelTier;
}

export interface WorkflowConfig {
  version: 1;
  models: ModelConfigEntry[];
}

export const DEFAULT_MODEL_CONFIG: WorkflowConfig = {
  version: 1,
  models: [
    { level: "product-doc",    tier: "strong" },
    { level: "epic",           tier: "strong" },
    { level: "user-story",     tier: "strong" },
    { level: "task-high-pass", pass: "high", tier: "strong" },
    { level: "task-low-pass",  pass: "low",  tier: "cheap" },
    { level: "task-ui",        tier: "ui" },
  ],
};

/** Resolve the tier for a doc. Throws if no entry matches (config bug). */
export function resolveTier(
  cfg: WorkflowConfig,
  level: DocumentType,
  pass?: "high" | "low",
): ModelTier {
  if (pass) {
    const exact = cfg.models.find((m) => m.level === level && m.pass === pass);
    if (exact) return exact.tier;
  }
  const byLevel = cfg.models.find((m) => m.level === level && m.pass === undefined);
  if (byLevel) return byLevel.tier;
  throw new Error(`No model-config entry for level="${level}" pass="${pass ?? "-"}"`);
}

/** Merge override into base. Override entries replace exact (level,pass) matches. */
export function mergeConfig(base: WorkflowConfig, override: Partial<WorkflowConfig>): WorkflowConfig {
  const out: ModelConfigEntry[] = base.models.map((m) => ({ ...m }));
  for (const o of override.models ?? []) {
    const i = out.findIndex((m) => m.level === o.level && m.pass === o.pass);
    if (i >= 0) out[i] = { ...o };
    else out.push({ ...o });
  }
  return { version: 1, models: out };
}

/**
 * Load <workspaceRoot>/.katana/workflow.json. Returns DEFAULT_MODEL_CONFIG
 * when the file is absent. Throws on JSON parse error or version mismatch.
 */
export function loadWorkflowConfig(workspaceRoot: string): WorkflowConfig {
  const path = join(workspaceRoot, ".katana", "workflow.json");
  if (!existsSync(path)) return DEFAULT_MODEL_CONFIG;
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as Partial<WorkflowConfig>;
  if (parsed.version !== 1) {
    throw new Error(`workflow.json version must be 1; got ${String(parsed.version)}`);
  }
  return mergeConfig(DEFAULT_MODEL_CONFIG, parsed);
}
