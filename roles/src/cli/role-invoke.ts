import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { AnthropicStructuredModelClient } from "daimyo";
import type { JsonObject, JsonValue, RoleResult } from "protocol";

import { architectRoleDefinition } from "../roles/architect.js";
import { plannerRoleDefinition } from "../roles/planner.js";
import { qualityGovernorRoleDefinition } from "../roles/quality-governor.js";
import { RoleRegistry } from "../registry/role-registry.js";
import type { RoleContext } from "../runner/role-definition.js";
import { RoleRunner } from "../runner/role-runner.js";
import {
  StructuredModelUnavailableError,
  type StructuredModelCaller,
} from "../runner/structured-model.js";
import {
  isRoleInvocation,
  roleInvocationValidationErrors,
} from "../schemas/protocol-schemas.js";

export const ROLE_INVOKE_EXIT_CODES = {
  ok: 0,
  invalidInput: 2,
  blocked: 10,
  needsHuman: 11,
  failed: 12,
  usage: 64,
  ioError: 66,
} as const;

const ERROR_ENVELOPE_SCHEMA_VERSION = "1.0.0";
const DEFAULT_MODEL = "claude-sonnet-4-5";

type TextReader = (path: string) => Promise<string>;
type TextWriter = (path: string, content: string) => Promise<void>;
type StreamReader = () => Promise<string>;
type StreamWriter = (content: string) => void | Promise<void>;

export interface RoleInvokeCliDeps {
  readonly readText?: TextReader;
  readonly writeText?: TextWriter;
  readonly readStdin?: StreamReader;
  readonly writeStdout?: StreamWriter;
  readonly writeStderr?: StreamWriter;
  readonly registry?: RoleRegistry;
  readonly modelClient?: StructuredModelCaller;
  readonly now?: () => Date;
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

interface InvokeCommand {
  readonly roleId: string;
  readonly inputPath: string;
  readonly outputPath: string;
  readonly contextPath?: string;
}

interface RoleInvokeErrorEntry {
  readonly code: string;
  readonly path?: string;
  readonly details?: JsonValue;
}

interface RoleInvokeErrorEnvelope {
  readonly artifact_type: "RoleInvokeError";
  readonly schema_version: string;
  readonly created_at: string;
  readonly status: "failed";
  readonly code: string;
  readonly errors: readonly RoleInvokeErrorEntry[];
}

class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

class CliInputError extends Error {
  constructor(
    readonly code: string,
    readonly entries: readonly RoleInvokeErrorEntry[],
  ) {
    super(code);
    this.name = "CliInputError";
  }
}

class CliIoError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CliIoError";
  }
}

export async function runCli(
  argv: readonly string[],
  deps: RoleInvokeCliDeps = {},
): Promise<number> {
  const now = deps.now ?? (() => new Date());
  const stderr = deps.writeStderr ?? defaultWriteStderr;

  let command: InvokeCommand;
  try {
    command = parseArgv(argv);
  } catch (error) {
    await stderr(`${errorMessage(error)}\n`);
    return ROLE_INVOKE_EXIT_CODES.usage;
  }

  try {
    const invocationText = await readInput(command.inputPath, deps);
    const invocationJson = parseJson(invocationText, "role_invocation_json");
    if (!isRoleInvocation(invocationJson)) {
      throw new CliInputError(
        "role_invocation_schema_invalid",
        roleInvocationValidationErrors().map((message) => ({
          code: "schema:role_invocation_invalid",
          details: { message },
        })),
      );
    }

    if (invocationJson.payload.role_id !== command.roleId) {
      throw new CliInputError("role_id_mismatch", [
        {
          code: "role:argv_input_mismatch",
          details: {
            argv_role_id: command.roleId,
            invocation_role_id: invocationJson.payload.role_id,
          },
        },
      ]);
    }

    const roleContext = await readRoleContext(command.contextPath, deps);
    const runner = new RoleRunner({
      registry: deps.registry ?? createDefaultRoleRegistry(),
      modelClient: deps.modelClient ?? createDefaultModelClient(deps),
      now,
    });
    const result = await runner.run(invocationJson, roleContext);
    await writeOutput(command.outputPath, stableJson(result), deps);
    return exitCodeForRoleResult(result);
  } catch (error) {
    const failure = errorEnvelopeFor(error, now());
    try {
      await writeOutput(command.outputPath, stableJson(failure), deps);
    } catch (writeError) {
      await stderr(`${errorMessage(writeError)}\n`);
      return ROLE_INVOKE_EXIT_CODES.ioError;
    }
    await stderr(`${failure.code}\n`);
    if (error instanceof CliInputError) {
      return ROLE_INVOKE_EXIT_CODES.invalidInput;
    }
    if (error instanceof CliIoError) {
      return ROLE_INVOKE_EXIT_CODES.ioError;
    }
    return ROLE_INVOKE_EXIT_CODES.failed;
  }
}

