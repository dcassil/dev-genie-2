import type { StoragePort, ListFilter } from "../../storage/port.js";
import type { DocumentSummary } from "../../types/document.js";
import { TOOL_SCHEMAS } from "./schemas.js";

export const listDocumentsTool = {
  ...TOOL_SCHEMAS.list_documents,
  handler: async (input: ListFilter, ctx: { storage: StoragePort }): Promise<DocumentSummary[]> => {
    return ctx.storage.list({
      level: input.level,
      phase: input.phase,
      parent: input.parent,
      include_archived: input.include_archived ?? false,
      limit: input.limit ?? 100,
      offset: input.offset ?? 0,
    });
  },
};
