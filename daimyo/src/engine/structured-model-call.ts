import type { JsonObject, JsonValue } from "../core/domain.js";

export type JsonSchema = JsonObject;

export interface StructuredModelInput {
  readonly context: string;
  readonly request: string;
}

export interface StructuredModelSchema<T> {
  readonly name: string;
  readonly schema: JsonSchema;
  readonly parse: (value: JsonValue) => T;
}

export interface StructuredModelClientOptions {
  readonly endpoint: string;
  readonly apiKey?: string;
  readonly model: string;
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
  readonly fetchImpl?: typeof fetch;
}

export interface StructuredModelRequest<T> {
  readonly input: StructuredModelInput;
  readonly output: StructuredModelSchema<T>;
}

export class StructuredModelCallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StructuredModelCallError";
  }
}

/**
 * Bounded structured-model-call primitive.
 *
 * The caller injects model identity, credentials, endpoint, and optionally
 * fetch. The endpoint contract is intentionally simple: it receives
 * `{ model, input: { context, request }, response_schema }` and returns the
 * typed JSON payload directly.
 */
export class StructuredModelClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;

  constructor(private readonly options: StructuredModelClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxResponseBytes = options.maxResponseBytes ?? 65_536;
  }

  async call<T>(request: StructuredModelRequest<T>): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(this.options.endpoint, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          model: this.options.model,
          input: request.input,
          response_schema: request.output.schema,
        }),
        signal: controller.signal,
      });

      const body = await response.text();
      if (!response.ok) {
        throw new StructuredModelCallError(
          `Structured model call failed with HTTP ${response.status}: ${body}`,
        );
      }

      if (Buffer.byteLength(body, "utf8") > this.maxResponseBytes) {
        throw new StructuredModelCallError(
          `Structured model response exceeded ${this.maxResponseBytes} bytes`,
        );
      }

      const parsed: JsonValue = parseJson(body, "structured model response");
      return request.output.parse(parsed);
    } finally {
      clearTimeout(timeout);
    }
  }

  private headers(): HeadersInit {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (this.options.apiKey !== undefined) {
      headers.authorization = `Bearer ${this.options.apiKey}`;
    }
    return headers;
  }
}

export function parseJson(value: string, label: string): JsonValue {
  try {
    const parsed: JsonValue = JSON.parse(value);
    return parsed;
  } catch (error) {
    if (error instanceof Error) {
      throw new StructuredModelCallError(`Invalid ${label}: ${error.message}`);
    }
    throw new StructuredModelCallError(`Invalid ${label}`);
  }
}

export function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requireJsonObject(value: JsonValue, label: string): JsonObject {
  if (!isJsonObject(value)) {
    throw new StructuredModelCallError(`${label} must be a JSON object`);
  }
  return value;
}
