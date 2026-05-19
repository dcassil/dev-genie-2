import type { BoardSnapshot, Card, Column } from "./port.js";

export interface RenderOptions {
  /** Hide columns with zero cards. Default: false. */
  hide_empty_columns?: boolean;
  /** Title shown above the board. Default: "Katana Board". */
  heading?: string;
  /** Include the `generated_at` + backend footer line. Default: true. */
  show_meta?: boolean;
}

/** Pure renderer. Output ends with a trailing newline. */
export function render_markdown(
  snapshot: BoardSnapshot,
  opts: RenderOptions = {},
): string {
  const heading = opts.heading ?? "Katana Board";
  const hide_empty = opts.hide_empty_columns ?? false;
  const show_meta = opts.show_meta ?? true;

  const cardsByCol = new Map<string, Card[]>();
  for (const card of snapshot.cards) {
    const arr = cardsByCol.get(card.column_id) ?? [];
    arr.push(card);
    cardsByCol.set(card.column_id, arr);
  }
  for (const arr of cardsByCol.values()) {
    arr.sort((a, b) => a.short_code?.localeCompare(b.short_code ?? "") ?? 0);
  }

  const ordered = [...snapshot.columns].sort((a, b) => a.order - b.order);
  const parts: string[] = [`# ${heading}`, ""];

  for (const col of ordered) {
    const cards = cardsByCol.get(col.id) ?? [];
    if (hide_empty && cards.length === 0) continue;
    parts.push(`## ${col.title} (${cards.length})`, "");
    parts.push("| Short Code | Level | Title | Parent | Updated |");
    parts.push("|---|---|---|---|---|");
    if (cards.length === 0) {
      parts.push("| _empty_ |  |  |  |  |");
    } else {
      for (const c of cards) {
        parts.push(
          `| ${c.short_code ?? c.id} | ${c.level ?? ""} | ${escapePipes(c.title)} | ${c.parent ?? ""} | ${c.updated_at} |`,
        );
      }
    }
    parts.push("");
  }

  if (show_meta) {
    parts.push(`_backend: ${snapshot.backend} · generated_at: ${snapshot.generated_at}_`);
  }
  return parts.join("\n") + "\n";
}

function escapePipes(s: string): string {
  return s.replace(/\|/g, "\\|");
}
