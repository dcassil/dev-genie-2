import { mkdirSync } from "node:fs";

import { compileFromFile } from "json-schema-to-typescript";

import {
  displayPath,
  generatedDir,
  generatedTypesPath,
  listSchemaFiles,
  writeTextFile,
} from "./paths.js";

function interfaceBlockEnd(lines: string[], startIndex: number): number {
  let braceDepth = 0;
  let hasOpenedInterface = false;

  for (let lineIndex = startIndex; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (line === undefined) {
      throw new Error(`Generated interface starting on line ${startIndex + 1} ended unexpectedly`);
    }

    for (const character of line) {
      if (character === "{") {
        braceDepth += 1;
        hasOpenedInterface = true;
      } else if (character === "}") {
        braceDepth -= 1;
      }
    }

    if (hasOpenedInterface && braceDepth === 0) {
      return lineIndex;
    }
  }

  throw new Error(`Generated interface starting on line ${startIndex + 1} is missing a closing brace`);
}

function removeTrailingJsdoc(lines: string[]): void {
  if (lines.at(-1) !== " */") {
    return;
  }

  for (let lineIndex = lines.length - 2; lineIndex >= 0; lineIndex -= 1) {
    if (lines[lineIndex] === "/**") {
      lines.splice(lineIndex);
      if (lines.at(-1)?.startsWith("// Source: ") === true) {
        lines.pop();
      }
      return;
    }
  }
}

function dedupeExportedInterfaces(content: string): string {
  const lines = content.split("\n");
  const dedupedLines: string[] = [];
  const emittedInterfaces = new Map<string, string>();

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (line === undefined) {
      throw new Error(`Generated content ended unexpectedly on line ${lineIndex + 1}`);
    }

    const interfaceMatch = /^export interface ([A-Za-z_$][\w$]*)\b/u.exec(line);
    if (interfaceMatch === null) {
      dedupedLines.push(line);
      continue;
    }

    const interfaceName = interfaceMatch[1];
    if (interfaceName === undefined) {
      throw new Error(`Could not read generated interface name on line ${lineIndex + 1}`);
    }
    const endIndex = interfaceBlockEnd(lines, lineIndex);
    const interfaceBlock = lines.slice(lineIndex, endIndex + 1).join("\n");
    const emittedBlock = emittedInterfaces.get(interfaceName);

    if (emittedBlock === undefined) {
      emittedInterfaces.set(interfaceName, interfaceBlock);
      dedupedLines.push(...lines.slice(lineIndex, endIndex + 1));
    } else if (emittedBlock === interfaceBlock) {
      removeTrailingJsdoc(dedupedLines);
    } else {
      throw new Error(`Generated duplicate interface with different shape: ${interfaceName}`);
    }

    lineIndex = endIndex;
  }

  return dedupedLines.join("\n");
}

export async function generateTypeBindings(): Promise<void> {
  const schemaFiles = listSchemaFiles();
  if (schemaFiles.length === 0) {
    throw new Error("No schema files found under schemas/**/*.schema.json");
  }

  const generatedBlocks: string[] = [];
  for (const schemaFile of schemaFiles) {
    const compiled = await compileFromFile(schemaFile, {
      bannerComment: "",
      unreachableDefinitions: true,
    });
    generatedBlocks.push(`// Source: ${displayPath(schemaFile)}\n${compiled.trim()}`);
  }

  const content = [
    "/*",
    " * GENERATED FILE. Do not edit directly.",
    " * Regenerate with: npm run codegen",
    " */",
    "",
    ...generatedBlocks,
    "",
  ].join("\n");

  mkdirSync(generatedDir, { recursive: true });
  writeTextFile(generatedTypesPath, dedupeExportedInterfaces(content));
}
