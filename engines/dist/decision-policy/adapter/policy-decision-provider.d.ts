import { type DecisionProvider, type DecisionProviderDependencies, type DecisionRecord, type ExecutionStore, type HumanDecisionNotifier, type PermissionDecisionRequest, type RoutingDecisionRequest, type TieredDecisionProvider } from "daimyo";
import type { PolicyConfig } from "protocol";
import type { DecisionPolicyEngine } from "../engine.js";
export interface PolicyDecisionProviderOptions {
    readonly engine: DecisionPolicyEngine;
    readonly config: PolicyConfig;
    readonly inner: Pick<TieredDecisionProvider, "decidePermission" | "decideRouting">;
    readonly executionStore: ExecutionStore;
    readonly clock?: () => string;
    readonly notifier?: HumanDecisionNotifier;
}
export declare class PolicyDecisionProvider implements DecisionProvider {
    private readonly engine;
    private readonly config;
    private readonly inner;
    private readonly executionStore;
    private readonly clock;
    private readonly notifier;
    constructor(options: PolicyDecisionProviderOptions);
    decidePermission(request: PermissionDecisionRequest, dependencies?: DecisionProviderDependencies): Promise<DecisionRecord>;
    decideRouting(request: RoutingDecisionRequest, dependencies?: DecisionProviderDependencies): Promise<DecisionRecord>;
    private resolve;
    private parkAwaitingHuman;
}
