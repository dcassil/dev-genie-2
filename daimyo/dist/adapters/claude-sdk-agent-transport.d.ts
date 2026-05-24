import type { Options, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AgentCommand, AgentEvent, AgentEventReadOptions, AgentInterruptResult, AgentSession, AgentSessionId, AgentSessionRequest, AgentTransport } from "../core/ports/agent-transport.js";
export interface ClaudeSdkLayer {
    query(params: {
        readonly prompt: string;
        readonly options?: Options;
    }): ClaudeSdkQuery;
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
export declare class ClaudeSdkAgentTransport implements AgentTransport {
    private readonly sdk;
    private readonly sdkOptions;
    private readonly defaultStallAfterMs;
    private readonly interruptTimeoutMs;
    private readonly permissionRequestMode;
    private readonly sessions;
    constructor(options?: ClaudeSdkAgentTransportOptions);
    spawnSession(request: AgentSessionRequest): Promise<AgentSession>;
    readEvent(sessionId: AgentSessionId, options?: AgentEventReadOptions): Promise<AgentEvent>;
    sendCommand(sessionId: AgentSessionId, command: AgentCommand): Promise<void>;
    interruptSession(sessionId: AgentSessionId, reason: string): Promise<AgentInterruptResult>;
    disposeSession(sessionId: AgentSessionId): Promise<void>;
    private buildOptions;
    private makeCanUseTool;
    private withPreToolUseHook;
    private requestPreToolUsePermission;
    private makeOnElicitation;
    private requestPermission;
    private requestInput;
    private resolvePermission;
    private resolveInput;
    private resolveStalled;
    private pumpMessages;
    private handleSdkMessage;
    private enqueue;
    private enqueueExit;
    private markProgress;
    private armStalledTimer;
    private clearStalledTimer;
    private clearInterruptTimer;
    private nextCorrelation;
    private requireSession;
    private requireQuery;
}
