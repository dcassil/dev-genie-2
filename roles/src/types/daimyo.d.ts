declare module "daimyo" {
  import type { DecisionRequestPayload, DecisionVerdict, JsonObject, JsonValue } from "protocol";

  export interface AnthropicStructuredModelClientOptions {
    readonly apiKey: string;
    readonly model: string;
    readonly endpoint?: string;
    readonly anthropicVersion?: string;
    readonly timeoutMs?: number;
    readonly maxTokens?: number;
    readonly fetchImpl?: typeof fetch;
  }

  export interface StructuredModelSchema<T> {
    readonly name: string;
    readonly schema: JsonObject;
    readonly parse: (value: JsonValue) => T;
  }

  export interface StructuredModelRequest<T> {
    readonly input: {
      readonly context: JsonValue;
      readonly rules?: JsonValue;
      readonly request: JsonValue;
    };
    readonly output: StructuredModelSchema<T>;
  }

  export class AnthropicStructuredModelClient {
    constructor(options: AnthropicStructuredModelClientOptions);
    call<T>(request: StructuredModelRequest<T>): Promise<T>;
  }

  export type AutonomyLevel = "always_in_loop" | "big_questions_only" | "delegate";
  export type AutonomyThresholdAction = "proceed" | "escalate";

  export interface AutonomyProfile {
    readonly engineering: AutonomyLevel;
    readonly product: AutonomyLevel;
    readonly design: AutonomyLevel;
  }

  export interface AutonomyThresholdResult {
    readonly action: AutonomyThresholdAction;
    readonly reason: string;
  }

  export function evaluateAutonomyThreshold(
    request: DecisionRequestPayload,
    verdict: DecisionVerdict,
    profile: AutonomyProfile,
  ): AutonomyThresholdResult;
}
