import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { JsonObject, JsonValue } from "protocol";

import { runProofHarness } from "../harness/proof-harness.js";
import { loadProofStory } from "../proof/story.js";
import type {
  StructuredModelCaller,
  StructuredModelRequest,
} from "../runner/structured-model.js";

const LIVE_FLAG = "PROTOCOL_PROOF_LIVE_SDK_TESTS";
const EVIDENCE_DIR = resolve(process.cwd(), "evidence/dogfood");
const STORY_PATH = resolve(process.cwd(), "fixtures/story/proof-story.json");

class GatewayStructuredModelClient implements StructuredModelCaller {
  constructor(
    private readonly options: {
      readonly authToken: string;
      readonly baseUrl: string;
      readonly model: string;
      readonly maxTokens: number;
    },
  ) {}

  async call<T>(request: StructuredModelRequest<T>): Promise<T> {
    const response = await fetch(endpointFor(this.options.baseUrl), {
      method: "POST",
      headers: {
        "anthropic-version": "2023-06-01",
        "authorization": `Bearer ${this.options.authToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.options.model,
        max_tokens: this.options.maxTokens,
        temperature: 0,
        system: [
          "Return exactly one JSON object satisfying the provided response_schema.",
          "Do not include markdown fences, comments, or prose outside the JSON object.",
          "When refs in the schema are not expanded, use the field descriptions and supplied examples in the input contract.",
        ].join(" "),
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
    });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`Gateway structured model call failed with HTTP ${response.status}: ${body}`);
    }
    return request.output.parse(parseJson(extractText(body)));
  }
}

async function main(): Promise<void> {
  if (process.env[LIVE_FLAG] !== "1") {
    console.log(`${LIVE_FLAG}=1 is required for the live dogfood run; skipping.`);
    return;
  }

  await mkdir(EVIDENCE_DIR, { recursive: true });
  const story = loadProofStory(STORY_PATH);
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN;
  const baseUrl = process.env.ANTHROPIC_BASE_URL;
  if (authToken === undefined || authToken.length === 0 || baseUrl === undefined || baseUrl.length === 0) {
    await writeJson("run-summary.json", {
      status: "failed",
      finding: "Missing ANTHROPIC_AUTH_TOKEN or ANTHROPIC_BASE_URL; live gateway call was not attempted.",
    });
    throw new Error("Missing ANTHROPIC_AUTH_TOKEN or ANTHROPIC_BASE_URL");
  }

  try {
    const result = await runProofHarness({
      story,
      modelClient: new GatewayStructuredModelClient({
        authToken,
        baseUrl,
        model: process.env.PROTOCOL_PROOF_MODEL ?? "claude-sonnet-4-5",
        maxTokens: 4000,
      }),
    });
    await writeJson("role-invocation.json", result.invocation);
    await writeJson("role-result.json", result.roleResult);
    await writeJson("architecture-impact.json", result.architectureImpact);
    await writeJson("validation-report.json", result.validationReport);
    await writeJson("run-summary.json", {
      status: "completed",
      validation_status: result.validationReport.payload.status,
      report_ref: result.validationReport.payload.report_ref,
      architecture_impact_ref: result.architectureImpact.artifact_id,
    });
    if (result.validationReport.payload.status !== "pass") {
      throw new Error(`Live dogfood validation failed: ${result.validationReport.payload.report_ref}`);
    }
  } catch (error) {
    await writeJson("run-summary.json", {
      status: "failed",
      finding: errorMessage(error),
    });
    throw error;
  }
}

function endpointFor(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (trimmed.endsWith("/v1/messages")) {
    return trimmed;
  }
  if (trimmed.endsWith("/v1")) {
    return `${trimmed}/messages`;
  }
  return `${trimmed}/v1/messages`;
}

function extractText(body: string): string {
  const parsed = requireJsonObject(parseJson(body), "gateway response");
  const content = parsed.content;
  if (!Array.isArray(content)) {
    throw new Error("Gateway response content must be an array");
  }
  const texts = content.flatMap((item) => {
    if (typeof item === "object" && item !== null && !Array.isArray(item) && item.type === "text" && typeof item.text === "string") {
      return [item.text];
    }
    return [];
  });
  const text = texts.join("\n").trim();
  if (text.length === 0) {
    throw new Error("Gateway response did not contain text");
  }
  return text;
}

function parseJson(text: string): JsonValue {
  const parsed: JsonValue = JSON.parse(text);
  return parsed;
}

function requireJsonObject(value: JsonValue, label: string): JsonObject {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value;
  }
  throw new Error(`${label} must be a JSON object`);
}

async function writeJson(fileName: string, value: object): Promise<void> {
  const target = resolve(EVIDENCE_DIR, fileName);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown live dogfood failure";
}

await main();
