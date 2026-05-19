import { ALL_TOOLS } from "../../src/mcp/tools/index.js";
import type { StoragePort } from "../../src/storage/port.js";

export function makeInProcessClient(storage: StoragePort) {
  return {
    async call<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
      const t = ALL_TOOLS.find((x) => x.name === name);
      if (!t) throw new Error(`Unknown tool: ${name}`);
      return t.handler(args, { storage }) as Promise<T>;
    },
  };
}
