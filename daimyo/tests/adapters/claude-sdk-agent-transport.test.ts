import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Options, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { asNodeId } from "../../src/core/index.js";
import {
  AgentCommandRejectedError,
  asTransportCorrelationId,
} from "../../src/core/ports/agent-transport.js";
import {
  ClaudeSdkAgentTransport,
  type ClaudeSdkLayer,
  type ClaudeSdkQuery,
} from "../../src/adapters/index.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("ClaudeSdkAgentTransport", () => {
  it("TC-001 keeps log and stalled as separate signals", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-22T12:00:00.000Z"));
    const sdk = new CapturingSdk();
    const transport = new ClaudeSdkAgentTransport({ sdk, stallAfterMs: 100 });
    const session = await transport.spawnSession({
      nodeId: asNodeId("node-log-stalled"),
      prompt: "work",
      cwd: process.cwd(),
    });

    sdk.queryInstance.push(toolProgress("Bash", 1));
    await expect(transport.readEvent(session.id)).resolves.toMatchObject({
      type: "log",
      source: "tool",
    });

    const stalled = transport.readEvent(session.id);
    await vi.advanceTimersByTimeAsync(100);
    const stalledEvent = await stalled;
    expect(stalledEvent).toMatchObject({
      type: "stalled",
      elapsedMs: 100,
      reason: "No progress observed for 100ms",
    });

    sdk.queryInstance.push(toolProgress("Read", 2));
    await expect(transport.readEvent(session.id)).resolves.toMatchObject({
      type: "log",
      message: "Read running for 2s",
    });
    sdk.queryInstance.close();
  });

  it("TC-002 rejects mismatched correlations and resolves the matching pending permission", async () => {
    const sdk = new CapturingSdk();
    const transport = new ClaudeSdkAgentTransport({ sdk });
    const session = await transport.spawnSession({
      nodeId: asNodeId("node-correlation"),
      prompt: "work",
      cwd: process.cwd(),
    });
    const canUseTool = requireValue(sdk.params?.options?.canUseTool, "canUseTool");
    const permission = canUseTool(
      "Bash",
      { command: "pwd" },
      { signal: new AbortController().signal, toolUseID: "tool-1" },
    );
    const event = await transport.readEvent(session.id);
    expect(event).toMatchObject({
      type: "needs_permission",
      toolName: "Bash",
      arguments: { command: "pwd" },
    });
    if (event.type !== "needs_permission") throw new Error("Expected needs_permission");

    await expect(
      transport.sendCommand(session.id, {
        type: "approve",
        correlationId: asTransportCorrelationId("wrong-correlation"),
      }),
    ).rejects.toBeInstanceOf(AgentCommandRejectedError);

    await transport.sendCommand(session.id, {
      type: "approve",
      correlationId: event.correlationId,
      reason: "allowed by test",
    });
    await expect(permission).resolves.toMatchObject({ behavior: "allow" });
    sdk.queryInstance.close();
  });

  it("TC-003 interrupts a stalled session and escalates when the SDK ignores it", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-22T12:00:00.000Z"));
    const honoredSdk = new CapturingSdk({ finishOnInterrupt: true });
    const honoredTransport = new ClaudeSdkAgentTransport({
      sdk: honoredSdk,
      stallAfterMs: 50,
      interruptTimeoutMs: 100,
    });
    const honoredSession = await honoredTransport.spawnSession({
      nodeId: asNodeId("node-interrupt-honored"),
      prompt: "work",
      cwd: process.cwd(),
    });
    const honoredStalled = honoredTransport.readEvent(honoredSession.id);
    await vi.advanceTimersByTimeAsync(50);
    const honoredStalledEvent = await honoredStalled;
    if (honoredStalledEvent.type !== "stalled") throw new Error("Expected stalled");

    await honoredTransport.sendCommand(honoredSession.id, {
      type: "interrupt",
      correlationId: honoredStalledEvent.correlationId,
      reason: "unit test interrupt",
    });
    await expect(honoredTransport.readEvent(honoredSession.id)).resolves.toMatchObject({
      type: "exited",
      reason: "interrupted",
    });
    expect(honoredSdk.queryInstance.interruptCalls).toBe(1);

    const ignoredSdk = new CapturingSdk();
    const ignoredTransport = new ClaudeSdkAgentTransport({
      sdk: ignoredSdk,
      stallAfterMs: 50,
      interruptTimeoutMs: 100,
    });
    const ignoredSession = await ignoredTransport.spawnSession({
      nodeId: asNodeId("node-interrupt-ignored"),
      prompt: "work",
      cwd: process.cwd(),
    });
    const ignoredStalled = ignoredTransport.readEvent(ignoredSession.id);
    await vi.advanceTimersByTimeAsync(50);
    const ignoredStalledEvent = await ignoredStalled;
    if (ignoredStalledEvent.type !== "stalled") throw new Error("Expected stalled");

    await ignoredTransport.sendCommand(ignoredSession.id, {
      type: "interrupt",
      correlationId: ignoredStalledEvent.correlationId,
      reason: "unit test interrupt",
    });
    const exited = ignoredTransport.readEvent(ignoredSession.id);
    await vi.advanceTimersByTimeAsync(100);
    await expect(exited).resolves.toMatchObject({
      type: "exited",
      reason: "interrupt_timeout",
    });
    expect(ignoredSdk.queryInstance.interruptCalls).toBe(1);
    expect(ignoredSdk.queryInstance.closeCalls).toBe(1);
  });
});

