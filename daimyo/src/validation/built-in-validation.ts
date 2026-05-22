import type {
  ExecutionEvidence,
  JsonObject,
  JsonValue,
  NodeRef,
  ValidationEvidenceStrength,
  ValidationReport,
  ValidationStatus,
} from "../core/domain.js";
import type { ExecutionStore } from "../core/execution-store.js";
import type {
  Validation,
  ValidationRequest,
  ValidationResult,
} from "../core/ports/capabilities.js";
import type { WorkTask } from "../core/ports/work-source.js";
import {
  type DeclaredCommand,
  runDeclaredCommand,
  type ShellRunResult,
} from "../engine/shell-runner.js";
import {
  requireJsonObject,
  StructuredModelCallError,
  type StructuredModelRequest,
  type StructuredModelSchema,
} from "../engine/structured-model-call.js";

export interface StructuredModelCaller {
  call<T>(request: StructuredModelRequest<T>): Promise<T>;
}

export interface BuiltInValidationOptions {
  readonly executionStore: ExecutionStore;
  readonly modelClient: StructuredModelCaller;
  readonly runCommand?: (command: DeclaredCommand) => Promise<ShellRunResult>;
  readonly now?: () => string;
  readonly makeReportRef?: (request: ValidationRequest) => string;
}

interface ModelAcceptanceResult {
  readonly pass: boolean;
  readonly fail: boolean;
  readonly reasons: readonly string[];
}

const modelAcceptanceSchema: StructuredModelSchema<ModelAcceptanceResult> = {
  name: "validation-acceptance-result",
  schema: {
    type: "object",
    required: ["pass", "fail", "reasons"],
    additionalProperties: false,
    properties: {
      pass: { type: "boolean" },
      fail: { type: "boolean" },
      reasons: { type: "array", items: { type: "string" } },
    },
  },
  parse(value: JsonValue): ModelAcceptanceResult {
    const object = requireJsonObject(value, "validation acceptance result");
    const pass = object.pass;
    const fail = object.fail;
    const reasons = object.reasons;
    if (typeof pass !== "boolean") {
      throw new StructuredModelCallError("validation acceptance pass must be boolean");
    }
    if (typeof fail !== "boolean") {
      throw new StructuredModelCallError("validation acceptance fail must be boolean");
    }
    if (!Array.isArray(reasons) || !reasons.every((reason) => typeof reason === "string")) {
      throw new StructuredModelCallError("validation acceptance reasons must be a string array");
    }
    return { pass, fail, reasons };
  },
};

export class BuiltInValidation implements Validation {
  private readonly executionStore: ExecutionStore;
  private readonly modelClient: StructuredModelCaller;
  private readonly runCommand: (command: DeclaredCommand) => Promise<ShellRunResult>;
  private readonly now: () => string;
  private readonly makeReportRef: (request: ValidationRequest) => string;

  constructor(options: BuiltInValidationOptions) {
    this.executionStore = options.executionStore;
    this.modelClient = options.modelClient;
    this.runCommand = options.runCommand ?? runDeclaredCommand;
    this.now = options.now ?? (() => new Date().toISOString());
    this.makeReportRef =
      options.makeReportRef ??
      ((request) =>
        `validation:${request.task.id}:${request.node.id}:${request.scope}:${this.now()}`);
  }

  async validate(request: ValidationRequest): Promise<ValidationResult> {
    const command = readValidationCommand(request.task);
    if (command !== undefined) {
      return this.validateWithCommand(request, command);
    }
    return this.validateWithModelFallback(request);
  }

  private async validateWithCommand(
    request: ValidationRequest,
    command: DeclaredCommand,
  ): Promise<ValidationResult> {
    const result = await this.runCommand(command);
    const status: ValidationStatus = result.exitCode === 0 ? "pass" : "fail";
    const reasons = [
      `Validation command exited with code ${result.exitCode}.`,
      `stdout: ${result.stdout}`,
      `stderr: ${result.stderr}`,
    ];
    const details: JsonObject = {
      kind: "command",
      command: command.command,
      args: command.args ?? [],
      cwd: command.cwd ?? null,
      timeoutMs: command.timeoutMs ?? null,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    };

    return this.persistResult(request, status, reasons, "command", details);
  }

