import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { run_board_command } from "../../src/cli/board.js";
import type { InternalBoardDeps, DocumentSummary } from "../../src/board/internal-deps.js";

function loadFixtureDeps(root: string): InternalBoardDeps {
  const summaries: DocumentSummary[] = [
    {
      short_code: "KAT-PD-0001",
      level: "product-doc",
      title: "Test Product",
      phase: "published",
      archived: false,
      updated_at: "2026-05-09T10:00:00.000000+00:00",
    },
    {
      short_code: "KAT-E-0001",
      level: "epic",
      title: "Test Epic Discovery",
      phase: "discovery",
      parent: "KAT-PD-0001",
      archived: false,
      updated_at: "2026-05-09T11:00:00.000000+00:00",
    },
    {
      short_code: "KAT-E-0002",
      level: "epic",
      title: "Test Epic Design",
      phase: "design",
      parent: "KAT-PD-0001",
      archived: false,
      updated_at: "2026-05-09T11:10:00.000000+00:00",
    },
    {
      short_code: "KAT-US-0001",
      level: "user-story",
      title: "Test User Story To Do",
      phase: "todo",
      parent: "KAT-E-0001",
      archived: false,
      updated_at: "2026-05-09T12:00:00.000000+00:00",
    },
    {
      short_code: "KAT-THI-0001",
      level: "task-high-pass",
      title: "Test Task High Pass",
      phase: "todo",
      parent: "KAT-US-0001",
      archived: false,
      updated_at: "2026-05-09T13:00:00.000000+00:00",
    },
    {
      short_code: "KAT-TLI-0001",
      level: "task-low-pass",
      title: "Test Task Low Pass",
      phase: "todo",
      parent: "KAT-US-0001",
      archived: false,
      updated_at: "2026-05-09T13:10:00.000000+00:00",
    },
  ];
  return {
    list_documents: async (opts) => summaries.filter((s) =>
      (!opts.level || s.level === opts.level) &&
      (!opts.parent || s.parent === opts.parent) &&
      (opts.include_archived || !s.archived)
    ),
    transition_phase: async () => { throw new Error("not used in smoke"); },
  };
}

const STABLE = "GENERATED_AT_REPLACED";
function stabilize(md: string): string {
  return md.replace(/generated_at: [^\n]+/, `generated_at: ${STABLE}`);
}

describe("board smoke", () => {
  const root = path.join(__dirname, "fixtures/workspace");
  it("internal backend matches golden", async () => {
    const out: string[] = [];
    const code = await run_board_command(
      { backend: "internal", workspace_root: root, hide_empty: false },
      { internal_deps: loadFixtureDeps(root), stdout: (s) => out.push(s) },
    );
    expect(code).toBe(0);
    const expected = fs.readFileSync(path.join(__dirname, "fixtures/expected-internal.md"), "utf8");
    expect(stabilize(out.join(""))).toBe(stabilize(expected));
  });

  it("external-stub backend matches golden", async () => {
    const out: string[] = [];
    const code = await run_board_command(
      { backend: "external-stub", workspace_root: root },
      { internal_deps: loadFixtureDeps(root), stdout: (s) => out.push(s) },
    );
    expect(code).toBe(0);
    const expected = fs.readFileSync(path.join(__dirname, "fixtures/expected-stub.md"), "utf8");
    expect(stabilize(out.join(""))).toBe(stabilize(expected));
  });
});
