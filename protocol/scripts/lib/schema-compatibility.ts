export type SchemaChangeKind = "unchanged" | "backward-compatible" | "breaking";

export interface SchemaChange {
  readonly kind: Exclude<SchemaChangeKind, "unchanged">;
  readonly path: string;
  readonly reason: string;
}

export interface SchemaChangeClassification {
  readonly kind: SchemaChangeKind;
  readonly changes: readonly SchemaChange[];
}

export type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject;
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export interface VersionManifest {
  readonly protocol_version: string;
  readonly schemas: {
    readonly [schemaName: string]: SchemaVersionEntry;
  };
}

export interface SchemaVersionEntry {
  readonly schema_version: string;
  readonly version_scope: "protocol" | "schema";
}

export interface VersionCheckResult {
  readonly schemaName: string;
  readonly classification: SchemaChangeClassification;
  readonly requiredVersion: "protocol_version" | "schema_version" | "none";
  readonly ok: boolean;
  readonly message: string;
}

export interface ArtifactVersionStamp {
  readonly artifact_type: string;
  readonly schema_version: string;
  readonly protocol_version: string;
}

export interface ConsumerProtocolPin {
  readonly protocol_version: string;
  readonly schema_versions: Readonly<Record<string, string>>;
}

const annotationKeywords = new Set([
  "$comment",
  "$id",
  "$schema",
  "default",
  "description",
  "examples",
  "title",
]);

const handledObjectKeywords = new Set([
  "$defs",
  "$ref",
  "additionalProperties",
  "allOf",
  "anyOf",
  "const",
  "enum",
  "exclusiveMaximum",
  "exclusiveMinimum",
  "format",
  "items",
  "maxItems",
  "maxLength",
  "maximum",
  "minItems",
  "minLength",
  "minimum",
  "oneOf",
  "pattern",
  "properties",
  "required",
  "type",
  "uniqueItems",
]);

const tighteningMinimumKeywords = new Set(["minLength", "minimum", "exclusiveMinimum", "minItems"]);
const tighteningMaximumKeywords = new Set(["maxLength", "maximum", "exclusiveMaximum", "maxItems"]);

export function classifySchemaChange(previous: JsonObject, current: JsonObject): SchemaChangeClassification {
  const changes: SchemaChange[] = [];
  compareNode("#", previous, current, changes);

  if (changes.some((change) => change.kind === "breaking")) {
    return { kind: "breaking", changes };
  }
  if (changes.length > 0) {
    return { kind: "backward-compatible", changes };
  }
  return { kind: "unchanged", changes };
}

export function checkSchemaVersionBump(
  schemaName: string,
  classification: SchemaChangeClassification,
  previousManifest: VersionManifest,
  currentManifest: VersionManifest,
): VersionCheckResult {
  const previousEntry = previousManifest.schemas[schemaName];
  const currentEntry = currentManifest.schemas[schemaName];
  if (previousEntry === undefined || currentEntry === undefined) {
    return {
      schemaName,
      classification,
      requiredVersion: "none",
      ok: false,
      message: `${schemaName} is missing from a version manifest`,
    };
  }

  const requiredVersion = currentEntry.version_scope === "protocol" ? "protocol_version" : "schema_version";
  const previousVersion = requiredVersion === "protocol_version" ? previousManifest.protocol_version : previousEntry.schema_version;
  const currentVersion = requiredVersion === "protocol_version" ? currentManifest.protocol_version : currentEntry.schema_version;
  const previousSemver = parseSemver(previousVersion);
  const currentSemver = parseSemver(currentVersion);

  if (currentSemver === undefined || previousSemver === undefined) {
    return {
      schemaName,
      classification,
      requiredVersion,
      ok: false,
      message: `${schemaName} has a non-semver ${requiredVersion}`,
    };
  }

  if (compareSemver(currentSemver, previousSemver) < 0) {
    return {
      schemaName,
      classification,
      requiredVersion,
      ok: false,
      message: `${schemaName} ${requiredVersion} moved backward from ${previousVersion} to ${currentVersion}`,
    };
  }

  if (classification.kind === "unchanged") {
    return {
      schemaName,
      classification,
      requiredVersion: "none",
      ok: true,
      message: `${schemaName} is unchanged`,
    };
  }

  if (classification.kind === "breaking") {
    const ok = currentSemver.major > previousSemver.major;
    return {
      schemaName,
      classification,
      requiredVersion,
      ok,
      message: ok
        ? `${schemaName} has a breaking-compatible ${requiredVersion} bump`
        : `${schemaName} has a breaking change and must major-bump ${requiredVersion}`,
    };
  }

  const ok = currentSemver.major === previousSemver.major && compareSemver(currentSemver, previousSemver) > 0;
  return {
    schemaName,
    classification,
    requiredVersion,
    ok,
    message: ok
      ? `${schemaName} has a compatible ${requiredVersion} bump`
      : `${schemaName} has a backward-compatible change and must bump ${requiredVersion} within the same major version`,
  };
}

