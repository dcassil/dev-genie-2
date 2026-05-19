import { describe, it, expect } from "vitest";
import {
  MalformedMcpJsonError,
  mergeMcpServers,
  removeMcpServer,
} from "../../../src/platform/_shared/json-merge";

describe("json-merge utilities", () => {
  describe("mergeMcpServers", () => {
    it("creates mcpServers object when input is null", () => {
      const result = mergeMcpServers(null, "test-server", { command: "test" });
      const parsed = JSON.parse(result);
      expect(parsed.mcpServers).toBeDefined();
      expect(parsed.mcpServers["test-server"]).toEqual({ command: "test" });
    });

    it("adds server to existing mcpServers", () => {
      const existing = JSON.stringify({
        mcpServers: { "existing-server": { command: "existing" } },
      });
      const result = mergeMcpServers(existing, "new-server", { command: "new" });
      const parsed = JSON.parse(result);
      expect(parsed.mcpServers["existing-server"]).toEqual({ command: "existing" });
      expect(parsed.mcpServers["new-server"]).toEqual({ command: "new" });
    });

    it("replaces existing server entry", () => {
      const existing = JSON.stringify({
        mcpServers: { "test-server": { command: "old" } },
      });
      const result = mergeMcpServers(existing, "test-server", { command: "new" });
      const parsed = JSON.parse(result);
      expect(parsed.mcpServers["test-server"]).toEqual({ command: "new" });
    });

    it("preserves other top-level properties", () => {
      const existing = JSON.stringify({
        mcpServers: { existing: { command: "test" } },
        otherProp: "value",
      });
      const result = mergeMcpServers(existing, "new", { command: "test2" });
      const parsed = JSON.parse(result);
      expect(parsed.otherProp).toBe("value");
      expect(parsed.mcpServers.existing).toBeDefined();
      expect(parsed.mcpServers.new).toBeDefined();
    });

    it("creates mcpServers if missing from existing JSON", () => {
      const existing = JSON.stringify({ someOtherProp: "value" });
      const result = mergeMcpServers(existing, "server", { command: "test" });
      const parsed = JSON.parse(result);
      expect(parsed.mcpServers).toBeDefined();
      expect(parsed.mcpServers.server).toEqual({ command: "test" });
    });

    it("formats output as pretty JSON with newline", () => {
      const result = mergeMcpServers(null, "server", { key: "value" });
      expect(result.endsWith("\n")).toBe(true);
      expect(result).toContain("\n  ");
    });

    it("throws MalformedMcpJsonError on invalid JSON", () => {
      expect(() => mergeMcpServers("{ invalid json", "server", {})).toThrow(
        MalformedMcpJsonError
      );
    });

    it("handles complex entry objects", () => {
      const entry = {
        command: "npx",
        args: ["test"],
        env: { KEY: "value" },
        nested: { deep: { value: 42 } },
      };
      const result = mergeMcpServers(null, "complex", entry);
      const parsed = JSON.parse(result);
      expect(parsed.mcpServers.complex).toEqual(entry);
    });

    it("preserves key order when merging", () => {
      const existing = JSON.stringify({
        mcpServers: { a: {}, b: {}, c: {} },
      });
      const result = mergeMcpServers(existing, "d", {});
      expect(result.indexOf('"a"')).toBeLessThan(result.indexOf('"d"'));
    });
  });

  describe("removeMcpServer", () => {
    it("removes server from mcpServers", () => {
      const existing = JSON.stringify({
        mcpServers: {
          "server-to-remove": { command: "test" },
          keep: { command: "keep" },
        },
      });
      const result = removeMcpServer(existing, "server-to-remove");
      const parsed = JSON.parse(result!);
      expect(parsed.mcpServers["server-to-remove"]).toBeUndefined();
      expect(parsed.mcpServers["keep"]).toBeDefined();
    });

    it("preserves other servers", () => {
      const existing = JSON.stringify({
        mcpServers: {
          "keep-this": { command: "keep" },
          "remove-this": { command: "remove" },
        },
      });
      const result = removeMcpServer(existing, "remove-this");
      const parsed = JSON.parse(result!);
      expect(parsed.mcpServers["keep-this"]).toEqual({ command: "keep" });
      expect(parsed.mcpServers["remove-this"]).toBeUndefined();
    });

    it("returns null when mcpServers becomes empty", () => {
      const existing = JSON.stringify({
        mcpServers: { "only-server": { command: "test" } },
      });
      const result = removeMcpServer(existing, "only-server");
      expect(result).toBeNull();
    });

    it("preserves other top-level properties", () => {
      const existing = JSON.stringify({
        mcpServers: { server: {} },
        otherProp: "value",
      });
      const result = removeMcpServer(existing, "server");
      const parsed = JSON.parse(result!);
      expect(parsed.otherProp).toBe("value");
    });

    it("does not throw when removing non-existent server", () => {
      const existing = JSON.stringify({
        mcpServers: { "existing-server": {} },
      });
      const result = removeMcpServer(existing, "nonexistent");
      const parsed = JSON.parse(result!);
      expect(parsed.mcpServers["existing-server"]).toBeDefined();
    });

    it("throws MalformedMcpJsonError on invalid JSON", () => {
      expect(() => removeMcpServer("{ invalid", "server")).toThrow(
        MalformedMcpJsonError
      );
    });

    it("returns formatted JSON with newline", () => {
      const existing = JSON.stringify({
        mcpServers: { a: {}, b: {} },
      });
      const result = removeMcpServer(existing, "a");
      expect(result).not.toBeNull();
      expect(result!.endsWith("\n")).toBe(true);
    });

    it("handles missing mcpServers property gracefully", () => {
      const existing = JSON.stringify({ someOtherProp: "value" });
      const result = removeMcpServer(existing, "server");
      const parsed = JSON.parse(result!);
      expect(parsed.someOtherProp).toBe("value");
    });

    it("removes server from large configuration", () => {
      const existing = JSON.stringify({
        mcpServers: {
          server1: { args: [1, 2, 3] },
          server2: { args: [4, 5, 6] },
          server3: { args: [7, 8, 9] },
        },
        config: { debug: true },
      });
      const result = removeMcpServer(existing, "server2");
      const parsed = JSON.parse(result!);
      expect(parsed.mcpServers.server2).toBeUndefined();
      expect(parsed.mcpServers.server1).toBeDefined();
      expect(parsed.mcpServers.server3).toBeDefined();
    });
  });

  describe("MalformedMcpJsonError", () => {
    it("is an Error subclass", () => {
      const err = new MalformedMcpJsonError("test");
      expect(err).toBeInstanceOf(Error);
    });

    it("has correct name property", () => {
      const err = new MalformedMcpJsonError("test");
      expect(err.name).toBe("MalformedMcpJsonError");
    });

    it("preserves error message", () => {
      const message = "custom error message";
      const err = new MalformedMcpJsonError(message);
      expect(err.message).toBe(message);
    });
  });
});
