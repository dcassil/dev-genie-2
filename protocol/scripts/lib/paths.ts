import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { AnySchemaObject } from "ajv";

export const projectRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
export const schemaRoot = join(projectRoot, "schemas");
export const fixtureRoot = join(projectRoot, "fixtures");
export const compatibilityRoot = join(projectRoot, "compatibility");
export const compatibilityBaselineRoot = join(compatibilityRoot, "baseline");
export const compatibilityBaselineSchemaRoot = join(compatibilityBaselineRoot, "schemas");
export const compatibilityBaselineVersionsPath = join(compatibilityBaselineRoot, "versions.json");
export const compatibilityVersionsPath = join(compatibilityRoot, "versions.json");
export const generatedDir = join(projectRoot, "src", "generated");
export const generatedTypesPath = join(generatedDir, "artifacts.ts");

export function listJsonFiles(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }

  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const entryPath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJsonFiles(entryPath));
    } else if (entry.isFile() && extname(entry.name) === ".json") {
      files.push(entryPath);
    }
  }

  return files.sort();
}

export function listSchemaFiles(): string[] {
  return listJsonFiles(schemaRoot).filter((filePath) => filePath.endsWith(".schema.json"));
}

export function artifactNameFromSchemaPath(schemaPath: string): string {
  return basename(schemaPath).replace(/\.schema\.json$/u, "");
}

export function readSchemaFile(filePath: string): AnySchemaObject {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function readJsonFile(filePath: string) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function readTextIfExists(filePath: string): string {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
}

export function writeTextFile(filePath: string, content: string): void {
  writeFileSync(filePath, content);
}

export function displayPath(filePath: string): string {
  return relative(projectRoot, filePath);
}

export function parentDir(filePath: string): string {
  return dirname(filePath);
}
