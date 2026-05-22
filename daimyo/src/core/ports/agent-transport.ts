import type { ExecutionEvidence, JsonObject, NodeId } from "../domain.js";

export type AgentSessionId = string & { readonly __agentSessionId: unique symbol };
export type TransportCorrelationId = string & {
  readonly __transportCorrelationId: unique symbol;
};

export type AgentPendingEventType = "needs_permission" | "needs_input" | "stalled";
export type AgentTerminalReason =
  | "completed"
  | "errored"
  | "interrupted"
  | "interrupt_timeout"
  | "closed";

export interface AgentSessionRequest {
  readonly nodeId: NodeId;
  readonly prompt: string;
  readonly cwd: string;
  /**
   * Resume an existing top-level SDK session by its persisted SDK session id.
   * The Supervisor still owns recursion; this never resumes a nested SDK sub-agent.
   */
  readonly resumeFromSessionId?: AgentSessionId;
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
  readonly stopReason: string | null;
  readonly costUsd?: number;
}

export interface AgentNeedsPermissionEvent {
  readonly type: "needs_permission";
  readonly sessionId: AgentSessionId;
  readonly correlationId: TransportCorrelationId;
  readonly toolName: string;
  readonly arguments: JsonObject;
  readonly prompt?: string;
  readonly origin?: JsonObject;
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
  readonly source: "assistant" | "tool" | "system";
}

export interface AgentExitedEvent {
  readonly type: "exited";
  readonly sessionId: AgentSessionId;
  readonly exitCode: number | null;
  readonly reason: AgentTerminalReason;
  readonly message?: string;
}

export interface AgentStalledEvent {
  readonly type: "stalled";
  readonly sessionId: AgentSessionId;
  readonly correlationId: TransportCorrelationId;
  readonly elapsedMs: number;
  readonly lastProgressAt: string;
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
  | {
      readonly type: "interrupt";
      readonly correlationId: TransportCorrelationId;
      readonly reason: string;
    }
  | {
      readonly type: "resume";
      readonly correlationId: TransportCorrelationId;
    };

export interface AgentEventReadOptions {
  readonly stallAfterMs?: number;
}

export interface AgentPendingCorrelation {
  readonly correlationId: TransportCorrelationId;
  readonly eventType: AgentPendingEventType;
  readonly acceptedCommands: readonly AgentCommand["type"][];
}

export interface AgentInterruptResult {
  readonly workProduct?: ExecutionEvidence;
}

export class AgentCommandRejectedError extends Error {
  readonly correlationId: TransportCorrelationId;
  readonly commandType: AgentCommand["type"];

  constructor(message: string, correlationId: TransportCorrelationId, commandType: AgentCommand["type"]) {
    super(message);
    this.name = "AgentCommandRejectedError";
    this.correlationId = correlationId;
    this.commandType = commandType;
  }
}

export class AgentSessionResumeRejectedError extends Error {
  readonly sessionId: AgentSessionId;

  constructor(message: string, sessionId: AgentSessionId) {
    super(message);
    this.name = "AgentSessionResumeRejectedError";
    this.sessionId = sessionId;
  }
}

/**
 * Drives one disposable top-level agent session for one Daimyo node.
 *
 * Confirmed architecture decision from DGOS-A-0005 and DGOS-T-0001: the
 * Supervisor spawns each leaf or inner node as its own top-level SDK session.
 * Recursion lives in deterministic Supervisor code, so this port intentionally
 * ships no nested-SDK-sub-agent or PTY permission fallback in v1.
 *
 * Ordering and async guarantees:
 * - Events are delivered in observed order per session. No ordering is promised
 *   across different sessions.
 * - At most one pending correlated pause may be outstanding per session. A
 *   transport must not emit a second `needs_permission`, `needs_input`, or
 *   `stalled` event until the first is answered or the session exits.
 * - `log` means observed progress. It is never reclassified as `stalled`.
 * - `stalled` means no `log`, `needs_permission`, `needs_input`, `turn_ended`,
 *   or `exited` event has been observed for `stallAfterMs` since the last
 *   progress boundary. A transport emits one `stalled` per quiet period and
 *   resets the quiet period only after progress resumes or a correlated
 *   `resume` command is accepted.
 *
 * Correlation model:
 * - `needs_permission` accepts only `approve` or `deny`.
 * - `needs_input` accepts `respond`; when options are present it also accepts
 *   `choose_option`.
 * - `stalled` accepts `interrupt` or `resume`.
 * - Commands whose `correlationId` does not match a current pending event, or
 *   whose type is not valid for that event, must reject with
 *   `AgentCommandRejectedError` or an adapter-specific subclass.
 *
 * Interrupt semantics:
 * - A transport acknowledges `interrupt` by issuing the concrete cancellation
 *   primitive immediately.
 * - If the agent does not emit `turn_ended` or `exited` within the adapter's
 *   configured interrupt timeout, the adapter escalates to forced close/abort
 *   and emits `exited` with reason `interrupt_timeout`.
 */
export interface AgentTransport {
  /** Spawn a new top-level session, or resume a top-level session id. */
  spawnSession(request: AgentSessionRequest): Promise<AgentSession>;

  /** Read the next event in per-session order. */
  readEvent(
    sessionId: AgentSessionId,
    options?: AgentEventReadOptions,
  ): Promise<AgentEvent>;

  /** Send a correlated command that answers the current pending event. */
  sendCommand(sessionId: AgentSessionId, command: AgentCommand): Promise<void>;

  /** Interrupt an in-flight worker outside a pending pause, such as checkpoint superseding. */
  interruptSession(sessionId: AgentSessionId, reason: string): Promise<AgentInterruptResult>;

  /** Dispose a worker session after its node reaches a terminal loop state. */
  disposeSession(sessionId: AgentSessionId): Promise<void>;
}

export function asAgentSessionId(value: string): AgentSessionId {
  if (value.length === 0) throw new Error("AgentSessionId cannot be empty");
  return value as AgentSessionId;
}

export function asTransportCorrelationId(value: string): TransportCorrelationId {
  if (value.length === 0) throw new Error("TransportCorrelationId cannot be empty");
  return value as TransportCorrelationId;
}
