import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { Ajv2020 } from "ajv/dist/2020.js";
import type { FormatsPlugin } from "ajv-formats";
import { describe, expect, it } from "vitest";

import {
  artifactNameFromSchemaPath,
  displayPath,
  fixtureRoot,
  listJsonFiles,
  listSchemaFiles,
  readJsonFile,
  readSchemaFile,
} from "../scripts/lib/paths.js";

const require = createRequire(import.meta.url);
const addFormats: FormatsPlugin = require("ajv-formats").default;
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

const schemas = listSchemaFiles().map((schemaFile) => ({
  filePath: schemaFile,
  schema: readSchemaFile(schemaFile),
}));

for (const { schema } of schemas) {
  ajv.addSchema(schema);
}

function schemaId(schema: { $id?: string }, schemaPath: string): string {
  if (typeof schema.$id !== "string" || schema.$id.length === 0) {
    throw new Error(`${displayPath(schemaPath)} must declare a non-empty $id`);
  }

  return schema.$id;
}

describe("artifact fixtures", () => {
  for (const { filePath, schema } of schemas) {
    const artifactName = artifactNameFromSchemaPath(filePath);
    const artifactFixtureRoot = join(fixtureRoot, artifactName);
    const validFixtureRoot = join(artifactFixtureRoot, "valid");
    const invalidFixtureRoot = join(artifactFixtureRoot, "invalid");

    it(`${artifactName} has valid and invalid fixture directories`, () => {
      expect(existsSync(validFixtureRoot), `${displayPath(validFixtureRoot)} is missing`).toBe(true);
      expect(existsSync(invalidFixtureRoot), `${displayPath(invalidFixtureRoot)} is missing`).toBe(true);
      expect(readdirSync(validFixtureRoot).some((entry) => entry.endsWith(".json"))).toBe(true);
      expect(readdirSync(invalidFixtureRoot).some((entry) => entry.endsWith(".json"))).toBe(true);
    });

    const validate = ajv.getSchema(schemaId(schema, filePath));
    if (validate === undefined) {
      throw new Error(`${displayPath(filePath)} does not expose a compiled schema`);
    }

    for (const fixturePath of listJsonFiles(validFixtureRoot)) {
      it(`${artifactName} accepts valid fixture ${displayPath(fixturePath)}`, () => {
        const fixture = readJsonFile(fixturePath);
        const isValid = validate(fixture);
        expect(validate.errors).toEqual(null);
        expect(isValid).toBe(true);
      });
    }

    for (const fixturePath of listJsonFiles(invalidFixtureRoot)) {
      it(`${artifactName} rejects invalid fixture ${displayPath(fixturePath)}`, () => {
        const fixture = readJsonFile(fixturePath);
        const isValid = validate(fixture);
        expect(isValid).toBe(false);
      });
    }
  }
});