  private async validateWithModelFallback(
    request: ValidationRequest,
  ): Promise<ValidationResult> {
    const modelResult = await this.modelClient.call({
      input: {
        context:
          "Daimyo validation fallback. This is weaker evidence than a declared validation command.",
        request: JSON.stringify({
          task: {
            id: request.task.id,
            title: request.task.title,
            acceptanceCriteria: request.task.acceptanceCriteria,
          },
          scope: request.scope,
          evidence: request.evidence,
        }),
      },
      output: modelAcceptanceSchema,
    });
    const status: ValidationStatus = modelResult.pass && !modelResult.fail ? "pass" : "fail";
    const reasons = [
      "Model acceptance fallback used; evidence is weaker than a command result.",
      ...modelResult.reasons,
    ];
    const details: JsonObject = {
      kind: "model_fallback",
      pass: modelResult.pass,
      fail: modelResult.fail,
    };

    return this.persistResult(request, status, reasons, "model_fallback", details);
  }

  private async persistResult(
    request: ValidationRequest,
    status: ValidationStatus,
    reasons: readonly string[],
    evidenceStrength: ValidationEvidenceStrength,
    details: JsonObject,
  ): Promise<ValidationResult> {
    const report_ref = this.makeReportRef(request);
    const report: ValidationReport = {
      report_ref,
      taskId: request.task.id,
      nodeId: request.node.id,
      scope: request.scope,
      status,
      reasons,
      evidence_strength: evidenceStrength,
      evidence: request.evidence,
      details,
      createdAt: this.now(),
    };
    const evidence = validationEvidence(request.node, report, request.evidence);
    await this.executionStore.recordValidationReport(request.task.id, request.node.id, report);
    await this.executionStore.appendEvidence(request.task.id, request.node.id, evidence);
    return { status, reasons, report_ref };
  }
}

function validationEvidence(
  node: NodeRef,
  report: ValidationReport,
  producedEvidence: ExecutionEvidence,
): ExecutionEvidence {
  return {
    summary: `${report.scope}-scope validation ${report.status} for node ${node.id}`,
    artifacts: [report.report_ref],
    ...(producedEvidence.touchedFiles === undefined
      ? {}
      : { touchedFiles: producedEvidence.touchedFiles }),
    report_ref: report.report_ref,
  };
}

function readValidationCommand(task: WorkTask): DeclaredCommand | undefined {
  const metadata = task.metadata;
  if (metadata === undefined) return undefined;
  const declared = metadata.validation_command ?? metadata.validationCommand;
  if (declared === undefined) return undefined;
  return parseDeclaredCommand(declared);
}

function parseDeclaredCommand(value: JsonValue): DeclaredCommand {
  if (!isJsonObject(value)) {
    throw new Error("Task validation command must be an object");
  }
  const command = value.command;
  if (typeof command !== "string" || command.length === 0) {
    throw new Error("Task validation command.command must be a non-empty string");
  }

  const args = readOptionalStringArray(value, "args");
  const cwd = readOptionalString(value, "cwd");
  const env = readOptionalStringRecord(value, "env");
  const timeoutMs = readOptionalPositiveNumber(value, "timeoutMs");
  return {
    command,
    ...(args === undefined ? {} : { args }),
    ...(cwd === undefined ? {} : { cwd }),
    ...(env === undefined ? {} : { env }),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  };
}

function readOptionalStringArray(
  source: JsonObject,
  key: string,
): readonly string[] | undefined {
  const value = source[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`Task validation command.${key} must be a string array`);
  }
  return value;
}

function readOptionalString(source: JsonObject, key: string): string | undefined {
  const value = source[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new Error(`Task validation command.${key} must be a string`);
  }
  return value;
}

function readOptionalStringRecord(
  source: JsonObject,
  key: string,
): Readonly<Record<string, string>> | undefined {
  const value = source[key];
  if (value === undefined) return undefined;
  if (!isJsonObject(value)) {
    throw new Error(`Task validation command.${key} must be an object`);
  }
  const entries = Object.entries(value);
  if (!entries.every((entry) => typeof entry[1] === "string")) {
    throw new Error(`Task validation command.${key} values must be strings`);
  }
  const record: Record<string, string> = {};
  for (const [entryKey, entryValue] of entries) {
    if (typeof entryValue === "string") {
      record[entryKey] = entryValue;
    }
  }
  return record;
}

function readOptionalPositiveNumber(source: JsonObject, key: string): number | undefined {
  const value = source[key];
  if (value === undefined) return undefined;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  throw new Error(`Task validation command.${key} must be a positive number`);
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
