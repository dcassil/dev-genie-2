import { test } from "vitest";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { openSqliteStorage } from "../../src/storage/sqlite/index.js";
import { setPrefix } from "../../src/short-code/index.js";
import Database from "better-sqlite3";
import { makeInProcessClient } from "./mcp-client.js";
import { readMarkdown } from "../../src/storage/markdown/index.js";
import type { Document, DocumentSummary, ShortCode } from "../../src/types/document.js";

test("round-trip integration: create -> list -> search -> transition", async () => {
  // 1. Set up: temp dir, openSqliteStorage, setPrefix
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "katana-test-"));
  try {
    const storage = openSqliteStorage({ workspaceRoot: tmpDir });
    const db = new Database(path.join(tmpDir, ".katana", "katana.db"));
    setPrefix(db, "KAT");
    db.close();

    const client = makeInProcessClient(storage);

    // 2. create_document product-doc "Architecture 2026" subtype=architecture -> KAT-PD-0001
    const productDoc = await client.call<Document>("create_document", {
      level: "product-doc",
      title: "Architecture 2026",
      subtype: "architecture",
    });
    assert.equal(productDoc.frontmatter.short_code, "KAT-PD-0001");
    assert.equal(productDoc.frontmatter.level, "product-doc");

    // 3. decompose_document parent=KAT-PD-0001 children=[ epic "Auth Epic" subtype=major-feature ] -> KAT-E-0001
    const [epic] = await client.call<Document[]>("decompose_document", {
      parent: "KAT-PD-0001",
      children: [{ level: "epic", title: "Auth Epic", subtype: "major-feature" }],
    });
    assert.equal(epic.frontmatter.short_code, "KAT-E-0001");
    assert.equal(epic.frontmatter.parent, "KAT-PD-0001");

    // 4. decompose_document parent=KAT-E-0001 children=[ user-story "Sign-in story" subtype=interface-contract ] -> KAT-US-0001
    const [userStory] = await client.call<Document[]>("decompose_document", {
      parent: "KAT-E-0001",
      children: [
        { level: "user-story", title: "Sign-in story", subtype: "interface-contract" },
      ],
    });
    assert.equal(userStory.frontmatter.short_code, "KAT-US-0001");
    assert.equal(userStory.frontmatter.parent, "KAT-E-0001");

    // 5. decompose_document parent=KAT-US-0001 children=[
    //     task-high-pass "Scaffold sign-in" pass=high model_tier=strong,
    //     task-low-pass "Implement sign-in" pass=low model_tier=cheap scaffold_task=KAT-TH-0001
    //   ] -> KAT-TH-0001 + KAT-TL-0001
    const [taskHigh, taskLow] = await client.call<Document[]>("decompose_document", {
      parent: "KAT-US-0001",
      children: [
        {
          level: "task-high-pass",
          title: "Scaffold sign-in",
          pass: "high",
          model_tier: "strong",
        },
        {
          level: "task-low-pass",
          title: "Implement sign-in",
          pass: "low",
          model_tier: "cheap",
          scaffold_task: "KAT-TH-0001",
        },
      ],
    });
    assert.equal(taskHigh.frontmatter.short_code, "KAT-TH-0001");
    assert.equal(taskHigh.frontmatter.pass, "high");
    assert.equal(taskHigh.frontmatter.model_tier, "strong");
    assert.equal(taskLow.frontmatter.short_code, "KAT-TL-0001");
    assert.equal(taskLow.frontmatter.scaffold_task, "KAT-TH-0001");

    // 6. list_documents (no filter) returns 5 summaries; list_documents parent=KAT-US-0001 returns 2
    const allDocs = await client.call<DocumentSummary[]>("list_documents", {});
    assert.equal(allDocs.length, 5, `Expected 5 documents, got ${allDocs.length}`);

    const childrenUS = await client.call<DocumentSummary[]>("list_documents", {
      parent: "KAT-US-0001",
    });
    assert.equal(childrenUS.length, 2, `Expected 2 children of KAT-US-0001, got ${childrenUS.length}`);
    assert.ok(
      childrenUS.every((c) => c.parent === "KAT-US-0001"),
      "All children should have parent=KAT-US-0001"
    );

    // 7. search_documents query="sign-in" -> at least 1 hit; assert snippet non-empty
    const hits = await client.call<any[]>("search_documents", {
      query: "sign-in",
    });
    assert.ok(hits.length >= 1, `Expected at least 1 search hit for "sign-in", got ${hits.length}`);
    assert.ok(
      hits.some((h) => h.snippet && h.snippet.length > 0),
      "At least one hit should have non-empty snippet"
    );

    // 8. read_document short_code=KAT-TH-0001 -> body matches what was written; frontmatter pass==='high'
    const readTH = await client.call<Document>("read_document", {
      short_code: "KAT-TH-0001",
    });
    assert.equal(readTH.frontmatter.short_code, "KAT-TH-0001");
    assert.equal(readTH.frontmatter.pass, "high");
    assert.equal(readTH.frontmatter.title, "Scaffold sign-in");

    // 9. edit_document short_code=KAT-TH-0001 search="Scaffold" replace="Outline" -> read again, body contains "Outline"
    await client.call<Document>("edit_document", {
      short_code: "KAT-TH-0001",
      search: "Scaffold",
      replace: "Outline",
    });
    const editedTH = await client.call<Document>("read_document", {
      short_code: "KAT-TH-0001",
    });
    assert.ok(
      editedTH.body.includes("Outline"),
      "Body should contain 'Outline' after edit"
    );

    // 10. transition_phase short_code=KAT-TH-0001 -> phase becomes "active"; tags include "#phase/active", not "#phase/todo"
    const transitioned = await client.call<Document>("transition_phase", {
      short_code: "KAT-TH-0001",
    });
    assert.equal(transitioned.frontmatter.phase, "active");
    assert.ok(
      transitioned.frontmatter.tags.includes("#phase/active"),
      "Tags should include #phase/active"
    );
    assert.ok(
      !transitioned.frontmatter.tags.includes("#phase/todo"),
      "Tags should not include #phase/todo"
    );

    // 11. validate_document short_code=KAT-TL-0001 -> ok===true
    const validation = await client.call<any>("validate_document", {
      short_code: "KAT-TL-0001",
    });
    assert.equal(validation.ok, true, "Validation should pass for KAT-TL-0001");

    // 12. Negative: transition_phase short_code=KAT-PD-0001 phase="draft" force=false -> throws (backward)
    let backward = false;
    try {
      await client.call<Document>("transition_phase", {
        short_code: "KAT-PD-0001",
        phase: "draft",
        force: false,
      });
    } catch (e: any) {
      backward = e.message.includes("Backward") || e.message.includes("backward");
    }
    assert.ok(backward, "Backward transition should be blocked");

    // 13. Negative: decompose_document parent=KAT-E-0001 children=[ task-high-pass ... ] -> throws ("not a valid child")
    let invalidChild = false;
    try {
      await client.call<Document[]>("decompose_document", {
        parent: "KAT-E-0001",
        children: [
          {
            level: "task-high-pass",
            title: "Invalid",
            pass: "high",
            model_tier: "strong",
          },
        ],
      });
    } catch (e: any) {
      invalidChild = e.message.includes("not a valid child");
    }
    assert.ok(invalidChild, "Task-high-pass should not be valid child of epic");

    // Verify disk structure: .katana/ has exactly 5 .md files
    const katanaRoot = path.join(tmpDir, ".katana");
    const mdFiles: string[] = [];
    function findMdFiles(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          findMdFiles(fullPath);
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          mdFiles.push(fullPath);
        }
      }
    }
    findMdFiles(katanaRoot);
    assert.equal(mdFiles.length, 5, `Expected exactly 5 .md files, found ${mdFiles.length}`);

    // Verify each file's frontmatter round-trips byte-stable through readMarkdown
    for (const mdFile of mdFiles) {
      const doc = readMarkdown(mdFile);
      const { writeMarkdown } = await import("../../src/storage/markdown/index.js");
      const { file_hash: newHash } = writeMarkdown(mdFile, doc.frontmatter, doc.body);
      assert.equal(
        newHash,
        doc.file_hash,
        `Frontmatter/body not byte-stable for ${path.relative(tmpDir, mdFile)}`
      );
    }

    storage.close();
  } finally {
    // Clean up temp directory
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
