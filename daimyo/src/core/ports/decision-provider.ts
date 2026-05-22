import type { DecisionRecord, DecisionRequest } from "../domain.js";
import type { AgentTransport } from "./agent-transport.js";

export interface DecisionProviderDependencies {
  /**
   * The only allowed cross-port edge in the Daimyo core.
   *
   * DGOS-A-0005 permits DecisionProvider -> AgentTransport solely for future
   * Tier-2 read-only investigation. No other port may depend on another port.
   */
  readonly agentTransport?: AgentTransport;
}

/**
 * Produces durable decisions for permission gating and decision routing.
 *
 * Implementations own their Tier 0/1/2/3 strategy and return the minimal
 * DecisionVerdict inside a DecisionRecord. Mapping to ADR-1 Role result shapes
 * is an adapter responsibility, not a core concern.
 */
export interface DecisionProvider {
  /** Resolve a typed decision request into a record the Supervisor can persist. */
  decide(
    request: DecisionRequest,
    dependencies?: DecisionProviderDependencies,
  ): Promise<DecisionRecord>;
}
