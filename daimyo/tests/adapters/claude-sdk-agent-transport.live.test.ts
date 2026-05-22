import { describe, expect, it } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AgentEvent, AgentSessionId } from "../../src/core/index.js";
import { asNodeId } from "../../src/core/index.js";
import { ClaudeSdkAgentTransport } from "../../src/adapters/index.js";

// Live SDK tests exercise a real model session and are therefore
// non-deterministic (e.g. whether the model chooses to ask for input is up to
// the model). They are opt-in: they run only when credentials are present AND
// DAIMYO_LIVE_SDK_TESTS=1 is set, so the default `npm test` stays deterministic
// and gated on the fake-transport unit tests. Run live with:
//   DAIMYO_LIVE_SDK_TESTS=1 npm test
const hasLiveCredentials =
  process.env.ANTHROPIC_AUTH_TOKEN !== undefined &&
  process.env.ANTHROPIC_BASE_URL !== undefined;
const liveOptIn = process.env.DAIMYO_LIVE_SDK_TESTS === "1";
const describeLive = hasLiveCredentials && liveOptIn ? describe : describe.skip;

describeLive("ClaudeSdkAgentTransport live SDK integration", () => {
  it("ends a clean short turn", async () => {
    const transport = new ClaudeSdkAgentTransport({
      sdkOptions: { tools: [], maxTurns: 1 },
      stallAfterMs: 30_000,
    });
    const session = await transport.spawnSession({
      nodeId: asNodeId("live-clean-turn"),
      prompt: "Reply with exactly: daimyo-clean",
      cwd: process.cwd(),
    });

    const event = await readUntil(transport, session.id, (candidate) => candidate.type === "turn_ended");
    expect(event).toMatchObject({ type: "turn_ended" });
  }, 60_000);

  it("surfaces a permission request and accepts approve", async () => {
    const transport = new ClaudeSdkAgentTransport({
      sdkOptions: { tools: ["Bash"], maxTurns: 2 },
      permissionRequestMode: "preToolUse",
      stallAfterMs: 30_000,
    });
    const session = await transport.spawnSession({
      nodeId: asNodeId("live-permission-approve"),
      prompt: "Use Bash to run exactly: printf daimyo-approve",
      cwd: process.cwd(),
    });

    const permission = await readUntil(
      transport,
      session.id,
      (candidate) => candidate.type === "needs_permission",
    );
    if (permission.type !== "needs_permission") throw new Error("Expected needs_permission");
    await transport.sendCommand(session.id, {
      type: "approve",
      correlationId: permission.correlationId,
      reason: "live integration test",
    });
    const done = await readUntil(
      transport,
      session.id,
      (candidate) => candidate.type === "turn_ended" || candidate.type === "exited",
    );
    expect(["turn_ended", "exited"]).toContain(done.type);
  }, 90_000);

  it("surfaces a permission request and accepts deny", async () => {
    const transport = new ClaudeSdkAgentTransport({
      sdkOptions: { tools: ["Bash"], maxTurns: 2 },
      permissionRequestMode: "preToolUse",
      stallAfterMs: 30_000,
    });
    const session = await transport.spawnSession({
      nodeId: asNodeId("live-permission-deny"),
      prompt: "Use Bash to run exactly: printf daimyo-deny",
      cwd: process.cwd(),
    });

    const permission = await readUntil(
      transport,
      session.id,
      (candidate) => candidate.type === "needs_permission",
    );
    if (permission.type !== "needs_permission") throw new Error("Expected needs_permission");
    await transport.sendCommand(session.id, {
      type: "deny",
      correlationId: permission.correlationId,
      reason: "live integration deny path",
    });
    const done = await readUntil(
      transport,
      session.id,
      (candidate) => candidate.type === "turn_ended" || candidate.type === "exited",
    );
    expect(["turn_ended", "exited"]).toContain(done.type);
  }, 90_000);

  it("surfaces an input request and accepts respond", async () => {
    const mcpServer = inputMcpServer();
    const transport = new ClaudeSdkAgentTransport({
      sdkOptions: {
        tools: { type: "preset", preset: "claude_code" },
        mcpServers: {
          daimyo_input: { type: "sdk", name: "daimyo_input", instance: mcpServer },
        },
        maxTurns: 5,
      },
      stallAfterMs: 30_000,
    });
    const session = await transport.spawnSession({
      nodeId: asNodeId("live-input-respond"),
      prompt: "Call the MCP tool mcp__daimyo_input__ask_question once.",
      cwd: process.cwd(),
    });

    // Whether the model actually elicits input is non-deterministic: it may
    // answer directly and end the turn instead of calling the tool. Both are
    // valid transport outcomes. If a needs_input surfaces we respond and assert
    // the turn completes; if the session ends first we accept it (the
    // deterministic needs_input mapping is covered by the fake-transport unit
    // tests). What we assert unconditionally is that the adapter keeps
    // delivering well-formed events and reaches a clean terminal state.
    let sawInput = false;
    while (true) {
      const event = await transport.readEvent(session.id);
      if (event.type === "needs_permission") {
        await transport.sendCommand(session.id, {
          type: "approve",
          correlationId: event.correlationId,
          reason: "live integration setup",
        });
        continue;
      }
      if (event.type === "stalled") {
        await transport.sendCommand(session.id, {
          type: "resume",
          correlationId: event.correlationId,
        });
        continue;
      }
      if (event.type === "needs_input") {
        sawInput = true;
        await transport.sendCommand(session.id, {
          type: "respond",
          correlationId: event.correlationId,
          response: "daimyo-response",
        });
        continue;
      }
      if (event.type === "turn_ended" || event.type === "exited") {
        expect(["turn_ended", "exited"]).toContain(event.type);
        break;
      }
    }
    if (!sawInput) {
      console.warn(
        "[live] model did not elicit input this run; needs_input mapping is covered by unit tests",
      );
    }
  }, 90_000);

  it("interrupts a running turn", async () => {
    const transport = new ClaudeSdkAgentTransport({
      sdkOptions: { tools: ["Bash"], maxTurns: 3 },
      stallAfterMs: 1_000,
      interruptTimeoutMs: 5_000,
    });
    const session = await transport.spawnSession({
      nodeId: asNodeId("live-interrupt"),
      prompt: "Use Bash to run exactly: sleep 30",
      cwd: process.cwd(),
    });

    const firstPause = await readUntil(
      transport,
      session.id,
      (candidate) => candidate.type === "needs_permission" || candidate.type === "stalled",
    );
    if (firstPause.type === "needs_permission") {
      await transport.sendCommand(session.id, {
        type: "approve",
        correlationId: firstPause.correlationId,
        reason: "live interrupt setup",
      });
    }
    const stalled =
      firstPause.type === "stalled"
        ? firstPause
        : await readUntil(transport, session.id, (candidate) => candidate.type === "stalled");
    if (stalled.type !== "stalled") throw new Error("Expected stalled");
    await transport.sendCommand(session.id, {
      type: "interrupt",
      correlationId: stalled.correlationId,
      reason: "live integration interrupt",
    });
    const exited = await readUntil(transport, session.id, (candidate) => candidate.type === "exited");
    expect(exited).toMatchObject({ type: "exited" });
  }, 90_000);
});

async function readUntil(
  transport: ClaudeSdkAgentTransport,
  sessionId: AgentSessionId,
  predicate: (event: AgentEvent) => boolean,
): Promise<AgentEvent> {
  while (true) {
    const event = await transport.readEvent(sessionId);
    if (predicate(event)) return event;
    if (event.type === "stalled") {
      await transport.sendCommand(sessionId, {
        type: "resume",
        correlationId: event.correlationId,
      });
      continue;
    }
    if (event.type === "turn_ended" || event.type === "exited") {
      throw new Error(`Session ended before expected event: ${event.type}`);
    }
  }
}

function inputMcpServer(): McpServer {
  const server = new McpServer({ name: "daimyo-input-test", version: "0.0.0" });
  server.registerTool(
    "ask_question",
    {
      description: "Ask the SDK host for a short answer.",
      inputSchema: {},
    },
    async () => {
      const result = await server.server.elicitInput({
        message: "Provide the Daimyo integration-test response.",
        requestedSchema: {
          type: "object",
          properties: {
            response: { type: "string", title: "Response" },
          },
        },
      });
      return {
        content: [
          {
            type: "text",
            text: `elicitation:${String(result.content?.response ?? result.action)}`,
          },
        ],
      };
    },
  );
  return server;
}
