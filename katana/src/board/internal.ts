import type {
  BoardPort, BoardPortOptions, BoardSnapshot, BoardFilter, Card, Column,
} from "./port.js";
import { columns_for_workspace, phase_for_column } from "./columns.js";
import type { ShortCode } from "../types/document.js";
import type { InternalBoardDeps, DocumentSummary } from "./internal-deps.js";

export class InternalBoardPort implements BoardPort {
  readonly backend = "internal";
  constructor(
    private readonly deps: InternalBoardDeps,
    private readonly opts: BoardPortOptions,
  ) {}

  async list_board(filter: BoardFilter = {}): Promise<BoardSnapshot> {
    const docs = await this.deps.list_documents({
      level: filter.level,
      parent: filter.parent,
      include_archived: filter.include_archived ?? false,
    });
    const columns: Column[] = columns_for_workspace();
    const cards: Card[] = docs.map((d) => this.#toCard(d));
    return {
      generated_at: new Date().toISOString(),
      backend: this.backend,
      columns,
      cards,
    };
  }

  async get_card(card_id: string): Promise<Card | null> {
    // card_id == short_code for internal backend
    const docs = await this.deps.list_documents({ include_archived: true });
    const d = docs.find((x) => x.short_code === card_id);
    return d ? this.#toCard(d) : null;
  }

  async move_card(card_id: string, to_column_id: string): Promise<Card> {
    const target_phase = phase_for_column(to_column_id);
    const updated = await this.deps.transition_phase(card_id as ShortCode, target_phase);
    return this.#toCard(updated);
  }

  #toCard(d: DocumentSummary): Card {
    return {
      id: d.short_code,
      column_id: d.phase,
      title: d.title,
      short_code: d.short_code,
      level: d.level,
      phase: d.phase,
      parent: d.parent,
      url: `file://${this.opts.workspace_root}/${d.short_code}.md`,
      updated_at: d.updated_at,
      archived: d.archived,
    };
  }
}
