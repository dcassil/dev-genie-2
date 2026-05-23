import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ErrorObject, ValidateFunction } from "ajv";
import type { FormatsPlugin } from "ajv-formats";
import { Ajv2020 } from "ajv/dist/2020.js";
import { StructuredModelCallError } from "daimyo";
import type { ArchitectureImpact, JsonObject, JsonValue, RoleResult } from "protocol";

import type { StructuredModelSchema } from "./structured-model.js";

interface LoadedSchema {
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

const architectureImpactValidator = validatorFor("architecture-impact.schema.json");
const roleResultValidator = validatorFor("role-result.schema.json");

export const architectureImpactJsonSchema = schemaFor("architecture-impact.schema.json");
export const roleResultJsonSchema = schemaFor("role-result.schema.json");

export const architectureImpactStructuredSchema: StructuredModelSchema<ArchitectureImpact> = {
  name: "protocol-proof.architecture-impact.v1",
  schema: architectureImpactJsonSchema,
  parse(value: JsonValue): ArchitectureImpact {
    return parseArchitectureImpact(value);
  },
};

export function parseArchitectureImpact(value: JsonValue): ArchitectureImpact {
  if (isArchitectureImpact(value)) {
    return value;
  }
  throw new StructuredModelCallError(
    `ArchitectureImpact failed protocol schema validation: ${formatValidationErrors(architectureImpactValidator).join("; ")}`,
  );
}

export function isArchitectureImpact(value: JsonValue | ArchitectureImpact): value is ArchitectureImpact {
  return architectureImpactValidator(value);
}

export function isRoleResult(value: JsonValue | RoleResult): value is RoleResult {
  return roleResultValidator(value);
}

export function roleResultValidationErrors(): readonly string[] {
  return formatValidationErrors(roleResultValidator);
}

export function architectureImpactValidationErrors(): readonly string[] {
  return formatValidationErrors(architectureImpactValidator);
}

function validatorFor(fileName: string): ValidateFunction {
  const loadedSchema = loadedSchemaFor(fileName);
  const validator = ajv.getSchema(loadedSchema.id);
  if (validator === undefined) {
    throw new Error(`Protocol schema ${fileName} did not compile`);
  }
  return validator;
}

function schemaFor(fileName: string): JsonObject {
  return loadedSchemaFor(fileName).schema;
}

function loadedSchemaFor(fileName: string): LoadedSchema {
  const loadedSchema = loadedSchemas.find((candidate) => candidate.fileName === fileName);
  if (loadedSchema === undefined) {
    throw new Error(`Protocol schema ${fileName} was not found`);
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

function formatValidationErrors(validator: ValidateFunction): readonly string[] {
  return (validator.errors ?? []).map(formatValidationError);
}

function formatValidationError(error: ErrorObject): string {
  const path = error.instancePath.length === 0 ? "/" : error.instancePath;
  const message = error.message ?? "schema validation failed";
  return `${path} ${message}`;
}
