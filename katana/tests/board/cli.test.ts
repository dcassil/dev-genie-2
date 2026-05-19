import { describe, it, expect, vi } from "vitest";
import { run_board_command } from "../../src/cli/board.js";
import type { BoardCommandArgs, BoardCommandDeps } from "../../src/cli/board.js";
import type { InternalBoardDeps, DocumentSummary } from "../../src/board/internal-deps.js";

describe("board CLI command", () => {
  const createFakeDeps = (docs: DocumentSummary[]): InternalBoardDeps => ({
    list_documents: vi.fn(async () => docs),
    transition_phase: vi.fn(async (code, phase) => {
      const doc = docs.find((d) => d.short_code === code);
      if (!doc) throw new Error(`Document ${code} not found`);
      return { ...doc, phase };
    }),
  });

  it("--backend external-stub produces output containing Backlog and In Progress columns", async () => {
    let output = "";
    const deps: BoardCommandDeps = {
      internal_deps: createFakeDeps([]),
      stdout: (s: string) => {
        output += s;
      },
    };

    const args: BoardCommandArgs = {
      backend: "external-stub",
      workspace_root: "/test/.katana",
    };

    const code = await run_board_command(args, deps);

    expect(code).toBe(0);
    expect(output).toContain("## Backlog (1)");
    expect(output).toContain("## In Progress (1)");
  });

  it("--backend internal with fake internal_deps returns heading line", async () => {
    let output = "";
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
    ];

    const deps: BoardCommandDeps = {
      internal_deps: createFakeDeps(docs),
      stdout: (s: string) => {
        output += s;
      },
    };

    const args: BoardCommandArgs = {
      backend: "internal",
      workspace_root: "/test/.katana",
    };

    const code = await run_board_command(args, deps);

    expect(code).toBe(0);
    expect(output).toContain("# Katana Board (internal)");
  });

  it("--hide-empty suppresses zero-card columns", async () => {
    let output = "";
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

    const deps: BoardCommandDeps = {
      internal_deps: createFakeDeps(docs),
      stdout: (s: string) => {
        output += s;
      },
    };

    const args: BoardCommandArgs = {
      backend: "internal",
      hide_empty: true,
      workspace_root: "/test/.katana",
    };

    const code = await run_board_command(args, deps);

    expect(code).toBe(0);
    // With hide_empty, only the Discovery column should be present
    expect(output).toContain("## Discovery (1)");
    // Other empty columns should not appear
    expect(output).not.toContain("## Draft");
    expect(output).not.toContain("## Review");
    expect(output).not.toContain("## Published");
  });

  it("default backend is internal", async () => {
    let output = "";
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

    const deps: BoardCommandDeps = {
      internal_deps: createFakeDeps(docs),
      stdout: (s: string) => {
        output += s;
      },
    };

    const args: BoardCommandArgs = {
      // backend intentionally omitted
      workspace_root: "/test/.katana",
    };

    const code = await run_board_command(args, deps);

    expect(code).toBe(0);
    expect(output).toContain("# Katana Board (internal)");
  });

  it("filters by level when provided", async () => {
    let output = "";
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
        short_code: "KAT-US-0001" as any,
        level: "user-story",
        title: "User Story 1",
        phase: "discovery",
        archived: false,
        updated_at: "2026-05-09T01:00:00Z",
      },
    ];

    const internalDeps = createFakeDeps(docs);
    const deps: BoardCommandDeps = {
      internal_deps: internalDeps,
      stdout: (s: string) => {
        output += s;
      },
    };

    const args: BoardCommandArgs = {
      backend: "internal",
      level: "epic",
      workspace_root: "/test/.katana",
    };

    const code = await run_board_command(args, deps);

    expect(code).toBe(0);
    expect(internalDeps.list_documents).toHaveBeenCalledWith(
      expect.objectContaining({ level: "epic" }),
    );
  });
});
