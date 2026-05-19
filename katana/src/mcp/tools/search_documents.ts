import type { StoragePort, SearchFilter, SearchHit } from "../../storage/port.js";
import { TOOL_SCHEMAS } from "./schemas.js";

export const searchDocumentsTool = {
  ...TOOL_SCHEMAS.search_documents,
  handler: async (input: SearchFilter, ctx: { storage: StoragePort }): Promise<SearchHit[]> => {
    if (!input.query?.trim()) throw new Error("query must be non-empty");
    return ctx.storage.search({
      query: input.query,
      level: input.level,
      include_archived: input.include_archived ?? false,
      limit: input.limit ?? 25,
    });
  },
};
