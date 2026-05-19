import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ClaudeCodeAdapter } from "../../../src/platform/claude-code/index";
import { AgentDocSpec, InstallOptions } from "../../../src/platform/port";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("ClaudeCodeAdapter.generateAgentDoc()", () => {
  let tmpDir: string;
  let adapter: ClaudeCodeAdapter;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "katana-test-"));
    adapter = new ClaudeCodeAdapter();
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should create CLAUDE.md with marker block when file is missing", async () => {
    const opts: InstallOptions = {
      workspaceRoot: tmpDir,
      katanaRoot: "/path/to/katana",
      dryRun: false,
      force: false,
      mcpCommand: "katana",
      mcpArgs: [],
    };

    const spec: AgentDocSpec = {
      filename: "CLAUDE.md",
      block: "## Katana Workflow\n\nTest content",
      markerStart: "<!-- katana:begin -->",
      markerEnd: "<!-- katana:end -->",
    };

    const result = await adapter.generateAgentDoc(spec, opts);

    expect(result.action).toBe("created");
    expect(result.path).toBe(path.join(tmpDir, "CLAUDE.md"));

    const content = fs.readFileSync(result.path, "utf-8");
    expect(content).toContain("<!-- katana:begin -->");
    expect(content).toContain("## Katana Workflow");
    expect(content).toContain("<!-- katana:end -->");
    expect(content.endsWith("\n")).toBe(true);
  });

  it("should append marker block to existing file without markers", async () => {
    const claudeMdPath = path.join(tmpDir, "CLAUDE.md");
    const existingContent = "# Project Documentation\n\nSome content here.";
    fs.writeFileSync(claudeMdPath, existingContent);

    const opts: InstallOptions = {
      workspaceRoot: tmpDir,
      katanaRoot: "/path/to/katana",
      dryRun: false,
      force: false,
      mcpCommand: "katana",
      mcpArgs: [],
    };

    const spec: AgentDocSpec = {
      filename: "CLAUDE.md",
      block: "## Katana Workflow",
      markerStart: "<!-- katana:begin -->",
      markerEnd: "<!-- katana:end -->",
    };

    const result = await adapter.generateAgentDoc(spec, opts);

    expect(result.action).toBe("updated");

    const content = fs.readFileSync(claudeMdPath, "utf-8");
    expect(content).toContain("# Project Documentation");
    expect(content).toContain("Some content here.");
    expect(content).toContain("<!-- katana:begin -->");
    expect(content).toContain("## Katana Workflow");
    expect(content).toContain("<!-- katana:end -->");
  });

  it("should replace content between existing marker pairs", async () => {
    const claudeMdPath = path.join(tmpDir, "CLAUDE.md");
    const existingContent =
      "# Project\n\n<!-- katana:begin -->\nOld content\n<!-- katana:end -->\n\nMore stuff.";
    fs.writeFileSync(claudeMdPath, existingContent);

    const opts: InstallOptions = {
      workspaceRoot: tmpDir,
      katanaRoot: "/path/to/katana",
      dryRun: false,
      force: false,
      mcpCommand: "katana",
      mcpArgs: [],
    };

    const spec: AgentDocSpec = {
      filename: "CLAUDE.md",
      block: "New katana content",
      markerStart: "<!-- katana:begin -->",
      markerEnd: "<!-- katana:end -->",
    };

    const result = await adapter.generateAgentDoc(spec, opts);

    expect(result.action).toBe("updated");

    const content = fs.readFileSync(claudeMdPath, "utf-8");
    expect(content).toContain("# Project");
    expect(content).toContain("New katana content");
    expect(content).toContain("More stuff.");
    expect(content).not.toContain("Old content");
  });

  it("should throw error on duplicate marker pairs", async () => {
    const claudeMdPath = path.join(tmpDir, "CLAUDE.md");
    const existingContent =
      "<!-- katana:begin -->Content1<!-- katana:end -->\n<!-- katana:begin -->Content2<!-- katana:end -->";
    fs.writeFileSync(claudeMdPath, existingContent);

    const opts: InstallOptions = {
      workspaceRoot: tmpDir,
      katanaRoot: "/path/to/katana",
      dryRun: false,
      force: false,
      mcpCommand: "katana",
      mcpArgs: [],
    };

    const spec: AgentDocSpec = {
      filename: "CLAUDE.md",
      block: "New content",
      markerStart: "<!-- katana:begin -->",
      markerEnd: "<!-- katana:end -->",
    };

    await expect(adapter.generateAgentDoc(spec, opts)).rejects.toThrow(
      /Duplicate marker pairs found/
    );
  });

  it("should be idempotent on re-run", async () => {
    const opts: InstallOptions = {
      workspaceRoot: tmpDir,
      katanaRoot: "/path/to/katana",
      dryRun: false,
      force: false,
      mcpCommand: "katana",
      mcpArgs: [],
    };

    const spec: AgentDocSpec = {
      filename: "CLAUDE.md",
      block: "## Katana Workflow\n\nStatic content",
      markerStart: "<!-- katana:begin -->",
      markerEnd: "<!-- katana:end -->",
    };

    // First run
    const result1 = await adapter.generateAgentDoc(spec, opts);
    expect(result1.action).toBe("created");

    // Second run with same content
    const result2 = await adapter.generateAgentDoc(spec, opts);
    expect(result2.action).toBe("skipped");

    // Verify content is unchanged
    const content = fs.readFileSync(result2.path, "utf-8");
    expect(content).toContain("## Katana Workflow");
  });
});
