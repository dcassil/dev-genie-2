declare module "daimyo" {
  import type { JsonObject, JsonValue } from "protocol";

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
}
