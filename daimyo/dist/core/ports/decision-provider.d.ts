import type { DecisionRecord, PermissionDecisionRequest, RoutingDecisionRequest } from "../domain.js";
import type { AgentTransport } from "./agent-transport.js";
export interface DecisionProviderDependencies {
    /**
     * The only allowed cross-port edge in the Daimyo core.
     *
     * DGOS-A-0005 permits DecisionProvider -> AgentTransport solely for
     * Tier-2 read-only investigation. No other port may depend on another port.
     */
    readonly agentTransport?: AgentTransport;
    readonly cwd?: string;
}
/**
 * Produces durable decisions for permission gating and decision routing.
 *
 * Implementations own their Tier 0/1/2/3 strategy and return the minimal
 * DecisionVerdict inside a DecisionRecord. Mapping to ADR-1 Role result shapes
 * is an adapter responsibility, not a core concern.
 */
export interface DecisionProvider {
    /** Resolve an SDK PreToolUse/canUseTool-style permission gate. */
    decidePermission(request: PermissionDecisionRequest, dependencies?: DecisionProviderDependencies): Promise<DecisionRecord>;
    /** Resolve an ADR-3 needs-decision routing bubble. */
    decideRouting(request: RoutingDecisionRequest, dependencies?: DecisionProviderDependencies): Promise<DecisionRecord>;
}
