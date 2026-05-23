import { mkdirSync } from "node:fs";

import { compileFromFile } from "json-schema-to-typescript";

import {
  displayPath,
  generatedDir,
  generatedTypesPath,
  listSchemaFiles,
  writeTextFile,
} from "./paths.js";

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
  writeTextFile(generatedTypesPath, content);
}
