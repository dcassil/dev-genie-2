import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DEFAULT_AUTONOMY_PROFILE,
} from "daimyo";
import type { PolicyConfig } from "protocol";

import {
  isPolicyConfig,
  policyConfigValidationErrors,
} from "../schemas/protocol-schemas.js";
import { fromDaimyoStaticRules } from "./static-rules.js";

export const GOVERNANCE_CONFIG_DIR = ".dev-genie";
export const DEFAULT_GOVERNANCE_FILE_NAME = "governance.json";

const DAIMYO_DEFAULT_READ_ONLY_TOOLS = ["Read", "Grep", "Glob", "LS", "TodoRead"] as const;

export const DEFAULT_POLICY_CONFIG: PolicyConfig = {
  autonomy_profile: DEFAULT_AUTONOMY_PROFILE,
  product_baseline_approved: false,
  static_rules: fromDaimyoStaticRules(DAIMYO_DEFAULT_READ_ONLY_TOOLS, []),
};

export interface LoadPolicyConfigOptions {
  readonly projectDir: string;
  readonly fileName?: string;
}

export type PolicyConfigErrorCode = "malformed_json" | "read_failed" | "schema_invalid";

export interface PolicyConfigErrorOptions {
  readonly code: PolicyConfigErrorCode;
  readonly message: string;
  readonly details?: readonly string[];
  readonly filePath?: string | undefined;
  readonly cause?: unknown;
}

export class PolicyConfigError extends Error {
  override readonly name = "PolicyConfigError";
  readonly code: PolicyConfigErrorCode;
  readonly details: readonly string[];
  readonly filePath: string | undefined;

  constructor(options: PolicyConfigErrorOptions) {
    super(options.message, { cause: options.cause });
    this.code = options.code;
    this.details = options.details ?? [];
    this.filePath = options.filePath;
  }
}

export function loadPolicyConfig(options: LoadPolicyConfigOptions): PolicyConfig {
  const filePath = governanceConfigPath(options);
  if (!existsSync(filePath)) {
    return defaultPolicyConfig();
  }

  let contents: string;
  try {
    contents = readFileSync(filePath, "utf8");
  } catch (error) {
    throw new PolicyConfigError({
      code: "read_failed",
      message: `Unable to read governance config at ${filePath}.`,
      details: [readErrorMessage(error)],
      filePath,
      cause: error,
    });
  }

  let raw: unknown;
  try {
    raw = JSON.parse(contents);
  } catch (error) {
    throw new PolicyConfigError({
      code: "malformed_json",
      message: `Governance config at ${filePath} is not valid JSON.`,
      details: [readErrorMessage(error)],
      filePath,
      cause: error,
    });
  }

  return resolvePolicyConfigForSource(raw, filePath);
}

/**
 * Resolves in-memory governance config by applying safe defaults first, then
 * overriding present top-level keys. A present autonomy_profile object is merged
 * the same way per domain. Unknown keys are retained for Ajv to reject.
 */
export function resolvePolicyConfig(raw: unknown): PolicyConfig {
  return resolvePolicyConfigForSource(raw, undefined);
}

export function defaultPolicyConfig(): PolicyConfig {
  return {
    autonomy_profile: DEFAULT_AUTONOMY_PROFILE,
    product_baseline_approved: DEFAULT_POLICY_CONFIG.product_baseline_approved,
    static_rules: fromDaimyoStaticRules(DAIMYO_DEFAULT_READ_ONLY_TOOLS, []),
  };
}

function resolvePolicyConfigForSource(raw: unknown, filePath: string | undefined): PolicyConfig {
  const candidate = applyPolicyConfigDefaults(raw);
  if (isPolicyConfig(candidate)) {
    return candidate;
  }

  throw new PolicyConfigError({
    code: "schema_invalid",
    message: sourceMessage(filePath, "Governance config does not match the PolicyConfig schema."),
    details: policyConfigValidationErrors(),
    filePath,
  });
}

function applyPolicyConfigDefaults(raw: unknown): unknown {
  if (!isUnknownObject(raw)) {
    return raw;
  }

  const defaults = defaultPolicyConfig();
  return {
    ...raw,
    autonomy_profile: hasOwn(raw, "autonomy_profile")
      ? applyAutonomyProfileDefaults(raw.autonomy_profile, defaults.autonomy_profile)
      : defaults.autonomy_profile,
    product_baseline_approved: hasOwn(raw, "product_baseline_approved")
      ? raw.product_baseline_approved
      : defaults.product_baseline_approved,
    static_rules: hasOwn(raw, "static_rules") ? raw.static_rules : defaults.static_rules,
  };
}

function applyAutonomyProfileDefaults(raw: unknown, defaults: PolicyConfig["autonomy_profile"]): unknown {
  if (!isUnknownObject(raw)) {
    return raw;
  }

  return {
    ...raw,
    engineering: hasOwn(raw, "engineering") ? raw.engineering : defaults.engineering,
    product: hasOwn(raw, "product") ? raw.product : defaults.product,
    design: hasOwn(raw, "design") ? raw.design : defaults.design,
  };
}

function governanceConfigPath(options: LoadPolicyConfigOptions): string {
  return join(
    options.projectDir,
    GOVERNANCE_CONFIG_DIR,
    options.fileName ?? DEFAULT_GOVERNANCE_FILE_NAME,
  );
}

function sourceMessage(filePath: string | undefined, message: string): string {
  if (filePath === undefined) {
    return message;
  }
  return `${message} Path: ${filePath}`;
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

interface UnknownObject {
  readonly [key: string]: unknown;
}

function isUnknownObject(value: unknown): value is UnknownObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(source: UnknownObject, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key);
}
