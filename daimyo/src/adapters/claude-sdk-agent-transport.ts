import { randomUUID } from "node:crypto";
import { query as claudeQuery } from "@anthropic-ai/claude-agent-sdk";
import type {
  CanUseTool,
  ElicitationRequest,
  ElicitationResult,
  HookCallbackMatcher,
  HookEvent,
  HookJSONOutput,
  Options,
  PermissionResult,
  PreToolUseHookInput,
  SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { JsonObject, JsonValue } from "../core/domain.js";
import type {
  AgentCommand,
  AgentEvent,
  AgentEventReadOptions,
  AgentTerminalReason,
  AgentSession,
  AgentSessionId,
  AgentSessionRequest,
  AgentTransport,
  TransportCorrelationId,
} from "../core/ports/agent-transport.js";
import {
  AgentCommandRejectedError,
  asAgentSessionId,
  asTransportCorrelationId,
} from "../core/ports/agent-transport.js";

export interface ClaudeSdkLayer {
  query(params: { readonly prompt: string; readonly options?: Options }): ClaudeSdkQuery;
}

export interface ClaudeSdkQuery extends AsyncIterable<SDKMessage> {
  interrupt(): Promise<void>;
  close(): void;
}

export interface ClaudeSdkAgentTransportOptions {
  readonly sdk?: ClaudeSdkLayer;
  readonly sdkOptions?: Options;
  readonly stallAfterMs?: number;
  readonly interruptTimeoutMs?: number;
  readonly permissionRequestMode?: "canUseTool" | "preToolUse";
}

type Timer = ReturnType<typeof setTimeout>;
type AssistantContent = Extract<SDKMessage, { readonly type: "assistant" }>["message"]["content"];
type StreamEvent = Extract<SDKMessage, { readonly type: "stream_event" }>["event"];

type PendingResolution =
  | {
      readonly eventType: "needs_permission";
      readonly correlationId: TransportCorrelationId;
      readonly acceptedCommands: readonly AgentCommand["type"][];
      readonly resolve: (result: PermissionResult) => void;
    }
  | {
      readonly eventType: "needs_input";
      readonly correlationId: TransportCorrelationId;
      readonly acceptedCommands: readonly AgentCommand["type"][];
      readonly resolve: (result: ElicitationResult) => void;
    }
  | {
      readonly eventType: "stalled";
      readonly correlationId: TransportCorrelationId;
      readonly acceptedCommands: readonly AgentCommand["type"][];
    };

interface SessionState {
  readonly session: AgentSession;
  readonly abortController: AbortController;
  query: ClaudeSdkQuery | undefined;
  readonly events: AgentEvent[];
  readonly waiters: ((event: AgentEvent) => void)[];
  pending: PendingResolution | undefined;
  stalledTimer: Timer | undefined;
  interruptTimer: Timer | undefined;
  stallAfterMs: number;
  lastProgressAtMs: number;
  terminal: boolean;
  interrupting: boolean;
  correlationSequence: number;
}

const DEFAULT_STALL_AFTER_MS = 120_000;
const DEFAULT_INTERRUPT_TIMEOUT_MS = 10_000;

export class ClaudeSdkAgentTransport implements AgentTransport {
  private readonly sdk: ClaudeSdkLayer;
  private readonly sdkOptions: Options;
  private readonly defaultStallAfterMs: number;
  private readonly interruptTimeoutMs: number;
  private readonly permissionRequestMode: "canUseTool" | "preToolUse";
  private readonly sessions = new Map<string, SessionState>();

  constructor(options: ClaudeSdkAgentTransportOptions = {}) {
    this.sdk = options.sdk ?? { query: claudeQuery };
    this.sdkOptions = options.sdkOptions ?? {};
    this.defaultStallAfterMs = options.stallAfterMs ?? DEFAULT_STALL_AFTER_MS;
    this.interruptTimeoutMs = options.interruptTimeoutMs ?? DEFAULT_INTERRUPT_TIMEOUT_MS;
    this.permissionRequestMode = options.permissionRequestMode ?? "canUseTool";
  }

  async spawnSession(request: AgentSessionRequest): Promise<AgentSession> {
    const sessionId = request.resumeFromSessionId ?? asAgentSessionId(randomUUID());
    const session: AgentSession = { id: sessionId, nodeId: request.nodeId };
    const abortController = new AbortController();
    const state: SessionState = {
      session,
      abortController,
      query: undefined,
      events: [],
      waiters: [],
      stallAfterMs: this.defaultStallAfterMs,
      lastProgressAtMs: Date.now(),
      terminal: false,
      interrupting: false,
      correlationSequence: 0,
      pending: undefined,
      stalledTimer: undefined,
      interruptTimer: undefined,
    };
    this.sessions.set(sessionId, state);
    const options = this.buildOptions(request, sessionId, abortController);
    state.query = this.sdk.query({ prompt: request.prompt, options });
    this.armStalledTimer(state);
    this.pumpMessages(state);
    return session;
  }

  async readEvent(
    sessionId: AgentSessionId,
    options?: AgentEventReadOptions,
  ): Promise<AgentEvent> {
    const state = this.requireSession(sessionId);
    if (options?.stallAfterMs !== undefined) {
      state.stallAfterMs = options.stallAfterMs;
      this.armStalledTimer(state);
    }
    const event = state.events.shift();
    if (event !== undefined) return event;
    return new Promise<AgentEvent>((resolve) => state.waiters.push(resolve));
  }

  async sendCommand(sessionId: AgentSessionId, command: AgentCommand): Promise<void> {
    const state = this.requireSession(sessionId);
    const pending = state.pending;
    if (pending === undefined) {
      throw new AgentCommandRejectedError(
        "No pending correlated event",
        command.correlationId,
        command.type,
      );
    }
    if (pending.correlationId !== command.correlationId) {
      throw new AgentCommandRejectedError(
        `Pending correlation is ${pending.correlationId}`,
        command.correlationId,
        command.type,
      );
    }
    if (!pending.acceptedCommands.includes(command.type)) {
      throw new AgentCommandRejectedError(
        `${command.type} cannot answer ${pending.eventType}`,
        command.correlationId,
        command.type,
      );
    }

    if (pending.eventType === "needs_permission") {
      this.resolvePermission(state, pending, command);
      return;
    }
    if (pending.eventType === "needs_input") {
      this.resolveInput(state, pending, command);
      return;
    }
    await this.resolveStalled(state, command);
  }

  async disposeSession(sessionId: AgentSessionId): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (state === undefined) return;
    this.clearStalledTimer(state);
    this.clearInterruptTimer(state);
    state.pending = undefined;
    state.terminal = true;
    state.query?.close();
    state.abortController.abort("Daimyo disposed worker session");
    this.sessions.delete(sessionId);
  }

  private buildOptions(
    request: AgentSessionRequest,
    sessionId: AgentSessionId,
    abortController: AbortController,
  ): Options {
    const base: Options = {
      ...this.sdkOptions,
      abortController,
      cwd: request.cwd,
      ...(request.resumeFromSessionId === undefined
        ? { sessionId }
        : { resume: request.resumeFromSessionId }),
      env: { ...process.env, ...this.sdkOptions.env },
      includePartialMessages: true,
      onElicitation: this.makeOnElicitation(sessionId),
    };
    if (this.permissionRequestMode === "canUseTool") {
      base.canUseTool = this.makeCanUseTool(sessionId);
    }
    if (this.permissionRequestMode === "preToolUse") {
      base.hooks = this.withPreToolUseHook(sessionId, this.sdkOptions.hooks);
    }
    return base;
  }

  private makeCanUseTool(sessionId: AgentSessionId): CanUseTool {
    return async (toolName, input, options) => {
      return await this.requestPermission(
        sessionId,
        toolName,
        input,
        options.signal,
        permissionPrompt(options.title, options.decisionReason),
        toolOrigin(options.toolUseID, options.agentID, options.blockedPath),
      );
    };
  }

  private withPreToolUseHook(
    sessionId: AgentSessionId,
    hooks: Options["hooks"],
  ): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
    const preToolUseHook: HookCallbackMatcher = {
      hooks: [
        async (input, toolUseId, options): Promise<HookJSONOutput> => {
          if (input.hook_event_name !== "PreToolUse") return { continue: true };
          const result = await this.requestPreToolUsePermission(
            sessionId,
            input,
            toolUseId,
            options.signal,
          );
          return result;
        },
      ],
    };
    return {
      ...hooks,
      PreToolUse: [preToolUseHook, ...(hooks?.PreToolUse ?? [])],
    };
  }

  private async requestPreToolUsePermission(
    sessionId: AgentSessionId,
    input: PreToolUseHookInput,
    toolUseId: string | undefined,
    signal: AbortSignal,
  ): Promise<HookJSONOutput> {
    const result = await this.requestPermission(
      sessionId,
      input.tool_name,
      recordFromUnknown(input.tool_input),
      signal,
      undefined,
      toolOrigin(toolUseId, input.agent_id, undefined),
    );
    const allowed = result.behavior === "allow";
    return {
      continue: allowed,
      ...(allowed ? {} : { reason: result.message }),
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: allowed ? "allow" : "deny",
        ...(allowed ? {} : { permissionDecisionReason: result.message }),
      },
    };
  }

  private makeOnElicitation(sessionId: AgentSessionId): NonNullable<Options["onElicitation"]> {
    return async (request, options) => {
      return await this.requestInput(sessionId, request, options.signal);
    };
  }

  private async requestPermission(
    sessionId: AgentSessionId,
    toolName: string,
    input: Record<string, unknown>,
    signal: AbortSignal,
    prompt: string | undefined,
    origin: JsonObject,
  ): Promise<PermissionResult> {
    const state = this.requireSession(sessionId);
    if (state.pending !== undefined) {
      return { behavior: "deny", message: "Another transport event is pending", interrupt: false };
    }
    const correlationId = this.nextCorrelation(state, "permission");
    const event: AgentEvent = {
      type: "needs_permission",
      sessionId,
      correlationId,
      toolName,
      arguments: jsonObjectFromRecord(input),
      ...(prompt === undefined ? {} : { prompt }),
      origin,
    };
    return await new Promise<PermissionResult>((resolve) => {
      state.pending = {
        eventType: "needs_permission",
        correlationId,
        acceptedCommands: ["approve", "deny"],
        resolve,
      };
      signal.addEventListener(
        "abort",
        () => {
          if (state.pending?.correlationId === correlationId) {
            state.pending = undefined;
            resolve({ behavior: "deny", message: "Permission request aborted", interrupt: true });
          }
        },
        { once: true },
      );
      this.enqueue(state, event);
    });
  }

  private async requestInput(
    sessionId: AgentSessionId,
    request: ElicitationRequest,
    signal: AbortSignal,
  ): Promise<ElicitationResult> {
    const state = this.requireSession(sessionId);
    if (state.pending !== undefined) {
      return { action: "decline" };
    }
    const correlationId = this.nextCorrelation(state, "input");
    const options = inputOptions(request.requestedSchema);
    const event: AgentEvent = {
      type: "needs_input",
      sessionId,
      correlationId,
      prompt: request.title ?? request.message,
      ...(options.length === 0 ? {} : { options }),
    };
    return await new Promise<ElicitationResult>((resolve) => {
      state.pending = {
        eventType: "needs_input",
        correlationId,
        acceptedCommands: options.length === 0 ? ["respond"] : ["respond", "choose_option"],
        resolve,
      };
      signal.addEventListener(
        "abort",
        () => {
          if (state.pending?.correlationId === correlationId) {
            state.pending = undefined;
            resolve({ action: "cancel" });
          }
        },
        { once: true },
      );
      this.enqueue(state, event);
    });
  }

  private resolvePermission(
    state: SessionState,
    pending: Extract<PendingResolution, { readonly eventType: "needs_permission" }>,
    command: AgentCommand,
  ): void {
    state.pending = undefined;
    this.markProgress(state);
    if (command.type === "approve") {
      pending.resolve({ behavior: "allow" });
      return;
    }
    if (command.type === "deny") {
      pending.resolve({ behavior: "deny", message: command.reason });
    }
  }

  private resolveInput(
    state: SessionState,
    pending: Extract<PendingResolution, { readonly eventType: "needs_input" }>,
    command: AgentCommand,
  ): void {
    state.pending = undefined;
    this.markProgress(state);
    if (command.type === "respond") {
      pending.resolve({ action: "accept", content: { response: command.response } });
      return;
    }
    if (command.type === "choose_option") {
      pending.resolve({ action: "accept", content: { choice: command.option } });
    }
  }

  private async resolveStalled(state: SessionState, command: AgentCommand): Promise<void> {
    state.pending = undefined;
    if (command.type === "resume") {
      this.markProgress(state);
      return;
    }
    if (command.type !== "interrupt") return;
    this.clearStalledTimer(state);
    state.interrupting = true;
    const query = this.requireQuery(state);
    await query.interrupt();
    state.abortController.abort(command.reason);
    this.clearInterruptTimer(state);
    state.interruptTimer = setTimeout(() => {
      if (state.terminal) return;
      query.close();
      this.enqueueExit(state, "interrupt_timeout", "Agent ignored interrupt before timeout");
    }, this.interruptTimeoutMs);
    unrefTimer(state.interruptTimer);
  }

  private pumpMessages(state: SessionState): void {
    void (async () => {
      try {
        for await (const message of this.requireQuery(state)) {
          this.handleSdkMessage(state, message);
        }
        if (state.terminal) return;
        this.enqueueExit(
          state,
          state.interrupting ? "interrupted" : "completed",
          "SDK session stream ended",
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!state.terminal) this.enqueueExit(state, "errored", message);
      }
    })();
  }

  private handleSdkMessage(state: SessionState, message: SDKMessage): void {
    if (message.type === "result") {
      this.enqueue(state, {
        type: "turn_ended",
        sessionId: state.session.id,
        result: message.subtype === "success" ? message.result : message.subtype,
        stopReason: message.stop_reason,
        costUsd: message.total_cost_usd,
      });
      return;
    }

    const logMessage = sdkMessageToLog(message);
    if (logMessage !== null) {
      this.enqueue(state, {
        type: "log",
        sessionId: state.session.id,
        message: logMessage.message,
        source: logMessage.source,
      });
    }
  }

  private enqueue(state: SessionState, event: AgentEvent): void {
    if (event.type === "log" && state.pending?.eventType === "stalled") {
      state.pending = undefined;
    }
    if (event.type === "turn_ended") {
      state.pending = undefined;
      this.clearInterruptTimer(state);
    }
    if (event.type === "exited") {
      state.pending = undefined;
      state.terminal = true;
      this.clearInterruptTimer(state);
    }
    if (event.type !== "stalled") this.markProgress(state);
    const waiter = state.waiters.shift();
    if (waiter !== undefined) {
      waiter(event);
      return;
    }
    state.events.push(event);
  }

  private enqueueExit(
    state: SessionState,
    reason: AgentTerminalReason,
    message: string,
  ): void {
    state.pending = undefined;
    this.clearStalledTimer(state);
    this.enqueue(state, {
      type: "exited",
      sessionId: state.session.id,
      exitCode: null,
      reason,
      message,
    });
  }

  private markProgress(state: SessionState): void {
    state.lastProgressAtMs = Date.now();
    if (!state.terminal && state.pending === undefined) this.armStalledTimer(state);
  }

  private armStalledTimer(state: SessionState): void {
    this.clearStalledTimer(state);
    if (state.terminal || state.pending !== undefined) return;
    state.stalledTimer = setTimeout(() => {
      if (state.terminal || state.pending !== undefined) return;
      const correlationId = this.nextCorrelation(state, "stalled");
      state.pending = {
        eventType: "stalled",
        correlationId,
        acceptedCommands: ["interrupt", "resume"],
      };
      this.enqueue(state, {
        type: "stalled",
        sessionId: state.session.id,
        correlationId,
        elapsedMs: Date.now() - state.lastProgressAtMs,
        lastProgressAt: new Date(state.lastProgressAtMs).toISOString(),
        reason: `No progress observed for ${state.stallAfterMs}ms`,
      });
    }, state.stallAfterMs);
    unrefTimer(state.stalledTimer);
  }

  private clearStalledTimer(state: SessionState): void {
    if (state.stalledTimer !== undefined) clearTimeout(state.stalledTimer);
    state.stalledTimer = undefined;
  }

  private clearInterruptTimer(state: SessionState): void {
    if (state.interruptTimer !== undefined) clearTimeout(state.interruptTimer);
    state.interruptTimer = undefined;
  }

  private nextCorrelation(state: SessionState, prefix: string): TransportCorrelationId {
    state.correlationSequence += 1;
    return asTransportCorrelationId(`${state.session.id}:${prefix}:${state.correlationSequence}`);
  }

  private requireSession(sessionId: AgentSessionId): SessionState {
    const state = this.sessions.get(sessionId);
    if (state === undefined) throw new Error(`Unknown agent session: ${sessionId}`);
    return state;
  }

  private requireQuery(state: SessionState): ClaudeSdkQuery {
    if (state.query === undefined) {
      throw new Error(`Agent session is not initialized: ${state.session.id}`);
    }
    return state.query;
  }
}

