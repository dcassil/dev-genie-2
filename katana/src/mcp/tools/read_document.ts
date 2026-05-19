import type { StoragePort } from "../../storage/port.js";
import type { Document, ShortCode } from "../../types/document.js";
import { TOOL_SCHEMAS } from "./schemas.js";

export const readDocumentTool = {
  ...TOOL_SCHEMAS.read_document,
  handler: async (
    input: { short_code: ShortCode },
    ctx: { storage: StoragePort }
  ): Promise<Document> => {
    return ctx.storage.read(input.short_code);
  },
};
