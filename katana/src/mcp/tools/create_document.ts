import type { StoragePort, CreateDocumentInput } from "../../storage/port.js";
import type { Document, DocumentType, ShortCode, Subtype } from "../../types/document.js";
import { TOOL_SCHEMAS } from "./schemas.js";

interface Input {
  level: DocumentType;
  title: string;
  parent?: ShortCode;
  subtype?: Subtype;
  pass?: "high" | "low";
  model_tier?: "strong" | "cheap" | "ui";
  scaffold_task?: ShortCode;
  body?: string;
  initiative_id?: string;
  strategy_id?: string | null;
}

export const createDocumentTool = {
  ...TOOL_SCHEMAS.create_document,
  handler: async (input: Input, ctx: { storage: StoragePort }): Promise<Document> => {
    validateParentRequirement(input);
    validateSubtypeForLevel(input);
    validateTaskFields(input);
    const created = await ctx.storage.create(input as CreateDocumentInput);
    return created;
  },
};

function validateParentRequirement(i: Input) {
  if (i.level !== "product-doc" && !i.parent) {
    throw new Error(`parent is required for level=${i.level}`);
  }
}

function validateSubtypeForLevel(i: Input) {
  const allowed: Record<DocumentType, (string | null)[]> = {
    "product-doc": ["architecture", "system-design", "ui", null],
    epic: ["architecture", "major-feature", "ui", null],
    "user-story": ["architecture", "interface-contract", "ui", null],
    "task-high-pass": [null],
    "task-low-pass": [null],
    "task-ui": [null],
  };
  const sub = i.subtype ?? null;
  if (!allowed[i.level].includes(sub)) {
    throw new Error(`Invalid subtype '${sub}' for level=${i.level}`);
  }
}

function validateTaskFields(i: Input) {
  if (
    i.level === "task-high-pass" &&
    (i.pass !== "high" || i.model_tier !== "strong")
  ) {
    throw new Error(
      "task-high-pass requires pass='high' and model_tier='strong'"
    );
  }
  if (i.level === "task-low-pass") {
    if (i.pass !== "low" || i.model_tier !== "cheap") {
      throw new Error(
        "task-low-pass requires pass='low' and model_tier='cheap'"
      );
    }
    if (!i.scaffold_task) {
      throw new Error("task-low-pass requires scaffold_task");
    }
  }
  if (i.level === "task-ui" && i.model_tier !== "ui") {
    throw new Error("task-ui requires model_tier='ui'");
  }
}