function sdkMessageToLog(
  message: SDKMessage,
): { readonly message: string; readonly source: "assistant" | "tool" | "system" } | null {
  if (message.type === "assistant") {
    const text = assistantText(message.message.content);
    return text.length === 0 ? null : { message: text, source: "assistant" };
  }
  if (message.type === "stream_event") {
    const text = streamText(message.event);
    return text.length === 0 ? null : { message: text, source: "assistant" };
  }
  if (message.type === "tool_progress") {
    return {
      message: `${message.tool_name} running for ${message.elapsed_time_seconds}s`,
      source: "tool",
    };
  }
  if (message.type !== "system") return null;
  if (message.subtype === "local_command_output") {
    return { message: message.content, source: "tool" };
  }
  if (message.subtype === "hook_progress") {
    return { message: message.output, source: "tool" };
  }
  if (message.subtype === "task_progress") {
    return { message: message.summary ?? message.description, source: "tool" };
  }
  if (message.subtype === "task_started") {
    return { message: message.description, source: "tool" };
  }
  if (message.subtype === "task_updated") {
    return { message: `task ${message.task_id} updated`, source: "tool" };
  }
  if (message.subtype === "permission_denied") {
    return { message: message.message, source: "system" };
  }
  if (message.subtype === "notification") {
    return { message: message.key, source: "system" };
  }
  if (message.subtype === "status") {
    return message.status === null ? null : { message: message.status, source: "system" };
  }
  if (message.subtype === "api_retry") {
    return { message: `API retry ${message.attempt}/${message.max_retries}`, source: "system" };
  }
  return null;
}

