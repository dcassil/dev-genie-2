import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const portsDir = fileURLToPath(new URL("../../src/core/ports", import.meta.url));
const coreDir = dirname(portsDir);
const siblingImportPattern =
  /from ["'][^"']*(?:katana|guardrails|audit)[^"']*["']|require\(["'][^"']*(?:katana|guardrails|audit)[^"']*["']\)/;

describe("core port boundaries", () => {
  it("keeps DecisionProvider -> AgentTransport as the only named cross-port edge", async () => {
    const entries = await readdir(portsDir);
    const portFiles = entries.filter((entry) => entry.endsWith(".ts")).sort();
    const crossPortImports: string[] = [];

    for (const file of portFiles) {
      const content = await readFile(join(portsDir, file), "utf8");
      const matches = content.matchAll(/from "\.\/([a-z-]+)\.js"/g);
      for (const match of matches) {
        const importedPort = match[1];
        if (importedPort !== undefined) {
          crossPortImports.push(`${file}->${importedPort}.ts`);
        }
      }
    }

    const decisionProvider = await readFile(join(portsDir, "decision-provider.ts"), "utf8");
    expect(crossPortImports).toEqual(["decision-provider.ts->agent-transport.ts"]);
    expect(decisionProvider).toContain("The only allowed cross-port edge in the Daimyo core.");
    expect(decisionProvider).toContain("Tier-2 read-only investigation");
  });

  it("keeps core imports inside src/core", async () => {
    const entries = await readdir(coreDir);
    const coreFiles = entries.filter((entry) => entry.endsWith(".ts"));
    const externalCoreImports: string[] = [];

    for (const file of coreFiles) {
      const content = await readFile(join(coreDir, file), "utf8");
      const matches = content.matchAll(/from "\.\.\/([^"]+)"/g);
      for (const match of matches) {
        const importedPath = match[1];
        if (importedPath !== undefined) {
          externalCoreImports.push(`${file}->${importedPath}`);
        }
      }
    }

    expect(externalCoreImports).toEqual([]);
  });

  it("keeps daimyo core free of hard sibling plugin imports", async () => {
    const entries = await readdir(coreDir);
    const coreFiles = entries.filter((entry) => entry.endsWith(".ts"));
    const siblingImports: string[] = [];

    for (const file of coreFiles) {
      const content = await readFile(join(coreDir, file), "utf8");
      if (siblingImportPattern.test(content)) {
        siblingImports.push(file);
      }
    }

    expect(siblingImports).toEqual([]);
  });
});