export function createDefaultRoleRegistry(): RoleRegistry {
  return new RoleRegistry()
    .register(architectRoleDefinition)
    .register(plannerRoleDefinition)
    .register(qualityGovernorRoleDefinition);
}

export function exitCodeForRoleResult(result: RoleResult): number {
  switch (result.payload.status) {
    case "produced":
    case "skipped":
      return ROLE_INVOKE_EXIT_CODES.ok;
    case "blocked":
      return ROLE_INVOKE_EXIT_CODES.blocked;
    case "needs_human":
      return ROLE_INVOKE_EXIT_CODES.needsHuman;
  }
}

function parseArgv(argv: readonly string[]): InvokeCommand {
  const args = [...argv];
  const command = args.shift();
  if (command === "role") {
    const nestedCommand = args.shift();
    if (nestedCommand !== "invoke") {
      throw new CliUsageError(usage());
    }
  } else if (command !== "invoke") {
    throw new CliUsageError(usage());
  }

  const roleId = args.shift();
  if (roleId === undefined || roleId.startsWith("--")) {
    throw new CliUsageError(usage());
  }

  let inputPath: string | undefined;
  let outputPath: string | undefined;
  let contextPath: string | undefined;
  while (args.length > 0) {
    const flag = args.shift();
    const value = args.shift();
    if (flag === undefined || value === undefined || value.startsWith("--")) {
      throw new CliUsageError(usage());
    }
    if (flag === "--input") {
      inputPath = value;
    } else if (flag === "--output") {
      outputPath = value;
    } else if (flag === "--context") {
      contextPath = value;
    } else {
      throw new CliUsageError(usage());
    }
  }

  if (inputPath === undefined || outputPath === undefined) {
    throw new CliUsageError(usage());
  }

  return {
    roleId,
    inputPath,
    outputPath,
    ...(contextPath === undefined ? {} : { contextPath }),
  };
}

function usage(): string {
  return "Usage: roles invoke <role-id> --input <RoleInvocation.json|-> --output <RoleResult.json|-> [--context <Context.json>]";
}

async function readInput(path: string, deps: RoleInvokeCliDeps): Promise<string> {
  if (path === "-") {
    const readStdin = deps.readStdin ?? defaultReadStdin;
    return readStdin();
  }
  return readText(path, deps);
}

async function readRoleContext(
  contextPath: string | undefined,
  deps: RoleInvokeCliDeps,
): Promise<RoleContext> {
  if (contextPath === undefined) {
    return {};
  }
  const contextJson = parseJson(await readText(contextPath, deps), "role_context_json");
  if (!isJsonObject(contextJson)) {
    throw new CliInputError("role_context_not_object", [
      {
        code: "schema:role_context_not_object",
      },
    ]);
  }
  return roleContextFromJson(contextJson);
}

async function readText(path: string, deps: RoleInvokeCliDeps): Promise<string> {
  const reader = deps.readText ?? defaultReadText;
  try {
    return await reader(resolvePath(path, deps));
  } catch (error) {
    throw new CliIoError("input_read_failed", errorMessage(error));
  }
}