function assistantText(content: AssistantContent): string {
  if (typeof content === "string") return content;
  const parts: string[] = [];
  for (const block of content) {
    if (block.type === "text") parts.push(block.text);
    if (block.type === "tool_use") parts.push(`tool_use:${block.name}`);
  }
  return parts.join("\n");
}

function streamText(event: StreamEvent): string {
  if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
    return event.delta.text;
  }
  return "";
}

function jsonObjectFromRecord(record: Record<string, unknown>): JsonObject {
  const result: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(record)) {
    result[key] = jsonValueFromUnknown(value);
  }
  return result;
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  if (isPlainRecord(value)) return value;
  return { value };
}

function jsonValueFromUnknown(value: unknown): JsonValue {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) return value.map((entry) => jsonValueFromUnknown(entry));
  if (isPlainRecord(value)) return jsonObjectFromRecord(value);
  return String(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function permissionPrompt(title: string | undefined, decisionReason: string | undefined): string | undefined {
  return title ?? decisionReason;
}

function toolOrigin(
  toolUseId: string | undefined,
  agentId: string | undefined,
  blockedPath: string | undefined,
): JsonObject {
  return jsonObjectFromRecord({
    ...(toolUseId === undefined ? {} : { toolUseId }),
    ...(agentId === undefined ? {} : { agentId }),
    ...(blockedPath === undefined ? {} : { blockedPath }),
  });
}

function inputOptions(schema: Record<string, unknown> | undefined): readonly string[] {
  if (schema === undefined) return [];
  const properties = schema.properties;
  if (!isPlainRecord(properties)) return [];
  for (const property of Object.values(properties)) {
    if (!isPlainRecord(property)) continue;
    const enumValues = property.enum;
    if (Array.isArray(enumValues) && enumValues.every((value) => typeof value === "string")) {
      return enumValues;
    }
  }
  return [];
}

function unrefTimer(timer: Timer): void {
  if (typeof timer === "object" && timer !== null && "unref" in timer) {
    const candidate = timer.unref;
    if (typeof candidate === "function") candidate.call(timer);
  }
}
