import { describe, it, expect } from "vitest";
import { ExternalStubBoardPort } from "../../src/board/external-stub.js";

describe("ExternalStubBoardPort", () => {
  it("instantiates with workspace_root and no mapping", () => {
    const port = new ExternalStubBoardPort({
      workspace_root: "/tmp/.katana",
    });
    expect(port.backend).toBe("external-stub");
  });

  it("instantiates with mapping without throwing", () => {
    const port = new ExternalStubBoardPort({
      workspace_root: "/tmp/.katana",
      mapping: {
        column_to_phase: { backlog: "discovery" },
        default_level: "task-high-pass",
      },
    });
    expect(port.backend).toBe("external-stub");
  });

  it("list_board returns 3 columns and 2 cards by default", async () => {
    const port = new ExternalStubBoardPort({
      workspace_root: "/tmp/.katana",
    });
    const snapshot = await port.list_board();
    expect(snapshot.columns).toHaveLength(3);
    expect(snapshot.cards).toHaveLength(2);
    expect(snapshot.backend).toBe("external-stub");
  });

  it("list_board respects include_archived filter", async () => {
    const port = new ExternalStubBoardPort({
      workspace_root: "/tmp/.katana",
    });
    const snapshot = await port.list_board({ include_archived: false });
    const archivedCards = snapshot.cards.filter((c) => c.archived);
    expect(archivedCards).toHaveLength(0);
  });

  it("move_card returns a card with updated column_id", async () => {
    const port = new ExternalStubBoardPort({
      workspace_root: "/tmp/.katana",
    });
    const moved = await port.move_card("EXT-1", "done");
    expect(moved.id).toBe("EXT-1");
    expect(moved.column_id).toBe("done");
  });

  it("move_card does not mutate subsequent list_board calls", async () => {
    const port = new ExternalStubBoardPort({
      workspace_root: "/tmp/.katana",
    });
    await port.move_card("EXT-1", "done");
    const snapshot = await port.list_board();
    const ext1 = snapshot.cards.find((c) => c.id === "EXT-1");
    expect(ext1?.column_id).toBe("backlog");
  });

  it("move_card throws on unknown card id", async () => {
    const port = new ExternalStubBoardPort({
      workspace_root: "/tmp/.katana",
    });
    await expect(port.move_card("UNKNOWN", "done")).rejects.toThrow(
      "stub: unknown card UNKNOWN",
    );
  });

  it("move_card throws on unknown column id", async () => {
    const port = new ExternalStubBoardPort({
      workspace_root: "/tmp/.katana",
    });
    await expect(port.move_card("EXT-1", "nope")).rejects.toThrow(
      "stub: unknown column nope",
    );
  });

  it("get_card returns a card by id", async () => {
    const port = new ExternalStubBoardPort({
      workspace_root: "/tmp/.katana",
    });
    const card = await port.get_card("EXT-1");
    expect(card).not.toBeNull();
    expect(card?.id).toBe("EXT-1");
  });

  it("get_card returns null for unknown id", async () => {
    const port = new ExternalStubBoardPort({
      workspace_root: "/tmp/.katana",
    });
    const card = await port.get_card("UNKNOWN");
    expect(card).toBeNull();
  });
});
