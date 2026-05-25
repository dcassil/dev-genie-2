import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const decisionPolicyDir = new URL("../src/decision-policy/", import.meta.url);
const adapterDir = new URL("../src/decision-policy/adapter/", import.meta.url);
const installerDir = new URL("../src/installer/", import.meta.url);
const decisionPolicyPath = fileURLToPath(decisionPolicyDir);
const installerPath = fileURLToPath(installerDir);

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

  it("keeps installer detect and plan write-free while applier only uses the ManagedWriter port", async () => {
    const detector = await readFile(new URL("../src/installer/detector.ts", import.meta.url), "utf8");
    const planner = await readFile(new URL("../src/installer/planner.ts", import.meta.url), "utf8");
    const applier = await readFile(new URL("../src/installer/applier.ts", import.meta.url), "utf8");
    const detectPlanWritePatterns = /\b(writeFile|appendFile|mkdir|rm|unlink|rmdir|rename|copyFile|createWriteStream)\b|node:fs/;

    expect(detector).not.toMatch(detectPlanWritePatterns);
    expect(planner).not.toMatch(detectPlanWritePatterns);
    expect(importLines(applier).join("\n")).not.toMatch(/\.\/adapter\/|dev-genie|katana|node:fs/);
    expect(applier).not.toMatch(/\bwriteFile\b|\bappendFile\b|\bcreateWriteStream\b/);
    expect(relativeInstallerPath(fileURLToPath(new URL("../src/installer/applier.ts", import.meta.url)))).toBe("applier.ts");
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

function relativeInstallerPath(filePath: string): string {
  return filePath.slice(installerPath.length);
}

function importLines(source: string): readonly string[] {
  return source.split(/\r?\n/).filter((line) => line.startsWith("import "));
}
