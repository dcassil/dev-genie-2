import type {
  JsonObject,
  JsonValue,
  OwnershipSurface,
  TouchReport,
} from "protocol";

import type { PolicyDecisionInput } from "./engine.js";

export type ConflictClass = "no_conflict" | "soft_conflict" | "hard_conflict";

export interface ConflictAssessment {
  readonly conflict_class: ConflictClass;
  readonly affected_siblings: readonly string[];
  readonly rationale: string;
}

export type SiblingOwnership = Readonly<Partial<OwnershipSurface>> & {
  readonly sibling_id: string;
};

type SurfaceKind =
  | "file"
  | "interface"
  | "workflow"
  | "config"
  | "table"
  | "collection"
  | "bucket"
  | "queue"
  | "topic"
  | "secret"
  | "data"
  | "schema"
  | "governance";

interface NormalizedSurface {
  readonly kind: SurfaceKind;
  readonly identifier: string;
  readonly original: string;
}

interface ConflictSignals {
  readonly changedSurfaces: readonly NormalizedSurface[];
  readonly matchedDependencyIds: readonly string[];
}

const SURFACE_PREFIXES: readonly SurfaceKind[] = [
  "file",
  "interface",
  "workflow",
  "config",
  "table",
  "collection",
  "bucket",
  "queue",
  "topic",
  "secret",
  "data",
  "schema",
  "governance",
];

export function assessConflict(
  input: PolicyDecisionInput,
  siblings?: readonly SiblingOwnership[],
): ConflictAssessment {
  if (siblings === undefined || siblings.length === 0) {
    return {
      conflict_class: "no_conflict",
      affected_siblings: [],
      rationale: "No sibling ownership data was supplied; conflict assessment degrades to scope-only no_conflict.",
    };
  }

  const signals = conflictSignals(input);
  const missingChangedSurfaceSiblingIds = signals.changedSurfaces.length === 0
    ? siblings.map((sibling) => sibling.sibling_id)
    : [];
  const incompleteSiblingIds = affectedIncompleteSiblings(siblings);
  const missingMatchedDependencyIds = signals.matchedDependencyIds.filter(
    (siblingId) => !siblings.some((sibling) => sibling.sibling_id === siblingId),
  );
  const directOverlapSiblingIds = siblings
    .filter((sibling) => siblingHasOwnedOverlap(signals.changedSurfaces, sibling))
    .map((sibling) => sibling.sibling_id);

  const hardSiblingIds = unique([
    ...missingChangedSurfaceSiblingIds,
    ...incompleteSiblingIds,
    ...missingMatchedDependencyIds,
    ...directOverlapSiblingIds,
  ]);

  if (hardSiblingIds.length > 0) {
    return {
      conflict_class: "hard_conflict",
      affected_siblings: hardSiblingIds,
      rationale: hardRationale(
        missingChangedSurfaceSiblingIds,
        incompleteSiblingIds,
        missingMatchedDependencyIds,
        directOverlapSiblingIds,
        hardSiblingIds,
      ),
    };
  }

  const softSiblingIds = unique([
    ...siblings
      .filter((sibling) => siblingHasDependencyOverlap(signals.changedSurfaces, sibling))
      .map((sibling) => sibling.sibling_id),
    ...siblings
      .filter((sibling) => signals.matchedDependencyIds.includes(sibling.sibling_id))
      .map((sibling) => sibling.sibling_id),
  ]);

  if (softSiblingIds.length > 0) {
    return {
      conflict_class: "soft_conflict",
      affected_siblings: softSiblingIds,
      rationale: `Touched or requested surfaces intersect sibling depends_on declarations or caller-matched dependencies for ${softSiblingIds.join(", ")}.`,
    };
  }

  return {
    conflict_class: "no_conflict",
    affected_siblings: [],
    rationale: "No changed surface overlaps sibling ownership or dependency surfaces.",
  };
}

function conflictSignals(input: PolicyDecisionInput): ConflictSignals {
  const context = input.request.context ?? {};
  const ownershipSurfaces = [
    ...ownershipSurfaceStrings(input.ownership_scope),
    ...readStringArray(context, "ownership_scope"),
    ...ownershipSurfaceStrings(readOwnershipSurface(context, "ownership_surface")),
  ];
  const touchSurfaces = [
    ...touchReportSurfaceStrings(input.touch_report),
    ...readStringArray(context, "touched_surfaces"),
    ...touchReportSurfaceStrings(readTouchReport(context, "touch_report")),
    ...touchReportFieldSurfaceStrings(context),
  ];

  return {
    changedSurfaces: uniqueSurfaces([
      ...touchSurfaces.flatMap((surface) => normalizeGeneralSurface(surface)),
      ...ownershipSurfaces.flatMap((surface) => normalizeGeneralSurface(surface)),
    ]),
    matchedDependencyIds: unique([
      ...(input.matched_dependencies ?? []),
      ...readStringArray(context, "matched_dependencies"),
    ]),
  };
}

