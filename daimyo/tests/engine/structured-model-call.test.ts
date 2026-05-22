import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../src/core/domain.js";
import {
  requireJsonObject,
  StructuredModelClient,
  StructuredModelCallError,
  type StructuredModelSchema,
} from "../../src/engine/structured-model-call.js";

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

describe("StructuredModelClient", () => {
  it("posts bounded structured input and parses typed JSON", async () => {
    const calls: JsonObject[] = [];
    let authorizationHeader = "";

    const fetchImpl: typeof fetch = async (_input, init) => {
      authorizationHeader = new Headers(init?.headers).get("authorization") ?? "";
      const bodyText = typeof init?.body === "string" ? init.body : "{}";
      calls.push(requireJsonObject(JSON.parse(bodyText), "request body"));
      return new Response(JSON.stringify({ accepted: true, reason: "schema matched" }), {
        status: 200,
      });
    };

    const client = new StructuredModelClient({
      endpoint: "https://model.example.test/structured",
      apiKey: "test-key",
      model: "test-model",
      fetchImpl,
    });

    const result = await client.call({
      input: { context: "ctx", request: "decide" },
      output: modelResultSchema,
    });

    expect(result).toEqual({ accepted: true, reason: "schema matched" });
    expect(authorizationHeader).toBe("Bearer test-key");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.model).toBe("test-model");
    expect(calls[0]?.input).toEqual({ context: "ctx", request: "decide" });
    expect(calls[0]?.response_schema).toEqual(modelResultSchema.schema);
  });

  it("rejects responses larger than the configured bound", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ accepted: true, reason: "too large" }), {
        status: 200,
      });

    const client = new StructuredModelClient({
      endpoint: "https://model.example.test/structured",
      model: "test-model",
      fetchImpl,
      maxResponseBytes: 5,
    });

    await expect(
      client.call({
        input: { context: "ctx", request: "decide" },
        output: modelResultSchema,
      }),
    ).rejects.toThrow(/exceeded 5 bytes/);
  });
});
