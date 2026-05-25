import type { JsonObject, JsonValue } from "../core/domain.js";
import type {
  StructuredModelRequest,
  StructuredModelSchema,
} from "./structured-model-call.js";
import {
  isJsonObject,
  parseJson,
  requireJsonObject,
  StructuredModelCallError,
} from "./structured-model-call.js";

export interface AnthropicStructuredModelClientOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly endpoint?: string;
  readonly anthropicVersion?: string;
  readonly timeoutMs?: number;
  readonly maxTokens?: number;
  readonly fetchImpl?: typeof fetch;
}

interface AnthropicTextBlock extends JsonObject {
  readonly type: "text";
  readonly text: string;
}

export class AnthropicStructuredModelClient {
  private readonly endpoint: string;
  private readonly anthropicVersion: string;
  private readonly timeoutMs: number;
  private readonly maxTokens: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: AnthropicStructuredModelClientOptions) {
    this.endpoint = options.endpoint ?? "https://api.anthropic.com/v1/messages";
    this.anthropicVersion = options.anthropicVersion ?? "2023-06-01";
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxTokens = options.maxTokens ?? 1_024;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async call<T>(request: StructuredModelRequest<T>): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          "anthropic-version": this.anthropicVersion,
          "content-type": "application/json",
          "x-api-key": this.options.apiKey,
        },
        body: JSON.stringify({
          model: this.options.model,
          max_tokens: this.maxTokens,
          temperature: 0,
          system:
            "Return only JSON that satisfies the provided response_schema. Do not include markdown.",
          messages: [
            {
              role: "user",
              content: JSON.stringify({
                input: request.input,
                response_schema: request.output.schema,
              }),
            },
          ],
        }),
        signal: controller.signal,
      });

      const body = await response.text();
      if (!response.ok) {
        throw new StructuredModelCallError(
          `Anthropic structured model call failed with HTTP ${response.status}: ${body}`,
        );
      }

      return request.output.parse(
        parseJson(extractAnthropicText(body, request.output), "Anthropic structured model response"),
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

function extractAnthropicText<T>(
  body: string,
  output: StructuredModelSchema<T>,
): string {
  const parsed = requireJsonObject(parseJson(body, "Anthropic message response"), "Anthropic message response");
  const content = parsed.content;
  if (!Array.isArray(content)) {
    throw new StructuredModelCallError("Anthropic message response content must be an array");
  }
  const blocks = content.filter(isAnthropicTextBlock);
  const text = blocks.map((block) => block.text).join("\n").trim();
  if (text.length === 0) {
    throw new StructuredModelCallError(
      `Anthropic message response did not contain text for ${output.name}`,
    );
  }
  return stripCodeFence(text);
}

/**
 * Strip a Markdown code fence wrapping the model's JSON. The system prompt asks
 * for fence-free output, but live models intermittently wrap structured output
 * in ```json … ``` regardless; without this the subsequent strict JSON.parse
 * fails. Handles a leading fence with an optional language tag and a trailing
 * closing fence; leaves unfenced text untouched.
 */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }
  const withoutOpen = trimmed.replace(/^```[^\n]*\n?/, "");
  const withoutClose = withoutOpen.replace(/\n?```\s*$/, "");
  return withoutClose.trim();
}

function isAnthropicTextBlock(value: JsonValue): value is AnthropicTextBlock {
  if (!isJsonObject(value)) return false;
  return value.type === "text" && typeof value.text === "string";
}
