import type { StoragePort } from "../../storage/port.js";
import type { Document, ShortCode } from "../../types/document.js";
import { TOOL_SCHEMAS } from "./schemas.js";

interface Input { short_code: ShortCode; search: string; replace: string; replace_all?: boolean; }

export const editDocumentTool = {
  ...TOOL_SCHEMAS.edit_document,
  handler: async (input: Input, ctx: { storage: StoragePort }): Promise<Document> => {
    if (input.search.length === 0) throw new Error("search must be non-empty");
    return ctx.storage.edit(input.short_code, input.search, input.replace, input.replace_all ?? false);
  },
};
