import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ErrorObject, ValidateFunction } from "ajv";
import type { FormatsPlugin } from "ajv-formats";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { JsonObject, JsonValue, PolicyConfig, PolicyVerdict } from "protocol";

interface LoadedSchema {
  readonly artifactType: string;
  readonly fileName: string;
  readonly schema: JsonObject;
  readonly id: string;
}

const require = createRequire(import.meta.url);
const addFormats: FormatsPlugin = require("ajv-formats").default;
const loadedSchemas = loadProtocolSchemas();
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

for (const loadedSchema of loadedSchemas) {
  ajv.addSchema(loadedSchema.schema);
}

const policyConfigValidator = validatorFor("PolicyConfig");
const policyVerdictValidator = validatorFor("PolicyVerdict");

export const policyConfigJsonSchema = schemaFor("PolicyConfig");
export const policyVerdictJsonSchema = schemaFor("PolicyVerdict");

export function isPolicyConfig(value: unknown): value is PolicyConfig {
  return policyConfigValidator(value);
}

export function isPolicyVerdict(value: unknown): value is PolicyVerdict {
  return policyVerdictValidator(value);
}

export function policyConfigValidationErrors(): readonly string[] {
  return formatValidationErrors(policyConfigValidator);
}

export function policyVerdictValidationErrors(): readonly string[] {
  return formatValidationErrors(policyVerdictValidator);
}

export function validatorFor(artifactType: string): ValidateFunction {
  const loadedSchema = loadedSchemaFor(artifactType);
  const validator = ajv.getSchema(loadedSchema.id);
  if (validator === undefined) {
    throw new Error(`Protocol schema ${loadedSchema.fileName} did not compile`);
  }
  return validator;
}

export function schemaFor(artifactType: string): JsonObject {
  return loadedSchemaFor(artifactType).schema;
}

function loadedSchemaFor(artifactType: string): LoadedSchema {
  const loadedSchema = loadedSchemas.find((candidate) => candidate.artifactType === artifactType);
  if (loadedSchema === undefined) {
    throw new Error(`Protocol schema for ${artifactType} was not found`);
  }
  return loadedSchema;
}

function loadProtocolSchemas(): readonly LoadedSchema[] {
  const schemaDir = findProtocolSchemaDir();
  return readdirSync(schemaDir)
    .filter((entry) => entry.endsWith(".schema.json"))
    .sort()
    .map((fileName) => {
      const schema = readJsonObject(resolve(schemaDir, fileName));
      return {
        artifactType: artifactTypeForSchema(schema, fileName),
        fileName,
        schema,
        id: schemaId(schema, fileName),
      };
    });
}

function findProtocolSchemaDir(): string {
  const candidates = [
    fileURLToPath(new URL("../../../protocol/schemas", import.meta.url)),
    fileURLToPath(new URL("../../protocol/schemas", import.meta.url)),
    resolve(process.cwd(), "../protocol/schemas"),
  ];
  const schemaDir = candidates.find((candidate) => existsSync(candidate));
  if (schemaDir === undefined) {
    throw new Error("Unable to locate sibling protocol/schemas directory");
  }
  return schemaDir;
}

function readJsonObject(filePath: string): JsonObject {
  const parsed: JsonValue = JSON.parse(readFileSync(filePath, "utf8"));
  if (!isJsonObject(parsed)) {
    throw new Error(`${filePath} must contain a JSON object`);
  }
  return parsed;
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function schemaId(schema: JsonObject, fileName: string): string {
  const id = schema.$id;
  if (typeof id !== "string" || id.length === 0) {
    throw new Error(`Protocol schema ${fileName} must declare $id`);
  }
  return id;
}

function artifactTypeForSchema(schema: JsonObject, fileName: string): string {
  const title = schema.title;
  if (typeof title === "string" && title.length > 0) {
    return title;
  }
  throw new Error(`Protocol schema ${fileName} must declare title`);
}

function formatValidationErrors(validator: ValidateFunction): readonly string[] {
  return (validator.errors ?? []).map(formatValidationError);
}

function formatValidationError(error: ErrorObject): string {
  const path = error.instancePath.length === 0 ? "/" : error.instancePath;
  const message = error.message ?? "schema validation failed";
  return `${path} ${message}`;
}