function ownershipSurfaceStrings(surface: OwnershipSurface | undefined): readonly string[] {
  if (surface === undefined) {
    return [];
  }

  return [
    ...surface.owns_files.map((value) => asSurfaceString("file", value)),
    ...surface.owns_interfaces.map((value) => asSurfaceString("interface", value)),
    ...surface.owns_data,
    ...surface.owns_workflow_steps.map((value) => asSurfaceString("workflow", value)),
  ];
}

function touchReportSurfaceStrings(report: TouchReport | undefined): readonly string[] {
  if (report === undefined) {
    return [];
  }

  return [
    ...report.touched_files.map((value) => asSurfaceString("file", value)),
    ...report.touched_interfaces.map((value) => asSurfaceString("interface", value)),
    ...report.touched_data,
    ...report.touched_workflow_steps.map((value) => asSurfaceString("workflow", value)),
  ];
}

function touchReportFieldSurfaceStrings(context: JsonObject): readonly string[] {
  return [
    ...readStringArray(context, "touched_files").map((value) => asSurfaceString("file", value)),
    ...readStringArray(context, "touched_interfaces").map((value) => asSurfaceString("interface", value)),
    ...readStringArray(context, "touched_data"),
    ...readStringArray(context, "touched_workflow_steps").map((value) => asSurfaceString("workflow", value)),
  ];
}

function siblingHasOwnedOverlap(
  changedSurfaces: readonly NormalizedSurface[],
  sibling: SiblingOwnership,
): boolean {
  const ownedSurfaces = [
    ...normalizeOwnedSurfaces("file", sibling.owns_files),
    ...normalizeOwnedSurfaces("interface", sibling.owns_interfaces),
    ...normalizeOwnedSurfaces("data", sibling.owns_data),
    ...normalizeOwnedSurfaces("workflow", sibling.owns_workflow_steps),
  ];

  return surfacesIntersect(changedSurfaces, ownedSurfaces);
}

function siblingHasDependencyOverlap(
  changedSurfaces: readonly NormalizedSurface[],
  sibling: SiblingOwnership,
): boolean {
  return surfacesIntersect(changedSurfaces, normalizeOwnedSurfaces("data", sibling.depends_on));
}

function normalizeOwnedSurfaces(
  defaultKind: SurfaceKind,
  values: readonly string[] | undefined,
): readonly NormalizedSurface[] {
  if (values === undefined) {
    return [];
  }
  return values.flatMap((value) => normalizeSurface(value, defaultKind));
}

function normalizeGeneralSurface(surface: string): readonly NormalizedSurface[] {
  return normalizeSurface(surface, undefined);
}

function normalizeSurface(
  surface: string,
  defaultKind: SurfaceKind | undefined,
): readonly NormalizedSurface[] {
  const trimmed = surface.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const explicitKind = explicitKindFor(trimmed);
  if (explicitKind !== undefined) {
    return [{
      kind: explicitKind,
      identifier: trimmed.slice(explicitKind.length + 1),
      original: surface,
    }];
  }

  if (defaultKind !== undefined) {
    return [{
      kind: defaultKind,
      identifier: trimmed,
      original: surface,
    }];
  }

  return [];
}

function explicitKindFor(surface: string): SurfaceKind | undefined {
  const separatorIndex = surface.indexOf(":");
  if (separatorIndex < 1) {
    return undefined;
  }

  const prefix = surface.slice(0, separatorIndex);
  return SURFACE_PREFIXES.find((candidate) => candidate === prefix);
}

function surfacesIntersect(
  left: readonly NormalizedSurface[],
  right: readonly NormalizedSurface[],
): boolean {
  return left.some((leftSurface) =>
    right.some((rightSurface) => surfacesOverlap(leftSurface, rightSurface)),
  );
}

function surfacesOverlap(left: NormalizedSurface, right: NormalizedSurface): boolean {
  return left.kind === right.kind && identifiersOverlap(left.identifier, right.identifier);
}

function identifiersOverlap(left: string, right: string): boolean {
  if (left === right) {
    return true;
  }
  if (!left.includes("*") && !right.includes("*")) {
    return false;
  }
  if (wildcardMatches(left, right) || wildcardMatches(right, left)) {
    return true;
  }

  const leftPrefix = literalPrefix(left);
  const rightPrefix = literalPrefix(right);
  return leftPrefix.length === 0 ||
    rightPrefix.length === 0 ||
    leftPrefix.startsWith(rightPrefix) ||
    rightPrefix.startsWith(leftPrefix);
}

function wildcardMatches(pattern: string, value: string): boolean {
  if (!pattern.includes("*")) {
    return pattern === value;
  }

  const segments = pattern.split("*");
  let searchIndex = 0;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment === undefined || segment.length === 0) {
      continue;
    }

    if (index === 0 && !pattern.startsWith("*")) {
      if (!value.startsWith(segment)) {
        return false;
      }
      searchIndex = segment.length;
      continue;
    }

    const foundIndex = value.indexOf(segment, searchIndex);
    if (foundIndex === -1) {
      return false;
    }
    searchIndex = foundIndex + segment.length;
  }

  const finalSegment = segments[segments.length - 1];
  return pattern.endsWith("*") ||
    finalSegment === undefined ||
    finalSegment.length === 0 ||
    value.endsWith(finalSegment);
}