class CapturingSdk implements ClaudeSdkLayer {
  readonly queryInstance: ScriptedQuery;
  params: { readonly prompt: string; readonly options?: Options } | undefined;

  constructor(options: { readonly finishOnInterrupt?: boolean } = {}) {
    this.queryInstance = new ScriptedQuery(options);
  }

  query(params: { readonly prompt: string; readonly options?: Options }): ClaudeSdkQuery {
    this.params = params;
    return this.queryInstance;
  }
}

class ScriptedQuery implements ClaudeSdkQuery, AsyncIterator<SDKMessage, void> {
  interruptCalls = 0;
  closeCalls = 0;
  private readonly finishOnInterrupt: boolean;
  private readonly messages: SDKMessage[] = [];
  private readonly waiters: ((result: IteratorResult<SDKMessage, void>) => void)[] = [];
  private finished = false;

  constructor(options: { readonly finishOnInterrupt?: boolean } = {}) {
    this.finishOnInterrupt = options.finishOnInterrupt ?? false;
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKMessage, void> {
    return this;
  }

  async next(): Promise<IteratorResult<SDKMessage, void>> {
    const message = this.messages.shift();
    if (message !== undefined) return { done: false, value: message };
    if (this.finished) return { done: true, value: undefined };
    return await new Promise<IteratorResult<SDKMessage, void>>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  async interrupt(): Promise<void> {
    this.interruptCalls += 1;
    if (this.finishOnInterrupt) this.finish();
  }

  close(): void {
    this.closeCalls += 1;
    this.finish();
  }

  push(message: SDKMessage): void {
    const waiter = this.waiters.shift();
    if (waiter !== undefined) {
      waiter({ done: false, value: message });
      return;
    }
    this.messages.push(message);
  }

  private finish(): void {
    this.finished = true;
    const waiters = this.waiters.splice(0);
    for (const waiter of waiters) waiter({ done: true, value: undefined });
  }
}

function toolProgress(toolName: string, elapsed: number): SDKMessage {
  return {
    type: "tool_progress",
    tool_use_id: randomUUID(),
    tool_name: toolName,
    parent_tool_use_id: null,
    elapsed_time_seconds: elapsed,
    uuid: randomUUID(),
    session_id: randomUUID(),
  };
}

function requireValue<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing ${label}`);
  return value;
}
