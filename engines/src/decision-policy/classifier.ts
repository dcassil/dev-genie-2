import type {
  AutonomyDomain,
  DecisionScope,
  JsonObject,
  JsonValue,
  Score0To10,
} from "daimyo";

import type { PolicyDecisionInput } from "./engine.js";

type ActionMatch = "exact" | "prefix";

export interface DomainClassificationRule {
  readonly id: string;
  readonly domain: AutonomyDomain;
  readonly match: ActionMatch;
  readonly values: readonly string[];
  readonly rationale: string;
}

export interface ScopeClassificationRule {
  readonly id: string;
  readonly scope: DecisionScope;
  readonly rationale: string;
  readonly matches: (signals: ScopeSignals) => boolean;
}

export interface ClassifiedDecision {
  readonly domain: AutonomyDomain;
  readonly scope: DecisionScope;
  readonly risk: Score0To10;
  readonly rationale: string;
}

interface ClassificationSignals {
  readonly actionType?: string;
  readonly altitude?: string;
  readonly ownershipScope: readonly string[];
  readonly touchedSurfaces: readonly string[];
  readonly context: JsonObject;
}

interface ScopeSignals {
  readonly altitude?: string;
  readonly surfaces: readonly string[];
}

const DEFAULT_DOMAIN: AutonomyDomain = "engineering";
const DEFAULT_SCOPE: DecisionScope = "moderate";
const DEFAULT_RISK: Score0To10 = 5;

const TASK_OWNED_SURFACE_PREFIXES = ["file:", "workflow:"] as const;
const SHARED_CONTRACT_SURFACE_PREFIXES = ["interface:", "config:", "schema:"] as const;
const MAJOR_ALTITUDES = ["initiative", "epic", "strategy", "vision", "root"] as const;
const MODERATE_ALTITUDES = ["story"] as const;

export const DEFAULT_DOMAIN_CLASSIFICATION_RULES: readonly DomainClassificationRule[] = [
  {
    id: "domain:design:exact-actions",
    domain: "design",
    match: "exact",
    values: ["ui_text_update"],
    rationale: "UI copy updates are design decisions.",
  },
  {
    id: "domain:design:action-prefixes",
    domain: "design",
    match: "prefix",
    values: ["ux_", "visual_", "interaction_"],
    rationale: "UX, visual, and interaction action families are design decisions.",
  },
  {
    id: "domain:product:exact-actions",
    domain: "product",
    match: "exact",
    values: ["policy_change", "product_behavior_change", "product_behavior_update"],
    rationale: "Policy and product-behavior actions change product behavior.",
  },
  {
    id: "domain:product:action-prefixes",
    domain: "product",
    match: "prefix",
    values: ["capability_", "workflow_", "scope_", "product_behavior_"],
    rationale: "Capability, workflow, scope, and product-behavior action families are product decisions.",
  },
  {
    id: "domain:engineering:exact-actions",
    domain: "engineering",
    match: "exact",
    values: ["api_response_change"],
    rationale: "API response changes are engineering contract decisions.",
  },
  {
    id: "domain:engineering:action-prefixes",
    domain: "engineering",
    match: "prefix",
    values: ["schema_", "tech_", "code_", "architecture_"],
    rationale: "Schema, technical, code, and architecture action families are engineering decisions.",
  },
];

export const DEFAULT_SCOPE_CLASSIFICATION_RULES: readonly ScopeClassificationRule[] = [
  {
    id: "scope:major:initiative-plus-altitude",
    scope: "major",
    rationale: "Initiative, epic, strategy, vision, and root altitude decisions cross a strategic review boundary.",
    matches: (signals) => isOneOf(signals.altitude, MAJOR_ALTITUDES),
  },
  {
    id: "scope:major:governance-or-config-wildcard",
    scope: "major",
    rationale: "Governance surfaces and wildcard config changes can affect multiple children or policy boundaries.",
    matches: (signals) => signals.surfaces.some((surface) => surface.startsWith("governance:") || isWildcardConfigSurface(surface)),
  },
  {
    id: "scope:moderate:shared-contract-task-altitude",
    scope: "moderate",
    rationale: "Task-altitude shared interface, config, or schema surfaces affect contracts outside a local task.",
    matches: (signals) => signals.altitude === "task" && signals.surfaces.some(isSharedContractSurface),
  },
  {
    id: "scope:moderate:story-altitude",
    scope: "moderate",
    rationale: "Story altitude is above a task-local implementation detail but below initiative scope.",
    matches: (signals) => isOneOf(signals.altitude, MODERATE_ALTITUDES),
  },
  {
    id: "scope:local:task-owned-surfaces",
    scope: "local",
    rationale: "Task altitude with only file or workflow surfaces stays within task-owned execution scope.",
    matches: (signals) =>
      signals.altitude === "task" &&
      signals.surfaces.length > 0 &&
      signals.surfaces.every(isTaskOwnedSurface),
  },
];

export function classifyDecision(input: PolicyDecisionInput): ClassifiedDecision {
  const signals = classificationSignals(input.request.context);
  const domainResult = classifyDomain(signals);
  const scopeResult = classifyScope(signals);
  const riskResult = classifyRisk(signals.context);

  return {
    domain: domainResult.value,
    scope: scopeResult.value,
    risk: riskResult.value,
    rationale: [
      domainResult.rationale,
      scopeResult.rationale,
      riskResult.rationale,
    ].join(" "),
  };
}

