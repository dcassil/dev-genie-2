import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const decisionPolicyDir = new URL("../src/decision-policy/", import.meta.url);
const adapterDir = new URL("../src/decision-policy/adapter/", import.meta.url);
const decisionPolicyPath = fileURLToPath(decisionPolicyDir);

describe("engines import boundaries", () => {
  it("keeps daimyo DecisionProvider and TieredDecisionProvider imports in the adapter only", async () => {
    const files = await sourceFiles(decisionPolicyDir);
    const offenders: string[] = [];

    for (const file of files) {
      if (file.includes("/adapter/")) continue;
      const content = await readFile(file, "utf8");
      if (/\bDecisionProvider\b|\bTieredDecisionProvider\b|\bmakeDecisionRecord\b/.test(content)) {
        offenders.push(relativeDecisionPolicyPath(file));
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps the PolicyDecisionProvider adapter as the only daimyo port adapter", async () => {
    const files = await sourceFiles(adapterDir);
    const adapterFiles = files.map(relativeDecisionPolicyPath).sort();

    expect(adapterFiles).toEqual([
      "adapter/index.ts",
      "adapter/policy-decision-provider.ts",
    ]);
  });
});

async function sourceFiles(root: URL): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, root);
    if (entry.isDirectory()) {
      files.push(...await sourceFiles(child));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(child.pathname);
    }
  }

  return files;
}

function relativeDecisionPolicyPath(filePath: string): string {
  return filePath.slice(decisionPolicyPath.length);
}
