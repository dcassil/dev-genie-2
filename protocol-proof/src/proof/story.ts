import { readFileSync } from "node:fs";

import type { JsonObject, JsonValue } from "protocol";

export interface ProofStory {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly acceptance_criteria: readonly string[];
  readonly bounded_context: JsonObject;
  readonly validation_intent: ProofValidationIntent;
}

export interface ProofValidationIntent {
  readonly required_surfaces: readonly string[];
  readonly required_reason_codes: readonly string[];
  readonly required_primitives: readonly string[];
  readonly min_proposed_changes: number;
  readonly requires_decision: boolean;
}

export function loadProofStory(filePath: string): ProofStory {
  return parseProofStory(JSON.parse(readFileSync(filePath, "utf8")));
}

export function parseProofStory(value: JsonValue): ProofStory {
  const object = requireJsonObject(value, "proof story");
  const validationIntent = requireJsonObject(object.validation_intent, "proof story validation_intent");
  return {
    id: readString(object, "id"),
    title: readString(object, "title"),
    body: readString(object, "body"),
    acceptance_criteria: readStringArray(object, "acceptance_criteria"),
    bounded_context: requireJsonObject(object.bounded_context, "proof story bounded_context"),
    validation_intent: {
      required_surfaces: readStringArray(validationIntent, "required_surfaces"),
      required_reason_codes: readStringArray(validationIntent, "required_reason_codes"),
      required_primitives: readStringArray(validationIntent, "required_primitives"),
      min_proposed_changes: readNonNegativeInteger(validationIntent, "min_proposed_changes"),
      requires_decision: readBoolean(validationIntent, "requires_decision"),
    },
  };
}

export function proofStoryAsJson(story: ProofStory): JsonObject {
  return {
    id: story.id,
    title: story.title,
    body: story.body,
    acceptance_criteria: [...story.acceptance_criteria],
    bounded_context: story.bounded_context,
    validation_intent: {
      required_surfaces: [...story.validation_intent.required_surfaces],
      required_reason_codes: [...story.validation_intent.required_reason_codes],
      required_primitives: [...story.validation_intent.required_primitives],
      min_proposed_changes: story.validation_intent.min_proposed_changes,
      requires_decision: story.validation_intent.requires_decision,
    },
  };
}

function requireJsonObject(value: JsonValue | undefined, label: string): JsonObject {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value;
  }
  throw new Error(`${label} must be a JSON object`);
}

function readString(source: JsonObject, key: string): string {
  const value = source[key];
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  throw new Error(`${key} must be a non-empty string`);
}

function readBoolean(source: JsonObject, key: string): boolean {
  const value = source[key];
  if (typeof value === "boolean") {
    return value;
  }
  throw new Error(`${key} must be a boolean`);
}

function readNonNegativeInteger(source: JsonObject, key: string): number {
  const value = source[key];
  if (Number.isInteger(value) && typeof value === "number" && value >= 0) {
    return value;
  }
  throw new Error(`${key} must be a non-negative integer`);
}

function readStringArray(source: JsonObject, key: string): readonly string[] {
  const value = source[key];
  if (Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0)) {
    const strings: string[] = [];
    for (const item of value) {
      if (typeof item === "string") {
        strings.push(item);
      }
    }
    return strings;
  }
  throw new Error(`${key} must be a string array`);
}
