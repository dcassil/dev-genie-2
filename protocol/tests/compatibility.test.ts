import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  artifactCompatibility,
  checkSchemaVersionBump,
  classifySchemaChange,
  type ArtifactVersionStamp,
  type ConsumerProtocolPin,
  type JsonObject,
  type VersionManifest,
} from "../scripts/lib/schema-compatibility.js";
import { fixtureRoot, readJsonFile } from "../scripts/lib/paths.js";

const baseObjectSchema: JsonObject = {
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: {
    id: { type: "string" },
  },
};

describe("schema compatibility classifier", () => {
  it("classifies an added optional field as backward-compatible", () => {
    const current: JsonObject = {
      ...baseObjectSchema,
      properties: {
        id: { type: "string" },
        label: { type: "string" },
      },
    };

    expect(classifySchemaChange(baseObjectSchema, current).kind).toBe("backward-compatible");
  });

  it("classifies a removed field as breaking", () => {
    const previous: JsonObject = {
      ...baseObjectSchema,
      properties: {
        id: { type: "string" },
        label: { type: "string" },
      },
    };

    const classification = classifySchemaChange(previous, baseObjectSchema);

    expect(classification.kind).toBe("breaking");
    expect(classification.changes).toContainEqual(expect.objectContaining({
      path: "#/properties/label",
      kind: "breaking",
    }));
  });

  it("classifies a newly required field as breaking", () => {
    const current: JsonObject = {
      ...baseObjectSchema,
      required: ["id", "label"],
      properties: {
        id: { type: "string" },
        label: { type: "string" },
      },
    };

    expect(classifySchemaChange(baseObjectSchema, current).kind).toBe("breaking");
  });

  it("classifies a retyped field as breaking", () => {
    const current: JsonObject = {
      ...baseObjectSchema,
      properties: {
        id: { type: "integer" },
      },
    };

    expect(classifySchemaChange(baseObjectSchema, current).kind).toBe("breaking");
  });

  it("classifies ambiguous pattern changes as breaking", () => {
    const previous: JsonObject = {
      ...baseObjectSchema,
      properties: {
        id: { type: "string", pattern: "^task-" },
      },
    };
    const current: JsonObject = {
      ...baseObjectSchema,
      properties: {
        id: { type: "string", pattern: "^work-" },
      },
    };

    expect(classifySchemaChange(previous, current).kind).toBe("breaking");
  });
});

describe("schema version bump enforcement", () => {
  const previousManifest: VersionManifest = {
    protocol_version: "1.0.0",
    schemas: {
      example: { schema_version: "1.0.0", version_scope: "schema" },
    },
  };

  it("requires a same-major version bump for backward-compatible schema changes", () => {
    const classification = classifySchemaChange(baseObjectSchema, {
      ...baseObjectSchema,
      properties: {
        id: { type: "string" },
        label: { type: "string" },
      },
    });
    const currentManifest: VersionManifest = {
      protocol_version: "1.0.0",
      schemas: {
        example: { schema_version: "1.1.0", version_scope: "schema" },
      },
    };

    expect(checkSchemaVersionBump("example", classification, previousManifest, currentManifest).ok).toBe(true);
  });

  it("rejects breaking schema changes without a major bump", () => {
    const classification = classifySchemaChange({
      ...baseObjectSchema,
      properties: {
        id: { type: "string" },
        label: { type: "string" },
      },
    }, baseObjectSchema);

    expect(checkSchemaVersionBump("example", classification, previousManifest, previousManifest).ok).toBe(false);
  });
});

describe("producer and consumer protocol compatibility", () => {
  const consumer: ConsumerProtocolPin = {
    protocol_version: "1.0.0",
    schema_versions: {
      DecisionRecord: "1.0.0",
    },
  };

  it("allows a consumer pinned to protocol v1 to read producer artifacts within v1 guarantees", () => {
    const fixture: ArtifactVersionStamp = readJsonFile(
      join(fixtureRoot, "decision-record", "valid", "daimyo-captured-decision-record.json"),
    );

    expect(artifactCompatibility(fixture, consumer)).toBe("compatible");
  });

  it("detects an incompatible producer protocol major bump", () => {
    const fixture: ArtifactVersionStamp = {
      artifact_type: "DecisionRecord",
      schema_version: "1.0.0",
      protocol_version: "2.0.0",
    };

    expect(artifactCompatibility(fixture, consumer)).toBe("incompatible");
  });

  it("detects an incompatible producer schema major bump", () => {
    const fixture: ArtifactVersionStamp = {
      artifact_type: "DecisionRecord",
      schema_version: "2.0.0",
      protocol_version: "1.0.0",
    };

    expect(artifactCompatibility(fixture, consumer)).toBe("incompatible");
  });
});
