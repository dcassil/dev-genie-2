import type { DecisionRecord, DecisionRequest, DecisionVerdict, ExecutionStore, PermissionDecisionRequest, RoutingDecisionRequest } from "../core/index.js";
import type { DecisionProvider, DecisionProviderDependencies } from "../core/index.js";
import type { AgentTransport } from "../core/ports/agent-transport.js";
import type { StructuredModelRequest, StructuredModelSchema } from "../engine/structured-model-call.js";
import { type AutonomyProfile } from "./autonomy.js";
import { type Tier1DecisionPrompt } from "./tier1-prompt.js";
import { type HumanDecisionNotifier } from "../notification/notifier.js";
export interface StaticDecisionRules {
    readonly allowTools?: readonly string[];
    readonly denyTools?: readonly string[];
}
export interface DecisionModelClient {
    call<T>(request: StructuredModelRequest<T>): Promise<T>;
}
export interface Tier2InvestigationRequest {
    readonly request: DecisionRequest;
    readonly tier1Verdict: DecisionVerdict;
    readonly thresholdReason: string;
}
export interface Tier2InvestigationHook {
    investigate(request: Tier2InvestigationRequest): Promise<DecisionVerdict>;
}
export interface AgentTransportTier2InvestigationHookOptions {
    readonly agentTransport: AgentTransport;
    readonly cwd: string;
    readonly maxEvents?: number;
}
export interface TieredDecisionProviderOptions {
    readonly executionStore: ExecutionStore;
    readonly autonomyProfile?: AutonomyProfile;
    readonly staticRules?: StaticDecisionRules;
    readonly modelClient?: DecisionModelClient;
    readonly tier1Prompt?: Tier1DecisionPrompt | null;
    readonly notifier?: HumanDecisionNotifier;
    readonly tier2InvestigationHook?: Tier2InvestigationHook;
    readonly clock?: () => string;
}
export declare class AgentTransportTier2InvestigationHook implements Tier2InvestigationHook {
    private readonly agentTransport;
    private readonly cwd;
    private readonly maxEvents;
    constructor(options: AgentTransportTier2InvestigationHookOptions);
    investigate(request: Tier2InvestigationRequest): Promise<DecisionVerdict>;
    private handleNonTerminalEvent;
}
export declare class TieredDecisionProvider implements DecisionProvider {
    private readonly executionStore;
    private readonly autonomyProfile;
    private readonly staticRules;
    private readonly modelClient;
    private readonly tier1Prompt;
    private readonly notifier;
    private readonly tier2InvestigationHook;
    private readonly clock;
    constructor(options: TieredDecisionProviderOptions);
    decidePermission(request: PermissionDecisionRequest, _dependencies?: DecisionProviderDependencies): Promise<DecisionRecord>;
    decideRouting(request: RoutingDecisionRequest, dependencies?: DecisionProviderDependencies): Promise<DecisionRecord>;
    private evaluatePermissionTier0;
    private evaluateRoutingTier0;
    private evaluateTier1;
    private maybeInvestigateTier2;
    private resolve;
    private recordIntermediateDecision;
    private parkAwaitingHuman;
    private toolRule;
    private tier1Context;
    private tier1Rules;
    private tier1Request;
    private requiredTier1Prompt;
    private shouldFlagTier2;
}
export declare const decisionVerdictSchema: StructuredModelSchema<DecisionVerdict>;
