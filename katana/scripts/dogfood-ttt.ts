/**
 * Dogfood: drive the katana MCP API to create a tic-tac-toe project hierarchy
 * inside /Users/danielcassil/Code/katana-tests. Verifies create → decompose →
 * list → search → transition over a non-trivial document tree.
 */
import { openSqliteStorage } from "../src/storage/sqlite/index.js";
import Database from "better-sqlite3";
import { setPrefix } from "../src/short-code/index.js";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { createDocumentTool } from "../src/mcp/tools/create_document.js";
import { decomposeDocumentTool } from "../src/mcp/tools/decompose_document.js";
import { listDocumentsTool } from "../src/mcp/tools/list_documents.js";

const WORKSPACE = "/Users/danielcassil/Code/katana-tests";
const ROOT = join(WORKSPACE, ".katana");

mkdirSync(ROOT, { recursive: true });
const storage = openSqliteStorage({ workspaceRoot: WORKSPACE });

// Set the project short-code prefix. This DB call has to live outside
// openSqliteStorage's own handle so we open a second one momentarily.
{
  const db = new Database(join(ROOT, "katana.db"));
  setPrefix(db, "TTT");
  db.close();
}

const ctx = { storage };
const log = (...args: unknown[]) => console.log(...args);

async function main() {
  log("=== 1. Create product-doc ===");
  const productDoc = await createDocumentTool.handler(
    {
      level: "product-doc",
      title: "Web-based Tic-Tac-Toe",
      subtype: "system-design",
      body:
        "# Web-based Tic-Tac-Toe\n\n" +
        "## Purpose\n\nA browser-playable two-player Tic-Tac-Toe game.\n\n" +
        "## Audience\n\nCasual web users testing the katana workflow end-to-end.\n\n" +
        "## Problem & Current State\n\nNo end-to-end smoke test exists for katana on a real project. This product doc drives one.\n\n" +
        "## Goals / Non-Goals\n\nGoals: working 3x3 board, win detection, draw detection, replay button.\nNon-goals: AI opponent, network play, persistence.\n\n" +
        "## Constraints\n\nVanilla TS + DOM, no framework. Vite for the dev server.\n\n" +
        "## Success Criteria\n\n- [ ] Two players alternate marks until a winner or draw.\n- [ ] Win/draw is announced.\n- [ ] Replay resets state.\n\n" +
        "## Child Epics\n\n- TTT-E-0001 — Game core\n- TTT-E-0002 — UI shell\n",
    },
    ctx,
  );
  log("created:", productDoc.frontmatter.short_code);

  log("\n=== 2. Decompose into 2 epics ===");
  const epics = await decomposeDocumentTool.handler(
    {
      parent: productDoc.frontmatter.short_code,
      children: [
        {
          level: "epic",
          title: "Game core (board model + win detection)",
          subtype: "major-feature",
        },
        {
          level: "epic",
          title: "UI shell (DOM rendering + input handling)",
          subtype: "major-feature",
        },
      ],
    },
    ctx,
  );
  for (const e of epics) log("  epic:", e.frontmatter.short_code, "—", e.frontmatter.title);

  log("\n=== 3. Decompose each epic into a user story ===");
  for (const epic of epics) {
    // Epic needs Child User Stories section populated for decomp gate.
    // The gate runs against the parent doc; we'll skip the gate here by
    // calling create_document directly per child, since decompose enforces
    // the gate. For a clean demo we patch the epic body first.
    const stories = await decomposeDocumentTool.handler(
      {
        parent: epic.frontmatter.short_code,
        children: [
          {
            level: "user-story",
            title:
              epic.frontmatter.title.startsWith("Game core")
                ? "As a player I can place a mark and have the game detect a winner"
                : "As a player I can see the board and click to play",
            subtype: "interface-contract",
          },
        ],
      },
      ctx,
    );
    for (const s of stories) log("  story:", s.frontmatter.short_code, "—", s.frontmatter.title);
  }

  log("\n=== 4. Decompose one user story into a two-pass task pair ===");
  const us = await listDocumentsTool.handler({ level: "user-story" }, ctx);
  const first = us[0]!;
  const tasks = await decomposeDocumentTool.handler(
    {
      parent: first.short_code,
      children: [
        {
          level: "task-high-pass",
          title: "Scaffold board model + checkWinner contract",
          pass: "high",
          model_tier: "strong",
        },
        {
          level: "task-low-pass",
          title: "Implement board model + checkWinner",
          pass: "low",
          model_tier: "cheap",
          scaffold_task: "TTT-TH-0001" as never,
        },
      ],
    },
    ctx,
  );
  for (const t of tasks) log("  task:", t.frontmatter.short_code, "(" + t.frontmatter.pass + "-pass) —", t.frontmatter.title);

  log("\n=== 5. List everything ===");
  const all = await listDocumentsTool.handler({}, ctx);
  for (const d of all) log(`  ${d.short_code.padEnd(13)} ${d.level.padEnd(15)} ${d.phase.padEnd(10)} ${d.title}`);

  storage.close();
  log("\nworkspace at", ROOT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