async function writeOutput(
  path: string,
  content: string,
  deps: RoleInvokeCliDeps,
): Promise<void> {
  if (path === "-") {
    const writeStdout = deps.writeStdout ?? defaultWriteStdout;
    await writeStdout(content);
    return;
  }
  const writer = deps.writeText ?? defaultWriteText;
  await writer(resolvePath(path, deps), content);
}

function resolvePath(path: string, deps: RoleInvokeCliDeps): string {
  if (path.startsWith("/")) {
    return path;
  }
  return resolve(deps.cwd ?? process.cwd(), path);
}

function roleContextFromJson(value: JsonObject): RoleContext {
  const story = objectProperty(value, "story");
  const context = objectProperty(value, "context") ?? value;
  return {
    ...(story === undefined ? {} : { story }),
    context,
  };
}

function objectProperty(value: JsonObject, key: string): JsonObject | undefined {
  const candidate = value[key];
  if (candidate !== undefined && isJsonObject(candidate)) {
    return candidate;
  }
  return undefined;
}

function createDefaultModelClient(deps: RoleInvokeCliDeps): StructuredModelCaller {
  const env = deps.env ?? process.env;
  const envName = env.ROLES_ANTHROPIC_API_KEY_ENV ?? "ANTHROPIC_API_KEY";
  const apiKey = env[envName];
  if (apiKey === undefined || apiKey.length === 0) {
    return new UnavailableStructuredModelClient(envName);
  }

  const endpoint = env.ROLES_MODEL_ENDPOINT ?? env.DAIMYO_MODEL_ENDPOINT;
  return new AnthropicStructuredModelClient({
    apiKey,
    model: env.ROLES_MODEL ?? env.DAIMYO_MODEL ?? DEFAULT_MODEL,
    ...(endpoint === undefined ? {} : { endpoint }),
  });
}

class UnavailableStructuredModelClient implements StructuredModelCaller {
  constructor(private readonly envName: string) {}

  async call<T>(): Promise<T> {
    throw new StructuredModelUnavailableError(this.envName);
  }
}

function parseJson(text: string, label: string): JsonValue {
  try {
    const parsed: JsonValue = JSON.parse(text);
    return parsed;
  } catch (error) {
    throw new CliInputError(`${label}_invalid`, [
      {
        code: "json:parse_failed",
        details: { message: errorMessage(error) },
      },
    ]);
  }
}

function errorEnvelopeFor(error: unknown, createdAt: Date): RoleInvokeErrorEnvelope {
  if (error instanceof CliInputError) {
    return {
      artifact_type: "RoleInvokeError",
      schema_version: ERROR_ENVELOPE_SCHEMA_VERSION,
      created_at: createdAt.toISOString(),
      status: "failed",
      code: error.code,
      errors: error.entries,
    };
  }
  if (error instanceof CliIoError) {
    return {
      artifact_type: "RoleInvokeError",
      schema_version: ERROR_ENVELOPE_SCHEMA_VERSION,
      created_at: createdAt.toISOString(),
      status: "failed",
      code: error.code,
      errors: [
        {
          code: "io:read_failed",
          details: { message: error.message },
        },
      ],
    };
  }
  return {
    artifact_type: "RoleInvokeError",
    schema_version: ERROR_ENVELOPE_SCHEMA_VERSION,
    created_at: createdAt.toISOString(),
    status: "failed",
    code: "role_invoke_failed",
    errors: [
      {
        code: "cli:unhandled_failure",
        details: { message: errorMessage(error) },
      },
    ],
  };
}

function stableJson(value: RoleResult | RoleInvokeErrorEnvelope): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

async function defaultReadText(path: string): Promise<string> {
  return readFile(path, "utf8");
}

async function defaultWriteText(path: string, content: string): Promise<void> {
  await writeFile(path, content, "utf8");
}

async function defaultReadStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function defaultWriteStdout(content: string): void {
  process.stdout.write(content);
}

function defaultWriteStderr(content: string): void {
  process.stderr.write(content);
}
