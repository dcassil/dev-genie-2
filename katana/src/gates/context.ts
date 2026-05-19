import type { GateContext, KatanaDocument } from "./types.js";

/**
 * Build an in-memory GateContext from a list of documents.
 * Archived documents are excluded from `all()` but remain
 * available via `lookup()` so gates can detect dangling refs.
 */
export function createContext(documents: ReadonlyArray<KatanaDocument>): GateContext {
  const byShortCode = new Map<string, KatanaDocument>();
  for (const doc of documents) {
    const code = doc.frontmatter.short_code;
    if (typeof code === "string" && code.length > 0) {
      byShortCode.set(code, doc);
    }
  }
  const unarchived = documents.filter((d) => d.frontmatter.archived !== true);
  return {
    lookup(shortCode: string): KatanaDocument | null {
      return byShortCode.get(shortCode) ?? null;
    },
    all(): KatanaDocument[] {
      return unarchived.slice();
    },
  };
}