export function artifactCompatibility(
  artifact: ArtifactVersionStamp,
  consumer: ConsumerProtocolPin,
): "compatible" | "incompatible" {
  const artifactProtocol = parseSemver(artifact.protocol_version);
  const consumerProtocol = parseSemver(consumer.protocol_version);
  if (artifactProtocol === undefined || consumerProtocol === undefined || artifactProtocol.major !== consumerProtocol.major) {
    return "incompatible";
  }

  const consumerSchemaVersion = consumer.schema_versions[artifact.artifact_type];
  if (consumerSchemaVersion === undefined) {
    return "incompatible";
  }

  const artifactSchema = parseSemver(artifact.schema_version);
  const consumerSchema = parseSemver(consumerSchemaVersion);
  if (artifactSchema === undefined || consumerSchema === undefined || artifactSchema.major !== consumerSchema.major) {
    return "incompatible";
  }

  return "compatible";
}

function compareNode(path: string, previous: JsonValue | undefined, current: JsonValue | undefined, changes: SchemaChange[]): void {
  if (semanticEqual(previous, current)) {
    return;
  }

  if (previous === undefined) {
    changes.push({ kind: "backward-compatible", path, reason: "schema node was added" });
    return;
  }
  if (current === undefined) {
    changes.push({ kind: "breaking", path, reason: "schema node was removed" });
    return;
  }
  if (!isJsonObject(previous) || !isJsonObject(current)) {
    changes.push({ kind: "breaking", path, reason: "schema node changed shape" });
    return;
  }

  compareSimpleKeyword(path, "$ref", previous, current, changes);
  compareSimpleKeyword(path, "type", previous, current, changes);
  compareSimpleKeyword(path, "const", previous, current, changes);
  compareSimpleKeyword(path, "format", previous, current, changes);
  compareSimpleKeyword(path, "pattern", previous, current, changes);
  compareSimpleKeyword(path, "uniqueItems", previous, current, changes);
  compareEnum(path, previous, current, changes);
  compareAdditionalProperties(path, previous, current, changes);
  compareNumericConstraints(path, previous, current, changes);
  compareRequired(path, previous, current, changes);
  compareProperties(path, previous, current, changes);
  compareSchemaArray(path, "allOf", previous, current, changes);
  compareSchemaArray(path, "oneOf", previous, current, changes);
  compareSchemaArray(path, "anyOf", previous, current, changes);
  compareItems(path, previous, current, changes);
  compareDefinitions(path, previous, current, changes);
  compareUnhandledKeywords(path, previous, current, changes);
}

function compareSimpleKeyword(
  path: string,
  keyword: string,
  previous: JsonObject,
  current: JsonObject,
  changes: SchemaChange[],
): void {
  const previousValue = previous[keyword];
  const currentValue = current[keyword];
  if (!semanticEqual(previousValue, currentValue)) {
    changes.push({ kind: "breaking", path: `${path}/${keyword}`, reason: `${keyword} changed` });
  }
}

function compareEnum(path: string, previous: JsonObject, current: JsonObject, changes: SchemaChange[]): void {
  const previousValue = previous.enum;
  const currentValue = current.enum;
  if (!semanticEqual(previousValue, currentValue)) {
    changes.push({ kind: "breaking", path: `${path}/enum`, reason: "enum changed; ambiguous enum evolution is breaking" });
  }
}

