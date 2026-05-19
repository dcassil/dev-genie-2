import { readFile, writeFile } from "fs/promises";
import { createHash } from "crypto";

export interface IdempotentWriteResult {
  action: "created" | "updated" | "skipped";
  bytes: number;
}

/**
 * Write file idempotently: skips if contents match existing file (by SHA256 hash).
 * Returns action taken and byte count.
 */
export async function idempotentWrite(
  path: string,
  contents: string | Buffer,
  opts?: { force?: boolean; dryRun?: boolean }
): Promise<IdempotentWriteResult> {
  const buffer =
    typeof contents === "string" ? Buffer.from(contents, "utf8") : contents;
  const newHash = createHash("sha256").update(buffer).digest("hex");

  let existing: Buffer | null = null;
  try {
    existing = await readFile(path);
  } catch {
    // File does not exist
  }

  if (existing !== null && !opts?.force) {
    const existingHash = createHash("sha256").update(existing).digest("hex");
    if (newHash === existingHash) {
      return { action: "skipped", bytes: buffer.length };
    }
  }

  if (!opts?.dryRun) {
    await writeFile(path, buffer);
  }

  const action = existing === null ? "created" : "updated";
  return { action, bytes: buffer.length };
}

/**
 * Read file as UTF-8 string, or return null if file does not exist.
 */
export async function readUtf8OrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}
