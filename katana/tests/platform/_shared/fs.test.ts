import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile, writeFile, mkdir, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  idempotentWrite,
  readUtf8OrNull,
  IdempotentWriteResult,
} from "../../../src/platform/_shared/fs";

describe("fs utilities", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `katana-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("idempotentWrite", () => {
    it("creates new file when it does not exist", async () => {
      const path = join(tmpDir, "new-file.txt");
      const result = await idempotentWrite(path, "content");

      expect(result.action).toBe("created");
      expect(result.bytes).toBe(7);
      const contents = await readFile(path, "utf8");
      expect(contents).toBe("content");
    });

    it("updates file when contents differ", async () => {
      const path = join(tmpDir, "file.txt");
      await writeFile(path, "old content");

      const result = await idempotentWrite(path, "new content");

      expect(result.action).toBe("updated");
      expect(result.bytes).toBe(11);
      const contents = await readFile(path, "utf8");
      expect(contents).toBe("new content");
    });

    it("skips file when contents match (string)", async () => {
      const path = join(tmpDir, "file.txt");
      const content = "same content";
      await writeFile(path, content);

      const result = await idempotentWrite(path, content);

      expect(result.action).toBe("skipped");
      expect(result.bytes).toBe(12);
    });

    it("skips file when contents match (buffer)", async () => {
      const path = join(tmpDir, "file.bin");
      const buffer = Buffer.from("binary data");
      await writeFile(path, buffer);

      const result = await idempotentWrite(path, buffer);

      expect(result.action).toBe("skipped");
      expect(result.bytes).toBe(11);
    });

    it("updates file with force option despite matching contents", async () => {
      const path = join(tmpDir, "file.txt");
      const content = "content";
      await writeFile(path, content);

      const result = await idempotentWrite(path, content, { force: true });

      expect(result.action).toBe("updated");
      expect(result.bytes).toBe(7);
    });

    it("does not write file with dryRun option", async () => {
      const path = join(tmpDir, "file.txt");
      const result = await idempotentWrite(path, "content", { dryRun: true });

      expect(result.action).toBe("created");
      expect(result.bytes).toBe(7);

      const exists = await readUtf8OrNull(path);
      expect(exists).toBeNull();
    });

    it("handles buffer input", async () => {
      const path = join(tmpDir, "binary.bin");
      const buffer = Buffer.from([0x48, 0x69]);

      const result = await idempotentWrite(path, buffer);

      expect(result.action).toBe("created");
      expect(result.bytes).toBe(2);
      const contents = await readFile(path);
      expect(contents).toEqual(buffer);
    });

    it("updates file when force is true even if skipped initially", async () => {
      const path = join(tmpDir, "file.txt");
      const content = "content";
      await writeFile(path, content);

      const firstResult = await idempotentWrite(path, content);
      expect(firstResult.action).toBe("skipped");

      const secondResult = await idempotentWrite(path, content, { force: true });
      expect(secondResult.action).toBe("updated");
    });

    it("creates file with dryRun when it does not exist", async () => {
      const path = join(tmpDir, "nonexistent.txt");
      const result = await idempotentWrite(path, "content", { dryRun: true });

      expect(result.action).toBe("created");
      const exists = await readUtf8OrNull(path);
      expect(exists).toBeNull();
    });
  });

  describe("readUtf8OrNull", () => {
    it("reads file as UTF-8 string", async () => {
      const path = join(tmpDir, "file.txt");
      const content = "hello world";
      await writeFile(path, content);

      const result = await readUtf8OrNull(path);
      expect(result).toBe(content);
    });

    it("returns null when file does not exist", async () => {
      const path = join(tmpDir, "nonexistent.txt");
      const result = await readUtf8OrNull(path);
      expect(result).toBeNull();
    });

    it("reads UTF-8 with special characters", async () => {
      const path = join(tmpDir, "utf8.txt");
      const content = "hello 世界 🌍";
      await writeFile(path, content, "utf8");

      const result = await readUtf8OrNull(path);
      expect(result).toBe(content);
    });

    it("reads empty file", async () => {
      const path = join(tmpDir, "empty.txt");
      await writeFile(path, "");

      const result = await readUtf8OrNull(path);
      expect(result).toBe("");
    });
  });
});
