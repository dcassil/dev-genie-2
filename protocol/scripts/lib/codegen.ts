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

function typeAliasBlockEnd(lines: string[], startIndex: number): number {
  for (let lineIndex = startIndex; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (line === undefined) {
      throw new Error(`Generated type alias starting on line ${startIndex + 1} ended unexpectedly`);
    }

    if (line.trimEnd().endsWith(";")) {
      return lineIndex;
    }
  }

  throw new Error(`Generated type alias starting on line ${startIndex + 1} is missing a semicolon`);
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

function dedupeExportedDeclarations(content: string): string {
  const lines = content.split("\n");
  const dedupedLines: string[] = [];
  const emittedDeclarations = new Map<string, string>();

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (line === undefined) {
      throw new Error(`Generated content ended unexpectedly on line ${lineIndex + 1}`);
    }

    const declarationMatch = /^export (interface|type) ([A-Za-z_$][\w$]*)\b/u.exec(line);
    if (declarationMatch === null) {
      dedupedLines.push(line);
      continue;
    }

    const declarationKind = declarationMatch[1];
    const declarationName = declarationMatch[2];
    if (declarationKind === undefined || declarationName === undefined) {
      throw new Error(`Could not read generated declaration on line ${lineIndex + 1}`);
    }
    const endIndex =
      declarationKind === "interface"
        ? interfaceBlockEnd(lines, lineIndex)
        : typeAliasBlockEnd(lines, lineIndex);
    const declarationKey = `${declarationKind} ${declarationName}`;
    const declarationBlock = lines.slice(lineIndex, endIndex + 1).join("\n");
    const emittedBlock = emittedDeclarations.get(declarationKey);

    if (emittedBlock === undefined) {
      emittedDeclarations.set(declarationKey, declarationBlock);
      dedupedLines.push(...lines.slice(lineIndex, endIndex + 1));
    } else if (emittedBlock === declarationBlock) {
      removeTrailingJsdoc(dedupedLines);
    } else {
      throw new Error(`Generated duplicate ${declarationKind} with different shape: ${declarationName}`);
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
  writeTextFile(generatedTypesPath, dedupeExportedDeclarations(content));
}
