import { dirname, extname, resolve } from "node:path";
import { ClaudeSdkAgentTransport } from "../adapters/claude-sdk-agent-transport.js";
import { JsonWorkSource } from "../adapters/json-work-source.js";
import { MarkdownChecklistWorkSource } from "../adapters/markdown-checklist-work-source.js";
import type { AgentTransport } from "../core/ports/agent-transport.js";
import type { Validation } from "../core/ports/capabilities.js";
import type { DecisionProvider } from "../core/ports/decision-provider.js";
import type { WorkSource } from "../core/ports/work-source.js";
import { JsonlExecutionStore } from "../core/jsonl-execution-store.js";
import type { ExecutionStore } from "../core/execution-store.js";
import {
  DEFAULT_AUTONOMY_PROFILE,
  type AutonomyProfile,
} from "../decision/autonomy.js";
import { DEFAULT_TIER1_DECISION_PROMPT, type Tier1DecisionPrompt } from "../decision/tier1-prompt.js";
import {
  TieredDecisionProvider,
  type DecisionModelClient,
  type StaticDecisionRules,
} from "../decision/tiered-decision-provider.js";
import { AnthropicStructuredModelClient } from "../engine/anthropic-structured-model-call.js";
import { BuiltInValidation, type StructuredModelCaller } from "../validation/built-in-validation.js";
import { ConsoleHumanDecisionNotifier, type HumanDecisionNotifier } from "../notification/notifier.js";
import { Supervisor } from "../supervisor/supervisor.js";

export type StandalonePlanType = "markdown" | "json";

export interface StandalonePlanOptions {
  readonly filePath: string;
  readonly type?: StandalonePlanType;
}

export interface StandaloneModelOptions {
  readonly apiKey?: string;
  readonly apiKeyEnv?: string;
  readonly model?: string;
  readonly endpoint?: string;
}

export interface StandaloneDaimyoOptions {
  readonly cwd?: string;
  readonly workspaceDir?: string;
  readonly plan?: StandalonePlanOptions;
  readonly agentTransport?: AgentTransport;
  readonly workSource?: WorkSource;
  readonly executionStore?: ExecutionStore;
  readonly validation?: Validation;
  readonly decisionProvider?: DecisionProvider;
  readonly modelClient?: DecisionModelClient & StructuredModelCaller;
  readonly notifier?: HumanDecisionNotifier;
  readonly autonomyProfile?: AutonomyProfile;
  readonly staticRules?: StaticDecisionRules;
  readonly tier1Prompt?: Tier1DecisionPrompt | null;
  readonly maxRetries?: number;
  readonly maxConcurrency?: number;
  readonly stallAfterMs?: number;
  readonly model?: StandaloneModelOptions;
}

export interface StandaloneDaimyo {
  readonly supervisor: Supervisor;
  readonly agentTransport: AgentTransport;
  readonly workSource: WorkSource;
  readonly executionStore: ExecutionStore;
  readonly validation: Validation;
  readonly decisionProvider: DecisionProvider;
  readonly notifier: HumanDecisionNotifier;
}

export function createStandaloneDaimyo(options: StandaloneDaimyoOptions): StandaloneDaimyo {
  const cwd = resolve(options.cwd ?? process.cwd());
  const workspaceDir = resolve(options.workspaceDir ?? cwd);
  const modelClient = options.modelClient ?? createDefaultModelClient(options.model);
  const executionStore = options.executionStore ?? new JsonlExecutionStore({ workspaceDir });
  const agentTransport = options.agentTransport ?? new ClaudeSdkAgentTransport();
  const workSource = options.workSource ?? createStandaloneWorkSource(options.plan);
  const notifier = options.notifier ?? new ConsoleHumanDecisionNotifier();
  const validation =
    options.validation ??
    new BuiltInValidation({
      executionStore,
      modelClient,
    });
  const autonomyProfile = options.autonomyProfile ?? DEFAULT_AUTONOMY_PROFILE;
  const decisionProvider =
    options.decisionProvider ??
    new TieredDecisionProvider({
      executionStore,
      autonomyProfile,
      modelClient,
      tier1Prompt:
        options.tier1Prompt === undefined ? DEFAULT_TIER1_DECISION_PROMPT : options.tier1Prompt,
      notifier,
      ...(options.staticRules === undefined ? {} : { staticRules: options.staticRules }),
    });

  return {
    supervisor: new Supervisor({
      agentTransport,
      workSource,
      executionStore,
      validation,
      decisionProvider,
      cwd,
      autonomyProfile,
      ...(options.maxRetries === undefined ? {} : { maxRetries: options.maxRetries }),
      ...(options.maxConcurrency === undefined ? {} : { maxConcurrency: options.maxConcurrency }),
      ...(options.stallAfterMs === undefined ? {} : { stallAfterMs: options.stallAfterMs }),
    }),
    agentTransport,
    workSource,
    executionStore,
    validation,
    decisionProvider,
    notifier,
  };
}

export function createStandaloneWorkSource(plan: StandalonePlanOptions | undefined): WorkSource {
  if (plan === undefined) {
    throw new Error("Standalone Daimyo requires a plan file or an injected WorkSource.");
  }

  const filePath = resolve(plan.filePath);
  const type = plan.type ?? inferPlanType(filePath);
  if (type === "markdown") return new MarkdownChecklistWorkSource({ filePath });
  return new JsonWorkSource({ filePath });
}

export function inferPlanType(filePath: string): StandalonePlanType {
  const extension = extname(filePath).toLowerCase();
  if (extension === ".md" || extension === ".markdown") return "markdown";
  if (extension === ".json") return "json";
  throw new Error(`Cannot infer WorkSource type from ${filePath}; pass --type markdown or --type json.`);
}

export function defaultWorkspaceDirForPlan(filePath: string): string {
  return dirname(resolve(filePath));
}

function createDefaultModelClient(
  options: StandaloneModelOptions | undefined,
): DecisionModelClient & StructuredModelCaller {
  const envName = options?.apiKeyEnv ?? "ANTHROPIC_API_KEY";
  const apiKey = options?.apiKey ?? process.env[envName];
  if (apiKey === undefined || apiKey.length === 0) {
    return new UnavailableModelClient(envName);
  }

  const endpoint = options?.endpoint ?? process.env.DAIMYO_MODEL_ENDPOINT;
  return new AnthropicStructuredModelClient({
    apiKey,
    model: options?.model ?? process.env.DAIMYO_MODEL ?? "claude-sonnet-4-5",
    ...(endpoint === undefined ? {} : { endpoint }),
  });
}

class UnavailableModelClient implements DecisionModelClient, StructuredModelCaller {
  constructor(private readonly envName: string) {}

  async call<T>(): Promise<T> {
    throw new Error(
      `Structured model call unavailable. Set ${this.envName} or inject a modelClient.`,
    );
  }
}