function literalPrefix(value: string): string {
  const wildcardIndex = value.indexOf("*");
  return wildcardIndex === -1 ? value : value.slice(0, wildcardIndex);
}

function affectedIncompleteSiblings(siblings: readonly SiblingOwnership[]): readonly string[] {
  return siblings
    .filter((sibling) => siblingOwnershipIsIncomplete(sibling))
    .map((sibling) => sibling.sibling_id);
}

function siblingOwnershipIsIncomplete(sibling: SiblingOwnership): boolean {
  const requiredArrays = [
    sibling.owns_files,
    sibling.owns_interfaces,
    sibling.owns_data,
    sibling.owns_workflow_steps,
  ];
  if (!requiredArrays.every(Array.isArray)) {
    return true;
  }

  const declaredSurfaceCount = [
    ...requiredArrays,
    sibling.depends_on ?? [],
  ].reduce((count, entries) => count + entries.length, 0);

  return declaredSurfaceCount === 0;
}

function readOwnershipSurface(context: JsonObject, key: string): OwnershipSurface | undefined {
  const value = context[key];
  if (!isJsonObject(value)) {
    return undefined;
  }

  const ownsFiles = readStringArray(value, "owns_files");
  const ownsInterfaces = readStringArray(value, "owns_interfaces");
  const ownsData = readStringArray(value, "owns_data");
  const ownsWorkflowSteps = readStringArray(value, "owns_workflow_steps");

  if (
    ownsFiles.length === 0 &&
    ownsInterfaces.length === 0 &&
    ownsData.length === 0 &&
    ownsWorkflowSteps.length === 0
  ) {
    return undefined;
  }

  const dependsOn = readStringArray(value, "depends_on");
  return {
    owns_files: ownsFiles,
    owns_interfaces: ownsInterfaces,
    owns_data: ownsData,
    owns_workflow_steps: ownsWorkflowSteps,
    ...(dependsOn.length === 0 ? {} : { depends_on: dependsOn }),
  };
}

function readTouchReport(context: JsonObject, key: string): TouchReport | undefined {
  const value = context[key];
  if (!isJsonObject(value)) {
    return undefined;
  }

  const taskId = readString(value, "task_id");
  if (taskId === undefined || value.report_type !== "touch_report") {
    return undefined;
  }

  return {
    task_id: taskId,
    report_type: "touch_report",
    touched_files: readStringArray(value, "touched_files"),
    touched_interfaces: readStringArray(value, "touched_interfaces"),
    touched_data: readStringArray(value, "touched_data"),
    touched_workflow_steps: readStringArray(value, "touched_workflow_steps"),
  };
}

function readString(context: JsonObject, key: string): string | undefined {
  const value = context[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readStringArray(context: JsonObject, key: string): string[] {
  const value = context[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isString);
}

function isString(value: JsonValue): value is string {
  return typeof value === "string";
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asSurfaceString(kind: SurfaceKind, value: string): string {
  return explicitKindFor(value) === undefined ? `${kind}:${value}` : value;
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function uniqueSurfaces(surfaces: readonly NormalizedSurface[]): readonly NormalizedSurface[] {
  const seen = new Set<string>();
  const uniqueValues: NormalizedSurface[] = [];

  for (const surface of surfaces) {
    const key = `${surface.kind}:${surface.identifier}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueValues.push(surface);
    }
  }

  return uniqueValues;
}

function hardRationale(
  missingChangedSurfaceSiblingIds: readonly string[],
  incompleteSiblingIds: readonly string[],
  missingMatchedDependencyIds: readonly string[],
  directOverlapSiblingIds: readonly string[],
  hardSiblingIds: readonly string[],
): string {
  const details: string[] = [];
  if (missingChangedSurfaceSiblingIds.length > 0) {
    details.push(`missing deciding ownership or touch surfaces while sibling data is present for ${missingChangedSurfaceSiblingIds.join(", ")}`);
  }
  if (incompleteSiblingIds.length > 0) {
    details.push(`incomplete sibling ownership data for ${incompleteSiblingIds.join(", ")}`);
  }
  if (missingMatchedDependencyIds.length > 0) {
    details.push(`matched dependencies without supplied sibling surfaces for ${missingMatchedDependencyIds.join(", ")}`);
  }
  if (directOverlapSiblingIds.length > 0) {
    details.push(`direct ownership overlap or shared-contract surface ownership for ${directOverlapSiblingIds.join(", ")}`);
  }
  details.push(`affected siblings: ${hardSiblingIds.join(", ")}`);
  return `Hard conflict: ${details.join("; ")}.`;
}
