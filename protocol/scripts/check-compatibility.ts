import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  artifactNameFromSchemaPath,
  compatibilityBaselineSchemaRoot,
  compatibilityBaselineVersionsPath,
  compatibilityVersionsPath,
  displayPath,
  listJsonFiles,
  readJsonFile,
  readSchemaFile,
  schemaRoot,
} from "./lib/paths.js";
import {
  checkSchemaVersionBump,
  classifySchemaChange,
  type JsonObject,
  type VersionManifest,
} from "./lib/schema-compatibility.js";

const previousManifest: VersionManifest = readJsonFile(compatibilityBaselineVersionsPath);
const currentManifest: VersionManifest = readJsonFile(compatibilityVersionsPath);
const baselineSchemas = listJsonFiles(compatibilityBaselineSchemaRoot).filter((filePath) => filePath.endsWith(".schema.json"));

if (baselineSchemas.length === 0) {
  throw new Error(`${displayPath(compatibilityBaselineSchemaRoot)} must contain baseline schema snapshots`);
}

let failureCount = 0;
let changedSchemaCount = 0;

for (const baselineSchemaPath of baselineSchemas) {
  const schemaName = artifactNameFromSchemaPath(baselineSchemaPath);
  const currentSchemaPath = join(schemaRoot, `${schemaName}.schema.json`);
  if (!existsSync(currentSchemaPath)) {
    console.error(`${displayPath(currentSchemaPath)} is missing for compatibility baseline ${schemaName}`);
    failureCount += 1;
    continue;
  }

  const previousSchema: JsonObject = readSchemaFile(baselineSchemaPath);
  const currentSchema: JsonObject = readSchemaFile(currentSchemaPath);
  const classification = classifySchemaChange(previousSchema, currentSchema);
  const result = checkSchemaVersionBump(schemaName, classification, previousManifest, currentManifest);
  if (classification.kind !== "unchanged") {
    changedSchemaCount += 1;
  }

  if (!result.ok) {
    console.error(result.message);
    for (const change of classification.changes) {
      console.error(`- ${change.kind} ${change.path}: ${change.reason}`);
    }
    failureCount += 1;
  }
}

for (const schemaName of Object.keys(currentManifest.schemas)) {
  const baselineSchemaPath = join(compatibilityBaselineSchemaRoot, `${schemaName}.schema.json`);
  if (!existsSync(baselineSchemaPath)) {
    console.error(`${schemaName} is missing from ${displayPath(compatibilityBaselineSchemaRoot)}`);
    failureCount += 1;
  }
}

if (failureCount > 0) {
  process.exitCode = 1;
} else {
  console.log(`Schema compatibility check passed (${baselineSchemas.length} schemas, ${changedSchemaCount} changed).`);
}
