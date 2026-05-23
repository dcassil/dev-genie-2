import { createRequire } from "node:module";

import { Ajv2020 } from "ajv/dist/2020.js";

import type { FormatsPlugin } from "ajv-formats";

import { displayPath, listSchemaFiles, readSchemaFile } from "./lib/paths.js";

const require = createRequire(import.meta.url);
const addFormats: FormatsPlugin = require("ajv-formats").default;
const draft202012 = "https://json-schema.org/draft/2020-12/schema";
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

const schemaFiles = listSchemaFiles();
if (schemaFiles.length === 0) {
  throw new Error("No schema files found under schemas/**/*.schema.json");
}

let failureCount = 0;
const schemas: Array<{ id: string; filePath: string; schema: ReturnType<typeof readSchemaFile> }> = [];

for (const schemaFile of schemaFiles) {
  const schema = readSchemaFile(schemaFile);
  if (schema.$schema !== draft202012) {
    console.error(`${displayPath(schemaFile)} must declare $schema as ${draft202012}`);
    failureCount += 1;
    continue;
  }

  if (typeof schema.$id !== "string" || schema.$id.length === 0) {
    console.error(`${displayPath(schemaFile)} must declare a non-empty $id`);
    failureCount += 1;
    continue;
  }

  const schemaId = schema.$id;
  const isValidSchema = ajv.validateSchema(schema);
  if (!isValidSchema) {
    console.error(`${displayPath(schemaFile)} is not a valid JSON Schema`);
    console.error(ajv.errorsText(ajv.errors));
    failureCount += 1;
    continue;
  }

  schemas.push({ id: schemaId, filePath: schemaFile, schema });
}

for (const { filePath, schema } of schemas) {
  try {
    ajv.addSchema(schema);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown schema registration error";
    console.error(`${displayPath(filePath)} could not be registered: ${message}`);
    failureCount += 1;
  }
}

for (const { filePath, id } of schemas) {
  try {
    const validate = ajv.getSchema(id);
    if (validate === undefined) {
      console.error(`${displayPath(filePath)} could not be compiled`);
      failureCount += 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown schema compile error";
    console.error(`${displayPath(filePath)} could not be compiled: ${message}`);
    failureCount += 1;
  }
}

if (failureCount > 0) {
  process.exitCode = 1;
}
