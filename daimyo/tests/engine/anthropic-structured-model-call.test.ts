import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../src/core/domain.js";
import {
  requireJsonObject,
  StructuredModelCallError,
  type StructuredModelRequest,
  type StructuredModelSchema,
} from "../../src/engine/structured-model-call.js";
import { AnthropicStructuredModelClient } from "../../src/engine/anthropic-structured-model-call.js";

interface ModelResult {
  readonly accepted: boolean;
  readonly reason: string;
}

const modelResultSchema: StructuredModelSchema<ModelResult> = {
  name: "model-result",
  schema: {
    type: "object",
    required: ["accepted", "reason"],
    properties: {
      accepted: { type: "boolean" },
      reason: { type: "string" },
    },
  },
  parse(value: JsonValue): ModelResult {
    const object = requireJsonObject(value, "model result");
    const accepted = object.accepted;
    const reason = object.reason;
    if (typeof accepted !== "boolean") {
      throw new StructuredModelCallError("model result accepted must be boolean");
    }
    if (typeof reason !== "string") {
      throw new StructuredModelCallError("model result reason must be string");
    }
    return { accepted, reason };
  },
};

const request: StructuredModelRequest<ModelResult> = {
  input: { context: "ctx", request: "decide" },
  output: modelResultSchema,
};

function anthropicResponse(text: string): Response {
  return new Response(JSON.stringify({ content: [{ type: "text", text }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function clientReturning(text: string): AnthropicStructuredModelClient {
  const fetchImpl: typeof fetch = async () => anthropicResponse(text);
  return new AnthropicStructuredModelClient({ apiKey: "k", model: "m", fetchImpl });
}

describe("AnthropicStructuredModelClient code-fence handling", () => {
  it("parses a fenced ```json response (the live failure mode)", async () => {
    const client = clientReturning('```json\n{"accepted": true, "reason": "ok"}\n```');
    await expect(client.call(request)).resolves.toEqual({ accepted: true, reason: "ok" });
  });

  it("parses a bare ``` fenced response with no language tag", async () => {
    const client = clientReturning('```\n{"accepted": false, "reason": "no"}\n```');
    await expect(client.call(request)).resolves.toEqual({ accepted: false, reason: "no" });
  });

  it("still parses unfenced JSON unchanged", async () => {
    const client = clientReturning('{"accepted": true, "reason": "plain"}');
    await expect(client.call(request)).resolves.toEqual({ accepted: true, reason: "plain" });
  });
});
