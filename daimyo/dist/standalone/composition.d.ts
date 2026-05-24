import type { AgentTransport } from "../core/ports/agent-transport.js";
import type { RolesPlanning, Validation } from "../core/ports/capabilities.js";
import type { DecisionProvider } from "../core/ports/decision-provider.js";
import type { WorkSource } from "../core/ports/work-source.js";
import type { ExecutionStore } from "../core/execution-store.js";
import { type AutonomyProfile } from "../decision/autonomy.js";
import { type Tier1DecisionPrompt } from "../decision/tier1-prompt.js";
import { type DecisionModelClient, type StaticDecisionRules } from "../decision/tiered-decision-provider.js";
import { type StructuredModelCaller } from "../validation/built-in-validation.js";
import { type HumanDecisionNotifier } from "../notification/notifier.js";
import { Supervisor } from "../supervisor/supervisor.js";
export type StandalonePlanType = "markdown" | "json";
export interface StandalonePlanOptions {
    readonly filePath: string;
    readonly type?: StandalonePlanType;
}
export interface StandaloneModelOptions {
    readonly apiKey?: string;
    readonly apiKeyEnv?: string;
    readonly model?: string;
    readonly endpoint?: string;
}
export interface StandaloneDaimyoOptions {
    readonly cwd?: string;
    readonly workspaceDir?: string;
    readonly plan?: StandalonePlanOptions;
    readonly agentTransport?: AgentTransport;
    readonly workSource?: WorkSource;
    readonly executionStore?: ExecutionStore;
    readonly validation?: Validation;
    readonly rolesPlanning?: RolesPlanning;
    readonly decisionProvider?: DecisionProvider;
    readonly modelClient?: DecisionModelClient & StructuredModelCaller;
    readonly notifier?: HumanDecisionNotifier;
    readonly autonomyProfile?: AutonomyProfile;
    readonly staticRules?: StaticDecisionRules;
    readonly tier1Prompt?: Tier1DecisionPrompt | null;
    readonly maxRetries?: number;
    readonly maxConcurrency?: number;
    readonly stallAfterMs?: number;
    readonly model?: StandaloneModelOptions;
}
export interface StandaloneDaimyo {
    readonly supervisor: Supervisor;
    readonly agentTransport: AgentTransport;
    readonly workSource: WorkSource;
    readonly executionStore: ExecutionStore;
    readonly validation: Validation;
    readonly rolesPlanning: RolesPlanning;
    readonly decisionProvider: DecisionProvider;
    readonly notifier: HumanDecisionNotifier;
}
export declare function createStandaloneDaimyo(options: StandaloneDaimyoOptions): StandaloneDaimyo;
export declare function createStandaloneWorkSource(plan: StandalonePlanOptions | undefined): WorkSource;
export declare function inferPlanType(filePath: string): StandalonePlanType;
export declare function defaultWorkspaceDirForPlan(filePath: string): string;
