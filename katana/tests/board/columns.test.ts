import { describe, it, expect } from "vitest";
import {
  PHASE_LABELS,
  columns_for_level,
  columns_for_workspace,
  phase_for_column,
} from "../../src/board/columns.js";
import { PHASES_BY_LEVEL } from "../../src/types/document.js";
import type { DocumentType } from "../../src/types/document.js";

describe("board/columns", () => {
  describe("columns_for_level", () => {
    it("returns columns for epic with correct phases and order", () => {
      const cols = columns_for_level("epic");
      expect(cols.map((c) => c.id)).toEqual([
        "discovery",
        "design",
        "ready",
        "active",
        "completed",
      ]);
      expect(cols.every((c, i) => c.order === i)).toBe(true);
    });

    it("returns columns for product-doc", () => {
      const cols = columns_for_level("product-doc");
      expect(cols.map((c) => c.id)).toEqual(["draft", "review", "published"]);
      expect(cols.every((c, i) => c.order === i)).toBe(true);
    });

    it("returns columns for user-story", () => {
      const cols = columns_for_level("user-story");
      expect(cols.map((c) => c.id)).toEqual([
        "discovery",
        "design",
        "ready",
        "active",
        "completed",
      ]);
    });

    it("returns columns for all task levels", () => {
      const taskLevels: DocumentType[] = [
        "task-high-pass",
        "task-low-pass",
        "task-ui",
      ];
      for (const level of taskLevels) {
        const cols = columns_for_level(level);
        expect(cols.map((c) => c.id)).toEqual(["todo", "active", "completed"]);
      }
    });

    it("assigns human-readable titles from PHASE_LABELS", () => {
      const cols = columns_for_level("product-doc");
      expect(cols[0].title).toBe("Draft");
      expect(cols[1].title).toBe("Review");
      expect(cols[2].title).toBe("Published");
    });

    it("uses phase name as fallback title if not in PHASE_LABELS", () => {
      const cols = columns_for_level("epic");
      expect(cols.map((c) => c.title)).toEqual([
        "Discovery",
        "Design",
        "Ready",
        "Active",
        "Completed",
      ]);
    });
  });

  describe("columns_for_workspace", () => {
    it("contains every phase id from every level exactly once", () => {
      const cols = columns_for_workspace();
      const seen = new Set<string>();
      for (const col of cols) {
        expect(seen.has(col.id)).toBe(false);
        seen.add(col.id);
      }

      // Verify we have all unique phases from PHASES_BY_LEVEL
      const levels: DocumentType[] = [
        "product-doc",
        "epic",
        "user-story",
        "task-high-pass",
        "task-low-pass",
        "task-ui",
      ];
      const expectedPhases = new Set<string>();
      for (const level of levels) {
        for (const phase of PHASES_BY_LEVEL[level]) {
          expectedPhases.add(phase);
        }
      }
      expect(seen).toEqual(expectedPhases);
    });

    it("has monotonically increasing order values", () => {
      const cols = columns_for_workspace();
      for (let i = 0; i < cols.length - 1; i++) {
        expect(cols[i].order).toBeLessThan(cols[i + 1].order);
      }
    });

    it("is deterministic across runs", () => {
      const cols1 = columns_for_workspace();
      const cols2 = columns_for_workspace();
      expect(cols1).toEqual(cols2);
    });

    it("orders columns by first appearance across levels", () => {
      const cols = columns_for_workspace();
      // product-doc comes first in the levels list, so its phases should appear first
      const productDocCols = columns_for_level("product-doc");
      const productDocPhases = productDocCols.map((c) => c.id);

      const colsInWorkspace = cols.map((c) => c.id);
      const firstAppearances = productDocPhases.map((phase) =>
        colsInWorkspace.indexOf(phase)
      );

      // All product-doc phases should appear before any epic-specific phases
      const epicCols = columns_for_level("epic");
      const epicOnlyPhases = epicCols
        .map((c) => c.id)
        .filter((p) => !productDocPhases.includes(p));
      const epicPhasePositions = epicOnlyPhases.map((phase) =>
        colsInWorkspace.indexOf(phase)
      );

      const maxProductDocPos = Math.max(...firstAppearances);
      const minEpicPos = Math.min(...epicPhasePositions);
      expect(maxProductDocPos).toBeLessThan(minEpicPos);
    });
  });

  describe("phase_for_column", () => {
    it("returns the column id as phase (identity mapping)", () => {
      expect(phase_for_column("todo")).toBe("todo");
      expect(phase_for_column("active")).toBe("active");
      expect(phase_for_column("discovery")).toBe("discovery");
    });
  });

  describe("PHASE_LABELS consistency", () => {
    it("all phases in PHASES_BY_LEVEL have a label", () => {
      const levels: DocumentType[] = [
        "product-doc",
        "epic",
        "user-story",
        "task-high-pass",
        "task-low-pass",
        "task-ui",
      ];
      for (const level of levels) {
        for (const phase of PHASES_BY_LEVEL[level]) {
          expect(PHASE_LABELS[phase]).toBeDefined();
        }
      }
    });

    it("PHASES_BY_LEVEL matches expected structure", () => {
      expect(PHASES_BY_LEVEL["product-doc"]).toEqual([
        "draft",
        "review",
        "published",
      ]);
      expect(PHASES_BY_LEVEL["epic"]).toEqual([
        "discovery",
        "design",
        "ready",
        "active",
        "completed",
      ]);
      expect(PHASES_BY_LEVEL["user-story"]).toEqual([
        "discovery",
        "design",
        "ready",
        "active",
        "completed",
      ]);
      expect(PHASES_BY_LEVEL["task-high-pass"]).toEqual([
        "todo",
        "active",
        "completed",
      ]);
      expect(PHASES_BY_LEVEL["task-low-pass"]).toEqual([
        "todo",
        "active",
        "completed",
      ]);
      expect(PHASES_BY_LEVEL["task-ui"]).toEqual([
        "todo",
        "active",
        "completed",
      ]);
    });
  });
});
