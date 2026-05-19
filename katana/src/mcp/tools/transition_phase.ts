import type { StoragePort } from "../../storage/port.js";
import type { Document, Phase, ShortCode } from "../../types/document.js";
import { TOOL_SCHEMAS } from "./schemas.js";
import { nextPhase, isForwardTransition, syncPhaseTag } from "./phase-machine.js";

interface Input { short_code: ShortCode; phase?: Phase; force?: boolean; }

export const transitionPhaseTool = {
  ...TOOL_SCHEMAS.transition_phase,
  handler: async (input: Input, ctx: { storage: StoragePort }): Promise<Document> => {
    const doc = await ctx.storage.read(input.short_code);
    const target = input.phase ?? nextPhase(doc.frontmatter.level, doc.frontmatter.phase);
    if (!target) throw new Error(`Already at terminal phase '${doc.frontmatter.phase}'`);
    if (!input.force && !isForwardTransition(doc.frontmatter.level, doc.frontmatter.phase, target)) {
      throw new Error(`Backward/sideways transition blocked: ${doc.frontmatter.phase} -> ${target} (use force=true)`);
    }
    return ctx.storage.patchFrontmatter(input.short_code, {
      phase: target,
      tags: syncPhaseTag(doc.frontmatter.tags, target),
    });
  },
};