function compareAdditionalProperties(path: string, previous: JsonObject, current: JsonObject, changes: SchemaChange[]): void {
  const previousValue = previous.additionalProperties;
  const currentValue = current.additionalProperties;
  if (semanticEqual(previousValue, currentValue)) {
    return;
  }
  if (previousValue === false && currentValue === true) {
    changes.push({ kind: "backward-compatible", path: `${path}/additionalProperties`, reason: "additional properties were relaxed" });
    return;
  }
  changes.push({
    kind: "breaking",
    path: `${path}/additionalProperties`,
    reason: "additionalProperties changed or became stricter",
  });
}

function compareNumericConstraints(path: string, previous: JsonObject, current: JsonObject, changes: SchemaChange[]): void {
  for (const keyword of tighteningMinimumKeywords) {
    compareNumericConstraint(path, keyword, previous, current, (next, prior) => next > prior, changes);
  }
  for (const keyword of tighteningMaximumKeywords) {
    compareNumericConstraint(path, keyword, previous, current, (next, prior) => next < prior, changes);
  }
}

function compareNumericConstraint(
  path: string,
  keyword: string,
  previous: JsonObject,
  current: JsonObject,
  isTighter: (next: number, prior: number) => boolean,
  changes: SchemaChange[],
): void {
  const previousValue = numberAt(previous, keyword);
  const currentValue = numberAt(current, keyword);
  if (previousValue === currentValue) {
    return;
  }
  if (previousValue === undefined || currentValue === undefined) {
    changes.push({ kind: "breaking", path: `${path}/${keyword}`, reason: `${keyword} was added or removed` });
    return;
  }
  changes.push({
    kind: isTighter(currentValue, previousValue) ? "breaking" : "backward-compatible",
    path: `${path}/${keyword}`,
    reason: `${keyword} changed`,
  });
}

function compareRequired(path: string, previous: JsonObject, current: JsonObject, changes: SchemaChange[]): void {
  const previousRequired = new Set(stringArrayAt(previous, "required"));
  const currentRequired = new Set(stringArrayAt(current, "required"));

  for (const field of currentRequired) {
    if (!previousRequired.has(field)) {
      changes.push({ kind: "breaking", path: `${path}/required/${field}`, reason: "field became required" });
    }
  }
  for (const field of previousRequired) {
    if (!currentRequired.has(field)) {
      changes.push({ kind: "backward-compatible", path: `${path}/required/${field}`, reason: "field is no longer required" });
    }
  }
}

function compareProperties(path: string, previous: JsonObject, current: JsonObject, changes: SchemaChange[]): void {
  const previousProperties = objectAt(previous, "properties");
  const currentProperties = objectAt(current, "properties");
  if (previousProperties === undefined && currentProperties === undefined) {
    return;
  }
  if (previousProperties === undefined || currentProperties === undefined) {
    changes.push({ kind: "breaking", path: `${path}/properties`, reason: "properties block was added or removed" });
    return;
  }

  const previousRequired = new Set(stringArrayAt(previous, "required"));
  const currentRequired = new Set(stringArrayAt(current, "required"));
  const fields = new Set([...Object.keys(previousProperties), ...Object.keys(currentProperties)].sort());

  for (const field of fields) {
    const previousProperty = previousProperties[field];
    const currentProperty = currentProperties[field];
    if (previousProperty === undefined) {
      changes.push({
        kind: currentRequired.has(field) ? "breaking" : "backward-compatible",
        path: `${path}/properties/${field}`,
        reason: currentRequired.has(field) ? "required property was added" : "optional property was added",
      });
    } else if (currentProperty === undefined) {
      changes.push({
        kind: "breaking",
        path: `${path}/properties/${field}`,
        reason: previousRequired.has(field) ? "required property was removed" : "property was removed",
      });
    } else {
      compareNode(`${path}/properties/${field}`, previousProperty, currentProperty, changes);
    }
  }
}

