import type { PolicyConfig } from "protocol";
export declare const GOVERNANCE_CONFIG_DIR = ".dev-genie";
export declare const DEFAULT_GOVERNANCE_FILE_NAME = "governance.json";
export declare const DEFAULT_POLICY_CONFIG: PolicyConfig;
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
export declare class PolicyConfigError extends Error {
    readonly name = "PolicyConfigError";
    readonly code: PolicyConfigErrorCode;
    readonly details: readonly string[];
    readonly filePath: string | undefined;
    constructor(options: PolicyConfigErrorOptions);
}
export declare function loadPolicyConfig(options: LoadPolicyConfigOptions): PolicyConfig;
/**
 * Resolves in-memory governance config by applying safe defaults first, then
 * overriding present top-level keys. A present autonomy_profile object is merged
 * the same way per domain. Unknown keys are retained for Ajv to reject.
 */
export declare function resolvePolicyConfig(raw: unknown): PolicyConfig;
export declare function defaultPolicyConfig(): PolicyConfig;
