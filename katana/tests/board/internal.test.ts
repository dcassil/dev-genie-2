import { describe, it, expect, vi } from "vitest";
import { InternalBoardPort } from "../../src/board/internal.js";
import type { InternalBoardDeps, DocumentSummary } from "../../src/board/internal-deps.js";
import type { BoardPortOptions } from "../../src/board/port.js";

describe("InternalBoardPort", () => {
  const defaultOpts: BoardPortOptions = {
    workspace_root: "/test/.katana",
  };

  const createFakeDeps = (docs: DocumentSummary[]): InternalBoardDeps => ({
    list_documents: vi.fn(async () => docs),
    transition_phase: vi.fn(async (code, phase) => {
      const doc = docs.find((d) => d.short_code === code);
      if (!doc) throw new Error(`Document ${code} not found`);
      return { ...doc, phase };
    }),
  });

  it("list_board() returns cards grouped by phase", async () => {
    const docs: DocumentSummary[] = [
      {
        short_code: "KAT-E-0001" as any,
        level: "epic",
        title: "Epic 1",
        phase: "discovery",
        archived: false,
        updated_at: "2026-05-09T00:00:00Z",
      },
      {
        short_code: "KAT-E-0002" as any,
        level: "epic",
        title: "Epic 2",
        phase: "active",
        archived: false,
        updated_at: "2026-05-09T01:00:00Z",
      },
      {
        short_code: "KAT-US-0001" as any,
        level: "user-story",
        title: "User Story 1",
        phase: "design",
        archived: false,
        updated_at: "2026-05-09T02:00:00Z",
      },
      {
        short_code: "KAT-TH-0001" as any,
        level: "task-high-pass",
        title: "Task 1",
        phase: "todo",
        archived: false,
        updated_at: "2026-05-09T03:00:00Z",
      },
      {
        short_code: "KAT-TH-0002" as any,
        level: "task-high-pass",
        title: "Task 2",
        phase: "completed",
        archived: false,
        updated_at: "2026-05-09T04:00:00Z",
      },
    ];

    const deps = createFakeDeps(docs);
    const port = new InternalBoardPort(deps, defaultOpts);
    const snapshot = await port.list_board();

    expect(snapshot.backend).toBe("internal");
    expect(snapshot.cards).toHaveLength(5);
    expect(snapshot.cards[0].column_id).toBe("discovery");
    expect(snapshot.cards[1].column_id).toBe("active");
    expect(snapshot.cards[2].column_id).toBe("design");
    expect(snapshot.cards[3].column_id).toBe("todo");
    expect(snapshot.cards[4].column_id).toBe("completed");
    expect(snapshot.columns.length).toBeGreaterThan(0);
  });

  it("move_card() delegates to transition_phase", async () => {
    const docs: DocumentSummary[] = [
      {
        short_code: "KAT-E-0001" as any,
        level: "epic",
        title: "Epic 1",
        phase: "discovery",
        archived: false,
        updated_at: "2026-05-09T00:00:00Z",
      },
    ];

    const deps = createFakeDeps(docs);
    const port = new InternalBoardPort(deps, defaultOpts);

    const updated = await port.move_card("KAT-E-0001", "ready");

    expect(deps.transition_phase).toHaveBeenCalledOnce();
    expect(deps.transition_phase).toHaveBeenCalledWith("KAT-E-0001", "ready");
    expect(updated.column_id).toBe("ready");
    expect(updated.phase).toBe("ready");
  });

  it("get_card() returns null for missing card", async () => {
    const docs: DocumentSummary[] = [
      {
        short_code: "KAT-E-0001" as any,
        level: "epic",
        title: "Epic 1",
        phase: "discovery",
        archived: false,
        updated_at: "2026-05-09T00:00:00Z",
      },
    ];

    const deps = createFakeDeps(docs);
    const port = new InternalBoardPort(deps, defaultOpts);

    const card = await port.get_card("KAT-E-9999");

    expect(card).toBeNull();
  });
});
