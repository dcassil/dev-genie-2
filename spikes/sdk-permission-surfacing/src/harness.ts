import {
  query,
  type AgentDefinition,
  type CanUseTool,
  type HookCallback,
  type HookInput,
  type Options,
  type PermissionResult,
  type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

type Scenario = "direct" | "subagent-1" | "subagent-2";
type Origin = "parent" | "sub-agent";

type EvidenceRecord = {
  timestamp: string;
  scenario: Scenario;
  runIndex: number;
  kind: "sdk_message" | "callback" | "harness";
  payload: unknown;
};

type RunSummary = {
  scenario: Scenario;
  runIndex: number;
  startedAt: string;
  finishedAt: string;
  exit: "completed" | "error" | "timeout";
  sessionIds: string[];
  counts: {
    sdkMessages: number;
    preToolUseParent: number;
    preToolUseSubagent: number;
    canUseToolParent: number;
    canUseToolSubagent: number;
  };
  callbackTools: string[];
  errorMessage?: string;
};

const sdkVersion = "0.3.148";
const runCount = 2;
const timeoutMs = 180_000;

const agents: Record<string, AgentDefinition> = {
  "spike-writer": {
    description:
      "Attempts one permission-gated write-like operation for the permission surfacing spike.",
    tools: ["Bash", "Write"],
    prompt: [
      "You are the leaf worker for an SDK permission-surfacing spike.",
      "Attempt exactly one permission-gated operation using Bash.",
      "Use this command shape, replacing RUN_ID with the value in the user prompt:",
      "printf 'subagent permission probe RUN_ID\\n' >> ./evidence/generated-by-agent.txt",
      "If permission is denied, stop and report the denial. Do not try another tool.",
    ].join("\n"),
    maxTurns: 2,
  },
  "spike-delegator": {
    description:
      "Spawns a built-in nested subagent to probe two-level permission surfacing.",
    tools: ["Agent"],
    prompt: [
      "You are the middle worker for an SDK permission-surfacing spike.",
      "Do not run Bash or write files yourself.",
      "Use the Agent tool exactly once to invoke subagent_type general-purpose.",
      "Tell the nested general-purpose agent to attempt exactly one Bash permission probe with the RUN_ID from the user prompt.",
      "If the Agent tool is unavailable or denied, report that exactly.",
    ].join("\n"),
    maxTurns: 3,
  },
};

function now(): string {
  return new Date().toISOString();
}

function originFromAgentId(agentId: string | undefined): Origin {
  return agentId === undefined ? "parent" : "sub-agent";
}

function stableStringify(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

async function appendJsonl(path: string, record: EvidenceRecord): Promise<void> {
  await writeFile(path, stableStringify(record), { flag: "a" });
}

function promptForScenario(scenario: Scenario, runId: string): string {
  if (scenario === "direct") {
    return [
      "This is a permission-surfacing control run.",
      "Do not answer in prose before using a tool.",
      "Use Bash exactly once with this command:",
      `printf 'direct permission probe ${runId}\\n' >> ./evidence/generated-by-parent.txt`,
      "If permission is denied, report that the direct parent Bash call was denied.",
    ].join("\n");
  }

  if (scenario === "subagent-1") {
    return [
      "This is a one-level sub-agent permission-surfacing run.",
      "Do not use Bash or write files in the parent session.",
      "Use the Agent tool exactly once with subagent_type spike-writer.",
      `The subagent prompt must include this RUN_ID: ${runId}`,
      "Ask the subagent to attempt the Bash permission probe and then report its result.",
    ].join("\n");
  }

  return [
    "This is a two-level nested sub-agent permission-surfacing run.",
    "Do not use Bash or write files in the parent session.",
    "Use the Agent tool exactly once with subagent_type spike-delegator.",
    `The delegator prompt must include this RUN_ID: ${runId}`,
    "The delegator must spawn spike-writer, and spike-writer must attempt the Bash permission probe.",
    "Report the nested result.",
  ].join("\n");
}

function makePreToolUseHook(
  scenario: Scenario,
  runIndex: number,
  callbacksPath: string,
  summary: RunSummary,
): HookCallback {
  return async (input: HookInput, toolUseID: string | undefined, options) => {
    if (input.hook_event_name === "PreToolUse") {
      const origin = originFromAgentId(input.agent_id);
      if (origin === "parent") {
        summary.counts.preToolUseParent += 1;
      } else {
        summary.counts.preToolUseSubagent += 1;
      }
      summary.callbackTools.push(`PreToolUse:${origin}:${input.tool_name}`);
    }

    await appendJsonl(callbacksPath, {
      timestamp: now(),
      scenario,
      runIndex,
      kind: "callback",
      payload: {
        callback: "PreToolUse",
        origin:
          input.hook_event_name === "PreToolUse"
            ? originFromAgentId(input.agent_id)
            : "parent",
        toolUseID,
        options: {
          signalAborted: options.signal.aborted,
        },
        input,
      },
    });

    return { continue: true };
  };
}

function makeCanUseTool(
  scenario: Scenario,
  runIndex: number,
  callbacksPath: string,
  summary: RunSummary,
): CanUseTool {
  return async (toolName, input, options): Promise<PermissionResult> => {
    const origin = originFromAgentId(options.agentID);
    if (origin === "parent") {
      summary.counts.canUseToolParent += 1;
    } else {
      summary.counts.canUseToolSubagent += 1;
    }
    summary.callbackTools.push(`canUseTool:${origin}:${toolName}`);

    await appendJsonl(callbacksPath, {
      timestamp: now(),
      scenario,
      runIndex,
      kind: "callback",
      payload: {
        callback: "canUseTool",
        origin,
        toolName,
        input,
        options: {
          agentID: options.agentID,
          blockedPath: options.blockedPath,
          decisionReason: options.decisionReason,
          description: options.description,
          displayName: options.displayName,
          signalAborted: options.signal.aborted,
          suggestions: options.suggestions,
          title: options.title,
          toolUseID: options.toolUseID,
        },
      },
    });

    if (toolName === "Agent") {
      return {
        behavior: "allow",
        toolUseID: options.toolUseID,
        decisionClassification: "user_temporary",
      };
    }

    return {
      behavior: "deny",
      message: "Denied by sdk-permission-surfacing harness after recording the permission payload.",
      toolUseID: options.toolUseID,
      decisionClassification: "user_reject",
    };
  };
}

function makeOptions(
  scenario: Scenario,
  runIndex: number,
  callbacksPath: string,
  summary: RunSummary,
  abortController: AbortController,
): Options {
  return {
    abortController,
    agents,
    allowedTools: ["Agent"],
    canUseTool: makeCanUseTool(scenario, runIndex, callbacksPath, summary),
    cwd: process.cwd(),
    env: process.env,
    forwardSubagentText: true,
    hooks: {
      PreToolUse: [
        {
          hooks: [makePreToolUseHook(scenario, runIndex, callbacksPath, summary)],
          timeout: 30,
        },
      ],
    },
    includeHookEvents: true,
    includePartialMessages: true,
    maxBudgetUsd: 1,
    maxTurns: scenario === "direct" ? 2 : 4,
    permissionMode: "default",
    settings: {
      permissions: {
        allow: ["Agent"],
        ask: ["Bash(*)", "Write(*)", "Edit(*)"],
        deny: [],
        defaultMode: "default",
      },
    },
    tools: ["Bash", "Write", "Edit", "Agent"],
  };
}

function authSnapshot(): Record<string, boolean | string | null> {
  return {
    ANTHROPIC_AUTH_TOKEN_PRESENT:
      process.env.ANTHROPIC_AUTH_TOKEN !== undefined,
    ANTHROPIC_AUTH_TOKEN_NONEMPTY:
      (process.env.ANTHROPIC_AUTH_TOKEN ?? "").length > 0,
    ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL ?? null,
    ANTHROPIC_API_KEY_PRESENT: process.env.ANTHROPIC_API_KEY !== undefined,
    ANTHROPIC_API_KEY_NONEMPTY: (process.env.ANTHROPIC_API_KEY ?? "").length > 0,
    CLAUDE_CODE_OAUTH_TOKEN_PRESENT:
      process.env.CLAUDE_CODE_OAUTH_TOKEN !== undefined,
    CLAUDE_CODE_OAUTH_TOKEN_NONEMPTY:
      (process.env.CLAUDE_CODE_OAUTH_TOKEN ?? "").length > 0,
  };
}

async function runScenario(scenario: Scenario, runIndex: number): Promise<RunSummary> {
  const runId = `${scenario}-run-${runIndex}`;
  const runDir = join("evidence", runId);
  const messagesPath = join(runDir, "messages.jsonl");
  const callbacksPath = join(runDir, "callbacks.jsonl");
  const summaryPath = join(runDir, "summary.json");
  await mkdir(runDir, { recursive: true });

  const startedAt = now();
  const summary: RunSummary = {
    scenario,
    runIndex,
    startedAt,
    finishedAt: startedAt,
    exit: "completed",
    sessionIds: [],
    counts: {
      sdkMessages: 0,
      preToolUseParent: 0,
      preToolUseSubagent: 0,
      canUseToolParent: 0,
      canUseToolSubagent: 0,
    },
    callbackTools: [],
  };

  await appendJsonl(messagesPath, {
    timestamp: now(),
    scenario,
    runIndex,
    kind: "harness",
    payload: {
      sdkVersion,
      auth: authSnapshot(),
      runId,
      timeoutMs,
    },
  });

  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    summary.exit = "timeout";
    abortController.abort();
  }, timeoutMs);
  timeout.unref();

  try {
    const stream = query({
      prompt: promptForScenario(scenario, runId),
      options: makeOptions(scenario, runIndex, callbacksPath, summary, abortController),
    });

    for await (const message of stream) {
      recordSessionId(summary, message);
      summary.counts.sdkMessages += 1;
      await appendJsonl(messagesPath, {
        timestamp: now(),
        scenario,
        runIndex,
        kind: "sdk_message",
        payload: message,
      });
    }
  } catch (error) {
    if (summary.exit !== "timeout") {
      summary.exit = "error";
    }
    summary.errorMessage = error instanceof Error ? error.message : String(error);
    await appendJsonl(messagesPath, {
      timestamp: now(),
      scenario,
      runIndex,
      kind: "harness",
      payload: {
        error: summary.errorMessage,
      },
    });
  } finally {
    clearTimeout(timeout);
  }

  summary.finishedAt = now();
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

function recordSessionId(summary: RunSummary, message: SDKMessage): void {
  const sessionId = message.session_id;
  if (sessionId !== undefined && !summary.sessionIds.includes(sessionId)) {
    summary.sessionIds.push(sessionId);
  }
}

async function main(): Promise<void> {
  await mkdir("evidence", { recursive: true });
  const scenarios: Scenario[] = ["direct", "subagent-1", "subagent-2"];
  const summaries: RunSummary[] = [];

  for (const scenario of scenarios) {
    for (let index = 1; index <= runCount; index += 1) {
      console.log(`running ${scenario} ${index}/${runCount}`);
      summaries.push(await runScenario(scenario, index));
    }
  }

  await writeFile("evidence/summary.json", `${JSON.stringify(summaries, null, 2)}\n`);
  console.log(JSON.stringify(summaries, null, 2));
}

await main();
