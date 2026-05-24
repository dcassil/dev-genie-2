import type {
  JsonObject,
  JsonValue,
  PermissionDecisionRequest,
  PolicyStaticRule,
  PolicyStaticRules,
  PolicyStringContainsPredicate,
} from "protocol";

import type { PolicyDecisionInput } from "./engine.js";

export type StaticRuleEffect = "allow" | "deny";

export interface RuleMatch {
  readonly effect: StaticRuleEffect | "no_match";
  readonly matched_rule_ref: string | null;
  readonly matched_rule_refs: readonly string[];
  readonly rationale: string;
}

export function evaluateStaticRules(
  input: PolicyDecisionInput,
  staticRules: PolicyStaticRules,
): RuleMatch {
  if (input.request.surface !== "permission") {
    return noMatch(`Static rules apply only to the permission surface, not ${input.request.surface}.`);
  }
  if (!Array.isArray(staticRules)) {
    return noMatch("Static rules config is a legacy placeholder object with no ordered permission rules.");
  }

  for (const rule of staticRules) {
    if (permissionRuleMatches(input.request, rule)) {
      return {
        effect: rule.effect,
        matched_rule_ref: rule.id,
        matched_rule_refs: [rule.id],
        rationale: `Static ${rule.effect} rule ${rule.id} matched permission tool ${input.request.tool_name}. Rules are first-match-wins.`,
      };
    }
  }

  return noMatch(`No static permission rule matched tool ${input.request.tool_name}.`);
}

export function fromDaimyoStaticRules(
  allowTools: readonly string[] = [],
  denyTools: readonly string[] = [],
): PolicyStaticRule[] {
  return [
    ...denyTools.map((toolName, index) => daimyoRule("deny", toolName, index)),
    ...allowTools.map((toolName, index) => daimyoRule("allow", toolName, index)),
  ];
}

function permissionRuleMatches(request: PermissionDecisionRequest, rule: PolicyStaticRule): boolean {
  return toolNameMatches(rule.match.tool_name, request.tool_name) &&
    argumentsContain(request.arguments, rule.match.arguments_contains) &&
    ownershipScopeMatches(request.context, rule.match.ownership_scope_prefix) &&
    altitudeMatches(request.context, rule.match.altitude);
}

function toolNameMatches(pattern: string, toolName: string): boolean {
  if (!pattern.includes("*")) {
    return pattern === toolName;
  }

  const segments = pattern.split("*");
  let searchIndex = 0;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment === undefined || segment.length === 0) {
      continue;
    }

    if (index === 0 && !pattern.startsWith("*")) {
      if (!toolName.startsWith(segment)) return false;
      searchIndex = segment.length;
      continue;
    }

    const foundIndex = toolName.indexOf(segment, searchIndex);
    if (foundIndex === -1) {
      return false;
    }
    searchIndex = foundIndex + segment.length;
  }

  const finalSegment = segments[segments.length - 1];
  if (!pattern.endsWith("*") && finalSegment !== undefined && finalSegment.length > 0) {
    return toolName.endsWith(finalSegment);
  }

  return true;
}

function argumentsContain(
  args: JsonObject,
  predicates: Readonly<Record<string, PolicyStringContainsPredicate>> | undefined,
): boolean {
  if (predicates === undefined) {
    return true;
  }

  return Object.entries(predicates).every(([key, predicate]) => argumentContains(args[key], predicate));
}

function argumentContains(value: JsonValue | undefined, predicate: PolicyStringContainsPredicate): boolean {
  return typeof value === "string" && value.includes(containsText(predicate));
}

function containsText(predicate: PolicyStringContainsPredicate): string {
  if (typeof predicate === "string") {
    return predicate;
  }
  return predicate.contains;
}

function ownershipScopeMatches(context: JsonObject | undefined, prefix: string | undefined): boolean {
  if (prefix === undefined) {
    return true;
  }
  return readStringArray(context, "ownership_scope").some((surface) => surface.startsWith(prefix));
}

function altitudeMatches(context: JsonObject | undefined, altitude: string | undefined): boolean {
  if (altitude === undefined) {
    return true;
  }
  return readString(context, "altitude") === altitude;
}

function readString(context: JsonObject | undefined, key: string): string | undefined {
  const value = context?.[key];
  return typeof value === "string" ? value : undefined;
}

function readStringArray(context: JsonObject | undefined, key: string): readonly string[] {
  const value = context?.[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}

function daimyoRule(effect: StaticRuleEffect, toolName: string, index: number): PolicyStaticRule {
  return {
    id: `daimyo:${effect}:${index}:${toolName}`,
    effect,
    match: {
      tool_name: toolName,
    },
  };
}

function noMatch(rationale: string): RuleMatch {
  return {
    effect: "no_match",
    matched_rule_ref: null,
    matched_rule_refs: [],
    rationale,
  };
}