function classifyDomain(signals: ClassificationSignals): ClassificationPart<AutonomyDomain> {
  const explicitDomain = readDomain(signals.context, "domain") ?? readDomain(signals.context, "decision_domain");
  if (explicitDomain !== undefined) {
    return {
      value: explicitDomain,
      rationale: `Domain ${explicitDomain} was caller-supplied in request context.`,
    };
  }

  if (signals.actionType !== undefined) {
    const actionType = signals.actionType;
    const matchedRule = DEFAULT_DOMAIN_CLASSIFICATION_RULES.find((rule) => domainRuleMatches(rule, actionType));
    if (matchedRule !== undefined) {
      return {
        value: matchedRule.domain,
        rationale: `Domain ${matchedRule.domain} inferred by ${matchedRule.id}: ${matchedRule.rationale}`,
      };
    }
  }

  return {
    value: DEFAULT_DOMAIN,
    rationale: "Domain defaulted to engineering because no explicit domain or action_type rule matched.",
  };
}

function classifyScope(signals: ClassificationSignals): ClassificationPart<DecisionScope> {
  const explicitScope = readScope(signals.context, "scope") ?? readScope(signals.context, "decision_scope");
  if (explicitScope !== undefined) {
    return {
      value: explicitScope,
      rationale: `Scope ${explicitScope} was caller-supplied in request context.`,
    };
  }

  const scopeSignals: ScopeSignals = {
    ...(signals.altitude === undefined ? {} : { altitude: signals.altitude }),
    surfaces: [...signals.ownershipScope, ...signals.touchedSurfaces],
  };
  const matchedRule = DEFAULT_SCOPE_CLASSIFICATION_RULES.find((rule) => rule.matches(scopeSignals));
  if (matchedRule !== undefined) {
    return {
      value: matchedRule.scope,
      rationale: `Scope ${matchedRule.scope} inferred by ${matchedRule.id}: ${matchedRule.rationale}`,
    };
  }

  return {
    value: DEFAULT_SCOPE,
    rationale: "Scope defaulted to moderate because ownership and altitude signals were absent or insufficient for local scope.",
  };
}

interface ClassificationPart<TValue> {
  readonly value: TValue;
  readonly rationale: string;
}

function classifyRisk(context: JsonObject): ClassificationPart<Score0To10> {
  const explicitRisk = readScore(context, "risk") ?? readScore(context, "declared_risk");
  if (explicitRisk !== undefined) {
    return {
      value: explicitRisk,
      rationale: `Risk ${explicitRisk} was caller-supplied in request context.`,
    };
  }

  const riskLevel = readString(context, "risk_level") ?? readString(context, "declared_risk_level");
  if (riskLevel !== undefined) {
    const mappedRisk = riskForLevel(riskLevel);
    if (mappedRisk !== undefined) {
      return {
        value: mappedRisk,
        rationale: `Risk ${mappedRisk} inferred from risk_level ${riskLevel}.`,
      };
    }
  }

  return {
    value: DEFAULT_RISK,
    rationale: "Risk defaulted to 5 to match daimyo's declared-risk default.",
  };
}

function classificationSignals(context: JsonObject | undefined): ClassificationSignals {
  const safeContext = context ?? {};
  const altitude = readString(safeContext, "altitude");
  const actionType = readString(safeContext, "action_type");
  const ownershipScope = readStringArray(safeContext, "ownership_scope");
  const touchedSurfaces = readStringArray(safeContext, "touched_surfaces");

  return {
    ...(actionType === undefined ? {} : { actionType }),
    ...(altitude === undefined ? {} : { altitude }),
    ownershipScope,
    touchedSurfaces,
    context: safeContext,
  };
}

function domainRuleMatches(rule: DomainClassificationRule, actionType: string): boolean {
  if (rule.match === "exact") {
    return rule.values.includes(actionType);
  }
  return rule.values.some((value) => actionType.startsWith(value));
}

function readDomain(context: JsonObject, key: string): AutonomyDomain | undefined {
  const value = context[key];
  if (value === "engineering" || value === "product" || value === "design") return value;
  return undefined;
}

function readScope(context: JsonObject, key: string): DecisionScope | undefined {
  const value = context[key];
  if (value === "local" || value === "moderate" || value === "major") return value;
  return undefined;
}

function readScore(context: JsonObject, key: string): Score0To10 | undefined {
  const value = context[key];
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  if (value === 0 || value === 1 || value === 2 || value === 3 || value === 4) return value;
  if (value === 5 || value === 6 || value === 7 || value === 8 || value === 9 || value === 10) return value;
  return undefined;
}

function readString(context: JsonObject, key: string): string | undefined {
  const value = context[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readStringArray(context: JsonObject, key: string): readonly string[] {
  const value = context[key];
  if (!Array.isArray(value)) return [];
  return value.filter(isString);
}

function riskForLevel(riskLevel: string): Score0To10 | undefined {
  switch (riskLevel) {
    case "low":
      return 2;
    case "medium":
      return 5;
    case "high":
      return 8;
    case "critical":
      return 10;
    default:
      return undefined;
  }
}

function isWildcardConfigSurface(surface: string): boolean {
  return surface.startsWith("config:") && surface.includes("*");
}

function isSharedContractSurface(surface: string): boolean {
  return SHARED_CONTRACT_SURFACE_PREFIXES.some((prefix) => surface.startsWith(prefix));
}

function isTaskOwnedSurface(surface: string): boolean {
  return TASK_OWNED_SURFACE_PREFIXES.some((prefix) => surface.startsWith(prefix));
}

function isString(value: JsonValue): value is string {
  return typeof value === "string";
}

function isOneOf<TValue extends string>(value: string | undefined, options: readonly TValue[]): value is TValue {
  return value !== undefined && options.some((option) => option === value);
}
