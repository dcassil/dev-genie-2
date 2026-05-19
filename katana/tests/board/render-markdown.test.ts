import { describe, it, expect } from "vitest";
import { render_markdown } from "../../src/board/render-markdown.js";
import type { BoardSnapshot } from "../../src/board/port.js";
import snapshot from "./fixtures/snapshot.json" assert { type: "json" };

describe("render_markdown", () => {
  it("renders a board snapshot to deterministic markdown", () => {
    const result = render_markdown(snapshot as BoardSnapshot);
    expect(result).toMatchSnapshot();
  });

  it("hides empty columns when hide_empty_columns: true", () => {
    const emptyColSnapshot: BoardSnapshot = {
      generated_at: "2026-05-09T18:00:00Z",
      backend: "internal",
      columns: [
        { id: "todo", title: "To Do", order: 0 },
        { id: "empty", title: "Empty Column", order: 1 },
      ],
      cards: [
        {
          id: "card-1",
          column_id: "todo",
          title: "Test",
          short_code: "KAT-T-0001",
          updated_at: "2026-05-09T10:00:00Z",
          archived: false,
        },
      ],
    };
    const result = render_markdown(emptyColSnapshot, {
      hide_empty_columns: true,
    });
    expect(result).not.toContain("## Empty Column");
  });

  it("escapes pipe characters in titles", () => {
    const snapshotWithPipe: BoardSnapshot = {
      generated_at: "2026-05-09T18:00:00Z",
      backend: "internal",
      columns: [{ id: "todo", title: "To Do", order: 0 }],
      cards: [
        {
          id: "card-1",
          column_id: "todo",
          title: "Task | with pipe",
          short_code: "KAT-T-0001",
          updated_at: "2026-05-09T10:00:00Z",
          archived: false,
        },
      ],
    };
    const result = render_markdown(snapshotWithPipe);
    expect(result).toContain("Task \\| with pipe");
  });

  it("sorts cards by short_code ascending within each column", () => {
    const unsortedSnapshot: BoardSnapshot = {
      generated_at: "2026-05-09T18:00:00Z",
      backend: "internal",
      columns: [{ id: "todo", title: "To Do", order: 0 }],
      cards: [
        {
          id: "card-2",
          column_id: "todo",
          title: "Task B",
          short_code: "KAT-T-0002",
          updated_at: "2026-05-09T10:00:00Z",
          archived: false,
        },
        {
          id: "card-1",
          column_id: "todo",
          title: "Task A",
          short_code: "KAT-T-0001",
          updated_at: "2026-05-09T10:00:00Z",
          archived: false,
        },
      ],
    };
    const result = render_markdown(unsortedSnapshot);
    const lines = result.split("\n");
    const taskAIdx = lines.findIndex((l) => l.includes("KAT-T-0001"));
    const taskBIdx = lines.findIndex((l) => l.includes("KAT-T-0002"));
    expect(taskAIdx).toBeLessThan(taskBIdx);
  });

  it("includes meta footer by default", () => {
    const result = render_markdown(snapshot as BoardSnapshot);
    expect(result).toContain("_backend: internal · generated_at:");
  });

  it("omits meta footer when show_meta: false", () => {
    const result = render_markdown(snapshot as BoardSnapshot, {
      show_meta: false,
    });
    expect(result).not.toContain("_backend:");
  });

  it("uses custom heading when provided", () => {
    const result = render_markdown(snapshot as BoardSnapshot, {
      heading: "My Custom Board",
    });
    expect(result).toContain("# My Custom Board");
  });

  it("ends output with trailing newline", () => {
    const result = render_markdown(snapshot as BoardSnapshot);
    expect(result.endsWith("\n")).toBe(true);
  });
});