function compareSchemaArray(
  path: string,
  keyword: string,
  previous: JsonObject,
  current: JsonObject,
  changes: SchemaChange[],
): void {
  const previousArray = arrayAt(previous, keyword);
  const currentArray = arrayAt(current, keyword);
  if (previousArray === undefined && currentArray === undefined) {
    return;
  }
  if (previousArray === undefined || currentArray === undefined || previousArray.length !== currentArray.length) {
    changes.push({ kind: "breaking", path: `${path}/${keyword}`, reason: `${keyword} composition changed` });
    return;
  }
  for (const [index, previousItem] of previousArray.entries()) {
    compareNode(`${path}/${keyword}/${index}`, previousItem, currentArray[index], changes);
  }
}

function compareItems(path: string, previous: JsonObject, current: JsonObject, changes: SchemaChange[]): void {
  const previousItems = previous.items;
  const currentItems = current.items;
  if (previousItems === undefined && currentItems === undefined) {
    return;
  }
  compareNode(`${path}/items`, previousItems, currentItems, changes);
}

function compareDefinitions(path: string, previous: JsonObject, current: JsonObject, changes: SchemaChange[]): void {
  const previousDefs = objectAt(previous, "$defs");
  const currentDefs = objectAt(current, "$defs");
  if (previousDefs === undefined && currentDefs === undefined) {
    return;
  }
  if (previousDefs === undefined || currentDefs === undefined) {
    changes.push({ kind: "breaking", path: `${path}/$defs`, reason: "$defs block was added or removed" });
    return;
  }

  const names = new Set([...Object.keys(previousDefs), ...Object.keys(currentDefs)].sort());
  for (const name of names) {
    compareNode(`${path}/$defs/${name}`, previousDefs[name], currentDefs[name], changes);
  }
}

function compareUnhandledKeywords(path: string, previous: JsonObject, current: JsonObject, changes: SchemaChange[]): void {
  const previousUnhandled = unhandledSemanticObject(previous);
  const currentUnhandled = unhandledSemanticObject(current);
  if (!semanticEqual(previousUnhandled, currentUnhandled)) {
    changes.push({
      kind: "breaking",
      path,
      reason: "contains an unsupported or ambiguous schema change",
    });
  }
}

function unhandledSemanticObject(value: JsonObject): JsonObject {
  const result: Record<string, JsonValue> = {};
  for (const [key, child] of Object.entries(value)) {
    if (annotationKeywords.has(key) || handledObjectKeywords.has(key)) {
      continue;
    }
    const normalized = normalizeSemanticValue(child);
    if (normalized !== undefined) {
      result[key] = normalized;
    }
  }
  return result;
}

function normalizeSemanticValue(value: JsonValue | undefined): JsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeSemanticValue(entry) ?? null);
  }
  if (!isJsonObject(value)) {
    return value;
  }

  const result: Record<string, JsonValue> = {};
  for (const key of Object.keys(value).sort()) {
    if (annotationKeywords.has(key)) {
      continue;
    }
    const normalized = normalizeSemanticValue(value[key]);
    if (normalized !== undefined) {
      result[key] = normalized;
    }
  }
  return result;
}

function semanticEqual(left: JsonValue | undefined, right: JsonValue | undefined): boolean {
  return JSON.stringify(normalizeSemanticValue(left)) === JSON.stringify(normalizeSemanticValue(right));
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function objectAt(value: JsonObject, key: string): JsonObject | undefined {
  const child = value[key];
  return isJsonObject(child) ? child : undefined;
}

function arrayAt(value: JsonObject, key: string): readonly JsonValue[] | undefined {
  const child = value[key];
  return Array.isArray(child) ? child : undefined;
}

function stringArrayAt(value: JsonObject, key: string): readonly string[] {
  const child = value[key];
  if (!Array.isArray(child)) {
    return [];
  }
  return child.filter((entry) => typeof entry === "string");
}

function numberAt(value: JsonObject, key: string): number | undefined {
  const child = value[key];
  return typeof child === "number" ? child : undefined;
}

interface Semver {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

function parseSemver(version: string): Semver | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(version);
  if (match === null) {
    return undefined;
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (!Number.isInteger(major) || !Number.isInteger(minor) || !Number.isInteger(patch)) {
    return undefined;
  }
  return { major, minor, patch };
}

function compareSemver(left: Semver, right: Semver): number {
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  return left.patch - right.patch;
}
