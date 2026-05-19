/**
 * JSON schemas for the katana MCP tool surface (8 tools, MVP).
 * Compatible with @modelcontextprotocol/sdk's `Tool` shape (inputSchema is JSON Schema draft-7).
 * Output schemas are advisory (the SDK does not enforce them client-side) but are the
 * contract every tool handler must respect.
 */

const SHORT_CODE = { type: "string", pattern: "^[A-Z][A-Z0-9]{1,9}-(PD|E|US|TH|TL|TU|A)-\\d{4}$" } as const;
const LEVEL = { type: "string", enum: ["product-doc", "epic", "user-story", "task-high-pass", "task-low-pass", "task-ui"] } as const;
const PHASE = { type: "string" } as const;

const DOCUMENT_SUMMARY = {
  type: "object",
  required: ["short_code", "level", "title", "phase", "archived", "updated_at"],
  properties: {
    short_code: SHORT_CODE,
    level: LEVEL,
    title: { type: "string" },
    phase: PHASE,
    parent: SHORT_CODE,
    archived: { type: "boolean" },
    updated_at: { type: "string" },
  },
} as const;

const DOCUMENT = {
  type: "object",
  required: ["frontmatter", "body", "filepath", "file_hash"],
  properties: {
    frontmatter: { type: "object" },
    body: { type: "string" },
    filepath: { type: "string" },
    file_hash: { type: "string" },
  },
} as const;

export const TOOL_SCHEMAS = {
  create_document: {
    name: "create_document",
    description: "Create a new katana document; allocates short_code and writes the .md file.",
    inputSchema: {
      type: "object",
      required: ["level", "title"],
      properties: {
        level: LEVEL,
        title: { type: "string", minLength: 1 },
        parent: SHORT_CODE,
        subtype: { type: ["string", "null"], enum: ["architecture", "system-design", "ui", "major-feature", "interface-contract", null] },
        pass: { type: "string", enum: ["high", "low"] },
        model_tier: { type: "string", enum: ["strong", "cheap", "ui"] },
        scaffold_task: SHORT_CODE,
        body: { type: "string", default: "" },
        initiative_id: { type: "string" },
        strategy_id: { type: ["string", "null"] },
      },
      additionalProperties: false,
    },
    outputSchema: DOCUMENT,
  },

  read_document: {
    name: "read_document",
    description: "Read a katana document by short_code.",
    inputSchema: {
      type: "object",
      required: ["short_code"],
      properties: { short_code: SHORT_CODE },
      additionalProperties: false,
    },
    outputSchema: DOCUMENT,
  },

  edit_document: {
    name: "edit_document",
    description: "Search/replace within a document body.",
    inputSchema: {
      type: "object",
      required: ["short_code", "search", "replace"],
      properties: {
        short_code: SHORT_CODE,
        search: { type: "string", minLength: 1 },
        replace: { type: "string" },
        replace_all: { type: "boolean", default: false },
      },
      additionalProperties: false,
    },
    outputSchema: DOCUMENT,
  },

  list_documents: {
    name: "list_documents",
    description: "List documents with optional filters.",
    inputSchema: {
      type: "object",
      properties: {
        level: LEVEL,
        phase: PHASE,
        parent: SHORT_CODE,
        include_archived: { type: "boolean", default: false },
        limit: { type: "integer", minimum: 1, maximum: 1000, default: 100 },
        offset: { type: "integer", minimum: 0, default: 0 },
      },
      additionalProperties: false,
    },
    outputSchema: { type: "array", items: DOCUMENT_SUMMARY },
  },

  search_documents: {
    name: "search_documents",
    description: "Full-text search via FTS5.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string", minLength: 1 },
        level: LEVEL,
        include_archived: { type: "boolean", default: false },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 25 },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "array",
      items: {
        allOf: [
          DOCUMENT_SUMMARY,
          { type: "object", required: ["rank", "snippet"], properties: { rank: { type: "number" }, snippet: { type: "string" } } },
        ],
      },
    },
  },

  transition_phase: {
    name: "transition_phase",
    description: "Advance a document to the next forward phase, or to a specific phase.",
    inputSchema: {
      type: "object",
      required: ["short_code"],
      properties: {
        short_code: SHORT_CODE,
        phase: PHASE,
        force: { type: "boolean", default: false },
      },
      additionalProperties: false,
    },
    outputSchema: DOCUMENT,
  },

  validate_document: {
    name: "validate_document",
    description: "Run gate engine (KAT-I-0002) checks against a document. MVP returns frontmatter-shape diagnostics until gate engine lands.",
    inputSchema: {
      type: "object",
      required: ["short_code"],
      properties: { short_code: SHORT_CODE },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      required: ["short_code", "ok", "diagnostics"],
      properties: {
        short_code: SHORT_CODE,
        ok: { type: "boolean" },
        diagnostics: {
          type: "array",
          items: {
            type: "object",
            required: ["severity", "rule_id", "message"],
            properties: {
              severity: { type: "string", enum: ["error", "warning", "info"] },
              rule_id: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
  },

  decompose_document: {
    name: "decompose_document",
    description: "Create children of a parent document. Each child is gate-checked before creation.",
    inputSchema: {
      type: "object",
      required: ["parent", "children"],
      properties: {
        parent: SHORT_CODE,
        children: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["level", "title"],
            properties: {
              level: LEVEL,
              title: { type: "string", minLength: 1 },
              subtype: { type: ["string", "null"] },
              pass: { type: "string", enum: ["high", "low"] },
              model_tier: { type: "string", enum: ["strong", "cheap", "ui"] },
              scaffold_task: SHORT_CODE,
              body: { type: "string", default: "" },
            },
          },
        },
      },
      additionalProperties: false,
    },
    outputSchema: { type: "array", items: DOCUMENT },
  },
} as const;

export type ToolName = keyof typeof TOOL_SCHEMAS;
