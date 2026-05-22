import type { JsonObject, NodeId } from "../domain.js";

export type AgentSessionId = string & { readonly __agentSessionId: unique symbol };
export type TransportCorrelationId = string & {
  readonly __transportCorrelationId: unique symbol;
};

export interface AgentSessionRequest {
  readonly nodeId: NodeId;
  readonly prompt: string;
  readonly cwd: string;
  readonly metadata?: JsonObject;
}

export interface AgentSession {
  readonly id: AgentSessionId;
  readonly nodeId: NodeId;
}

export interface AgentTurnEndedEvent {
  readonly type: "turn_ended";
  readonly sessionId: AgentSessionId;
  readonly result: string;
}

export interface AgentNeedsPermissionEvent {
  readonly type: "needs_permission";
  readonly sessionId: AgentSessionId;
  readonly correlationId: TransportCorrelationId;
  readonly toolName: string;
  readonly arguments: JsonObject;
}

export interface AgentNeedsInputEvent {
  readonly type: "needs_input";
  readonly sessionId: AgentSessionId;
  readonly correlationId: TransportCorrelationId;
  readonly prompt: string;
  readonly options?: readonly string[];
}

export interface AgentLogEvent {
  readonly type: "log";
  readonly sessionId: AgentSessionId;
  readonly message: string;
}

export interface AgentExitedEvent {
  readonly type: "exited";
  readonly sessionId: AgentSessionId;
  readonly exitCode: number | null;
}

export interface AgentStalledEvent {
  readonly type: "stalled";
  readonly sessionId: AgentSessionId;
  readonly elapsedMs: number;
  readonly reason: string;
}

export type AgentEvent =
  | AgentTurnEndedEvent
  | AgentNeedsPermissionEvent
  | AgentNeedsInputEvent
  | AgentLogEvent
  | AgentExitedEvent
  | AgentStalledEvent;

export type AgentCommand =
  | {
      readonly type: "respond";
      readonly correlationId: TransportCorrelationId;
      readonly response: string;
    }
  | {
      readonly type: "approve";
      readonly correlationId: TransportCorrelationId;
      readonly reason?: string;
    }
  | {
      readonly type: "deny";
      readonly correlationId: TransportCorrelationId;
      readonly reason: string;
    }
  | {
      readonly type: "choose_option";
      readonly correlationId: TransportCorrelationId;
      readonly option: string;
    }
  | { readonly type: "interrupt"; readonly reason: string }
  | { readonly type: "resume" };

export interface AgentEventReadOptions {
  readonly stallAfterMs?: number;
}

/**
 * Drives one disposable top-level agent session for one Daimyo node.
 *
 * Confirmed architecture decision from DGOS-A-0005: the Supervisor spawns
 * each leaf or inner node as its own top-level session. Recursion lives in
 * deterministic Supervisor code, so this port intentionally does not model
 * nested SDK sub-agent permission forwarding.
 */
export interface AgentTransport {
  /** Spawn a new top-level session for a single node. */
  spawnSession(request: AgentSessionRequest): Promise<AgentSession>;

  /** Read the next structured event, including transport-derived stalled signals. */
  nextEvent(
    sessionId: AgentSessionId,
    options?: AgentEventReadOptions,
  ): Promise<AgentEvent>;

  /** Send a command that answers, controls, interrupts, or resumes the session. */
  sendCommand(sessionId: AgentSessionId, command: AgentCommand): Promise<void>;
}

export function asAgentSessionId(value: string): AgentSessionId {
  if (value.length === 0) throw new Error("AgentSessionId cannot be empty");
  return value as AgentSessionId;
}

export function asTransportCorrelationId(value: string): TransportCorrelationId {
  if (value.length === 0) throw new Error("TransportCorrelationId cannot be empty");
  return value as TransportCorrelationId;
}
