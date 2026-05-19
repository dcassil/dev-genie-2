import type { PlatformAdapter, PlatformId } from "./port";
import { ClaudeCodeAdapter } from "./claude-code";
import { CursorAdapter } from "./cursor";
import { OpenAiCodexAdapter } from "./openai-codex";

export type AdapterFactory = () => PlatformAdapter;

export class UnknownPlatformError extends Error {
  constructor(id: string, known: PlatformId[]) {
    super(`Unknown platform: ${id}. Known: ${known.join(", ")}`);
    this.name = "UnknownPlatformError";
  }
}

const DEFAULTS: Record<PlatformId, AdapterFactory> = {
  "claude-code": () => new ClaudeCodeAdapter(),
  "cursor": () => new CursorAdapter(),
  "openai-codex": () => new OpenAiCodexAdapter(),
};

const REGISTRY: Record<PlatformId, AdapterFactory> = { ...DEFAULTS };

/** Restore the default factories. Used by tests to undo stub overrides. */
export function resetRegistry(): void {
  for (const id of Object.keys(DEFAULTS) as PlatformId[]) {
    REGISTRY[id] = DEFAULTS[id];
  }
}

export function getAdapter(id: PlatformId): PlatformAdapter {
  const factory = REGISTRY[id];
  if (!factory) {
    throw new UnknownPlatformError(id, listPlatforms());
  }
  return factory();
}

export function listPlatforms(): PlatformId[] {
  return Object.keys(REGISTRY) as PlatformId[];
}

export function registerAdapter(id: PlatformId, factory: AdapterFactory): void {
  REGISTRY[id] = factory;
}
