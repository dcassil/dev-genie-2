import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ErrorObject, ValidateFunction } from "ajv";
import type { FormatsPlugin } from "ajv-formats";
import { Ajv2020 } from "ajv/dist/2020.js";
import type {
  ArchitectureImpact,
  JsonObject,
  JsonValue,
  PlanProposal,
  ReviewJudgment,
  RoleResult,
  ValidationReport,
} from "protocol";

import { StructuredModelCallError } from "../runner/structured-model.js";
import type { StructuredModelSchema } from "../runner/structured-model.js";

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

const architectureImpactValidator = validatorFor("ArchitectureImpact");
const planProposalValidator = validatorFor("PlanProposal");
const reviewJudgmentValidator = validatorFor("ReviewJudgment");
const roleResultValidator = validatorFor("RoleResult");
const validationReportValidator = validatorFor("ValidationReport");

export const architectureImpactJsonSchema = schemaFor("ArchitectureImpact");
export const planProposalJsonSchema = schemaFor("PlanProposal");
export const reviewJudgmentJsonSchema = schemaFor("ReviewJudgment");
export const roleResultJsonSchema = schemaFor("RoleResult");
export const validationReportJsonSchema = schemaFor("ValidationReport");

export const architectureImpactStructuredSchema: StructuredModelSchema<ArchitectureImpact> = {
  name: "dev-genie.architecture-impact.v1",
  schema: architectureImpactJsonSchema,
  parse(value: JsonValue): ArchitectureImpact {
    return parseArchitectureImpact(value);
  },
};

export const planProposalStructuredSchema: StructuredModelSchema<PlanProposal> = {
  name: "dev-genie.plan-proposal.v1",
  schema: planProposalJsonSchema,
  parse(value: JsonValue): PlanProposal {
    return parsePlanProposal(value);
  },
};

export const reviewJudgmentStructuredSchema: StructuredModelSchema<ReviewJudgment> = {
  name: "dev-genie.review-judgment.v1",
  schema: reviewJudgmentJsonSchema,
  parse(value: JsonValue): ReviewJudgment {
    return parseReviewJudgment(value);
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

export function parsePlanProposal(value: JsonValue): PlanProposal {
  if (isPlanProposal(value)) {
    return value;
  }
  throw new StructuredModelCallError(
    `PlanProposal failed protocol schema validation: ${formatValidationErrors(planProposalValidator).join("; ")}`,
  );
}

export function parseReviewJudgment(value: JsonValue): ReviewJudgment {
  if (isReviewJudgment(value)) {
    return value;
  }
  throw new StructuredModelCallError(
    `ReviewJudgment failed protocol schema validation: ${formatValidationErrors(reviewJudgmentValidator).join("; ")}`,
  );
}

export function isArchitectureImpact(value: unknown): value is ArchitectureImpact {
  return architectureImpactValidator(value);
}

export function isPlanProposal(value: unknown): value is PlanProposal {
  return planProposalValidator(value);
}

export function isReviewJudgment(value: unknown): value is ReviewJudgment {
  return reviewJudgmentValidator(value);
}

export function isRoleResult(value: unknown): value is RoleResult {
  return roleResultValidator(value);
}

export function isValidationReport(value: unknown): value is ValidationReport {
  return validationReportValidator(value);
}

export function roleResultValidationErrors(): readonly string[] {
  return formatValidationErrors(roleResultValidator);
}

export function architectureImpactValidationErrors(): readonly string[] {
  return formatValidationErrors(architectureImpactValidator);
}

export function planProposalValidationErrors(): readonly string[] {
  return formatValidationErrors(planProposalValidator);
}

export function reviewJudgmentValidationErrors(): readonly string[] {
  return formatValidationErrors(reviewJudgmentValidator);
}

export function validationReportValidationErrors(): readonly string[] {
  return formatValidationErrors(validationReportValidator);
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
