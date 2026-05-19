import type { StoragePort } from "../../storage/port.js";
import type { Document, DocumentType, ShortCode } from "../../types/document.js";
import { TOOL_SCHEMAS } from "./schemas.js";
import { createDocumentTool } from "./create_document.js";
import { runDecomposeGate } from "../gate-stub.js";

const ALLOWED_CHILD: Record<DocumentType, DocumentType[]> = {
  "product-doc": ["epic"],
  epic: ["user-story"],
  "user-story": ["task-high-pass", "task-low-pass", "task-ui"],
  "task-high-pass": [],
  "task-low-pass": [],
  "task-ui": [],
};

interface ChildSpec {
  level: DocumentType;
  title: string;
  subtype?: string | null;
  pass?: "high" | "low";
  model_tier?: "strong" | "cheap" | "ui";
  scaffold_task?: ShortCode;
  body?: string;
}

interface Input {
  parent: ShortCode;
  children: ChildSpec[];
}

export const decomposeDocumentTool = {
  ...TOOL_SCHEMAS.decompose_document,
  handler: async (
    input: Input,
    ctx: { storage: StoragePort }
  ): Promise<Document[]> => {
    const parent = await ctx.storage.read(input.parent);
    const gate = await runDecomposeGate(parent, ctx);
    if (!gate.ok) {
      throw new Error(
        `Decompose gate failed: ${gate.diagnostics.map((d) => d.message).join("; ")}`
      );
    }

    const allowed = ALLOWED_CHILD[parent.frontmatter.level];
    for (const c of input.children) {
      if (!allowed.includes(c.level)) {
        throw new Error(
          `level=${c.level} is not a valid child of ${parent.frontmatter.level}`
        );
      }
    }

    const out: Document[] = [];
    for (const c of input.children) {
      const created = await createDocumentTool.handler(
        { ...c, parent: input.parent } as any,
        ctx
      );
      out.push(created);
    }

    return out;
  },
};
