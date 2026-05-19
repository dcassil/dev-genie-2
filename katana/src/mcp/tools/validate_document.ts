import type { StoragePort } from "../../storage/port.js";
import type { ShortCode } from "../../types/document.js";
import { TOOL_SCHEMAS } from "./schemas.js";
import { runValidateGate, type GateResult } from "../gate-stub.js";

export const validateDocumentTool = {
  ...TOOL_SCHEMAS.validate_document,
  handler: async (
    input: { short_code: ShortCode },
    ctx: { storage: StoragePort }
  ): Promise<GateResult> => {
    const doc = await ctx.storage.read(input.short_code);
    return runValidateGate(doc, ctx);
  },
};
