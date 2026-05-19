import type {
  BoardPort, BoardPortOptions, BoardSnapshot, BoardFilter, Card, Column,
} from "./port.js";

const FIXED_COLUMNS: Column[] = [
  { id: "backlog",     title: "Backlog",     order: 0 },
  { id: "in-progress", title: "In Progress", order: 1 },
  { id: "done",        title: "Done",        order: 2 },
];

const FIXED_CARDS: Card[] = [
  {
    id: "EXT-1",
    column_id: "backlog",
    title: "[stub] Foreign card #1",
    url: "https://example.invalid/EXT-1",
    updated_at: "2026-05-09T00:00:00.000Z",
    archived: false,
    extra: { source: "stub" },
  },
  {
    id: "EXT-2",
    column_id: "in-progress",
    title: "[stub] Foreign card #2",
    url: "https://example.invalid/EXT-2",
    updated_at: "2026-05-09T00:00:00.000Z",
    archived: false,
    extra: { source: "stub" },
  },
];

export class ExternalStubBoardPort implements BoardPort {
  readonly backend = "external-stub";
  // Mapping is intentionally read-into-memory but unused — proves the seam.
  private readonly _mapping = this.opts.mapping;

  constructor(private readonly opts: BoardPortOptions) {}

  async list_board(filter: BoardFilter = {}): Promise<BoardSnapshot> {
    const include_archived = filter.include_archived ?? false;
    const cards = FIXED_CARDS.filter((c) => include_archived || !c.archived);
    return {
      generated_at: new Date().toISOString(),
      backend: this.backend,
      columns: FIXED_COLUMNS,
      cards,
    };
  }

  async get_card(card_id: string): Promise<Card | null> {
    return FIXED_CARDS.find((c) => c.id === card_id) ?? null;
  }

  async move_card(card_id: string, to_column_id: string): Promise<Card> {
    const card = await this.get_card(card_id);
    if (!card) throw new Error(`stub: unknown card ${card_id}`);
    if (!FIXED_COLUMNS.some((c) => c.id === to_column_id)) {
      throw new Error(`stub: unknown column ${to_column_id}`);
    }
    // Stub: do not mutate FIXED_CARDS; return a derived Card.
    return { ...card, column_id: to_column_id };
  }
}
