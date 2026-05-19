import type { DocumentType, ShortCode, Phase } from "../types/document.js";

/** Minimal summary shape for board operations. */
export interface DocumentSummary {
  short_code: ShortCode;
  level: DocumentType;
  title: string;
  phase: Phase;
  parent?: ShortCode;
  archived: boolean;
  updated_at: string;
}

/** Dependencies injected into InternalBoardPort. */
export interface InternalBoardDeps {
  /** Read-only: returns all docs honoring filter. Wraps list_documents tool. */
  list_documents(opts: {
    level?: DocumentType;
    parent?: ShortCode;
    include_archived?: boolean;
  }): Promise<DocumentSummary[]>;

  /** Mutation path: delegates to MCP transition_phase. */
  transition_phase(short_code: ShortCode, phase: Phase): Promise<DocumentSummary>;
}
