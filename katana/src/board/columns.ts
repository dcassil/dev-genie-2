import type { Column } from "./port.js";
import type { DocumentType } from "../types/document.js";
import { PHASES_BY_LEVEL } from "../types/document.js";

/** Human label per phase. Drives column titles; safe to override. */
export const PHASE_LABELS: Record<string, string> = {
  draft: "Draft",
  review: "Review",
  published: "Published",
  discovery: "Discovery",
  design: "Design",
  ready: "Ready",
  active: "Active",
  completed: "Completed",
  todo: "To Do",
};

/** Canonical column set per level. Order = left-to-right on the board. */
export function columns_for_level(level: DocumentType): Column[] {
  const phases = PHASES_BY_LEVEL[level];
  return phases.map((phase, i) => ({
    id: phase,
    title: PHASE_LABELS[phase] ?? phase,
    order: i,
  }));
}

/** Aggregate columns across all levels — union, ordered by first appearance. */
export function columns_for_workspace(): Column[] {
  const seen = new Map<string, Column>();
  let order = 0;
  const levels: DocumentType[] = [
    "product-doc", "epic", "user-story",
    "task-high-pass", "task-low-pass", "task-ui",
  ];
  for (const lvl of levels) {
    for (const col of columns_for_level(lvl)) {
      if (!seen.has(col.id)) {
        seen.set(col.id, { ...col, order: order++ });
      }
    }
  }
  return [...seen.values()];
}

/** Reverse: column id -> phase string (identity in MVP). */
export function phase_for_column(column_id: string): string {
  return column_id;
}
