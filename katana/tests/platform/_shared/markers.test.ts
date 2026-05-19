import { describe, it, expect } from "vitest";
import {
  KATANA_BEGIN,
  KATANA_END,
  injectMarkerBlock,
  stripMarkerBlock,
  hasDuplicateMarkers,
} from "../../../src/platform/_shared/markers";

describe("marker utilities", () => {
  describe("injectMarkerBlock", () => {
    it("creates block when content is null", () => {
      const result = injectMarkerBlock(null, "block content");
      expect(result).toBe(`${KATANA_BEGIN}\nblock content\n${KATANA_END}\n`);
    });

    it("appends block to existing content", () => {
      const existing = "existing content\n";
      const result = injectMarkerBlock(existing, "new block");
      expect(result).toContain(existing);
      expect(result).toContain(`${KATANA_BEGIN}\nnew block\n${KATANA_END}\n`);
    });

    it("replaces existing block", () => {
      const existing = `before\n${KATANA_BEGIN}\nold block\n${KATANA_END}\nafter\n`;
      const result = injectMarkerBlock(existing, "new block");
      expect(result).toBe(`before\n${KATANA_BEGIN}\nnew block\n${KATANA_END}\nafter\n`);
    });

    it("always emits exactly one trailing newline after end marker", () => {
      const result = injectMarkerBlock(null, "content");
      expect(result.endsWith(`${KATANA_END}\n`)).toBe(true);
      expect(result.endsWith(`${KATANA_END}\n\n`)).toBe(false);
    });

    it("trims trailing whitespace from block", () => {
      const result = injectMarkerBlock(null, "content  \n\n  ");
      expect(result).toBe(`${KATANA_BEGIN}\ncontent\n${KATANA_END}\n`);
    });

    it("handles content without trailing newline", () => {
      const existing = "existing content";
      const result = injectMarkerBlock(existing, "new block");
      expect(result).toContain("existing content");
      expect(result).toContain(`${KATANA_BEGIN}\nnew block\n${KATANA_END}\n`);
    });

    it("replaces block with markers at different positions", () => {
      const existing = `${KATANA_BEGIN}\nold\n${KATANA_END}\ntrailing`;
      const result = injectMarkerBlock(existing, "new");
      expect(result).toBe(`${KATANA_BEGIN}\nnew\n${KATANA_END}\ntrailing`);
    });

    it("ignores malformed markers (begin without end)", () => {
      const existing = `text ${KATANA_BEGIN}\nno end`;
      const result = injectMarkerBlock(existing, "block");
      expect(result).toContain(existing);
    });

    it("ignores malformed markers (end without begin)", () => {
      const existing = `text ${KATANA_END}\nno begin`;
      const result = injectMarkerBlock(existing, "block");
      expect(result).toContain(existing);
    });

    it("ignores reversed markers (end before begin)", () => {
      const existing = `${KATANA_END}\nreversed\n${KATANA_BEGIN}`;
      const result = injectMarkerBlock(existing, "block");
      expect(result).toContain(existing);
    });
  });

  describe("stripMarkerBlock", () => {
    it("removes marker block from content", () => {
      const content = `before\n${KATANA_BEGIN}\nblock\n${KATANA_END}\nafter`;
      const result = stripMarkerBlock(content);
      expect(result).toBe("before\nafter");
    });

    it("removes block with no surrounding content", () => {
      const content = `${KATANA_BEGIN}\nblock\n${KATANA_END}`;
      const result = stripMarkerBlock(content);
      expect(result).toBe("");
    });

    it("returns unchanged content when no markers", () => {
      const content = "just some text";
      const result = stripMarkerBlock(content);
      expect(result).toBe(content);
    });

    it("returns unchanged when only begin marker", () => {
      const content = `text ${KATANA_BEGIN}\nno end`;
      const result = stripMarkerBlock(content);
      expect(result).toBe(content);
    });

    it("returns unchanged when only end marker", () => {
      const content = `text ${KATANA_END}\nno begin`;
      const result = stripMarkerBlock(content);
      expect(result).toBe(content);
    });

    it("preserves content before and after block", () => {
      const content = `first line\n${KATANA_BEGIN}\nblock content\n${KATANA_END}\nlast line`;
      const result = stripMarkerBlock(content);
      expect(result).toBe("first line\nlast line");
    });
  });

  describe("hasDuplicateMarkers", () => {
    it("returns false for no markers", () => {
      expect(hasDuplicateMarkers("just text")).toBe(false);
    });

    it("returns false for single balanced pair", () => {
      const content = `${KATANA_BEGIN}\nblock\n${KATANA_END}`;
      expect(hasDuplicateMarkers(content)).toBe(false);
    });

    it("returns true for duplicate begin markers", () => {
      const content = `${KATANA_BEGIN}\nfirst\n${KATANA_BEGIN}\nsecond\n${KATANA_END}`;
      expect(hasDuplicateMarkers(content)).toBe(true);
    });

    it("returns true for duplicate end markers", () => {
      const content = `${KATANA_BEGIN}\nblock\n${KATANA_END}\n${KATANA_END}`;
      expect(hasDuplicateMarkers(content)).toBe(true);
    });

    it("returns true when begin count exceeds end count", () => {
      const content = `${KATANA_BEGIN}\n${KATANA_BEGIN}\nblock\n${KATANA_END}`;
      expect(hasDuplicateMarkers(content)).toBe(true);
    });

    it("returns true when end count exceeds begin count", () => {
      const content = `${KATANA_BEGIN}\nblock\n${KATANA_END}\n${KATANA_END}`;
      expect(hasDuplicateMarkers(content)).toBe(true);
    });

    it("returns false for empty string", () => {
      expect(hasDuplicateMarkers("")).toBe(false);
    });
  });
});
