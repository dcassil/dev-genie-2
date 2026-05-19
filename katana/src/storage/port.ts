import type {
  Document,
  DocumentSummary,
  DocumentType,
  Frontmatter,
  Phase,
  ShortCode,
} from "../types/document.js";

export interface CreateDocumentInput {
  level: DocumentType;
  title: string;
  parent?: ShortCode;
  subtype?: Frontmatter["subtype"];
  pass?: Frontmatter["pass"];
  model_tier?: Frontmatter["model_tier"];
  scaffold_task?: ShortCode;
  body?: string;
  initiative_id?: string;
  strategy_id?: string | null;
}

export interface ListFilter {
  level?: DocumentType;
  phase?: Phase;
  parent?: ShortCode;
  include_archived?: boolean;
  limit?: number;
  offset?: number;
}

export interface SearchFilter {
  query: string;
  level?: DocumentType;
  include_archived?: boolean;
  limit?: number;
}

export interface SearchHit extends DocumentSummary {
  /** FTS bm25 rank, lower = better match. */
  rank: number;
  /** Snippet around the match. */
  snippet: string;
}

/**
 * StoragePort — contract every katana backend implements.
 * The sqlite+markdown backend (src/storage/sqlite/index.ts) is the default.
 */
export interface StoragePort {
  /** Create a document: allocates short_code, writes the .md file, inserts row, returns the persisted Document. */
  create(input: CreateDocumentInput): Promise<Document>;

  /** Read by short_code. Throws DocumentNotFound if missing. */
  read(short_code: ShortCode): Promise<Document>;

  /** Search/replace in body. `replace_all` defaults to false. Throws if `search` not found. */
  edit(short_code: ShortCode, search: string, replace: string, replace_all?: boolean): Promise<Document>;

  /** Update arbitrary frontmatter fields. Used by transition_phase. */
  patchFrontmatter(short_code: ShortCode, patch: Partial<Frontmatter>): Promise<Document>;

  /** List with filters; returns summaries (never full body) for performance. */
  list(filter?: ListFilter): Promise<DocumentSummary[]>;

  /** Full-text search via FTS5. */
  search(filter: SearchFilter): Promise<SearchHit[]>;

  /** Children of a parent (one tier below). */
  children(parent: ShortCode): Promise<DocumentSummary[]>;

  /** Close the underlying handle. */
  close(): void;
}

export class DocumentNotFound extends Error {
  constructor(public short_code: string) { super(`Document not found: ${short_code}`); }
}
export class DuplicateShortCode extends Error {
  constructor(public short_code: string) { super(`Duplicate short_code: ${short_code}`); }
}
