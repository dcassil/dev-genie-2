import { resolve } from "node:path";

import type {
  JsonObject,
  JsonValue,
  OwnershipSurface,
  RoleInvocation,
} from "protocol";
import { describe, expect, it } from "vitest";

import {
  ARCHITECT_ROLE_ID,
  ARCHITECT_ROLE_VERSION,
  ROLE_INVOKE_EXIT_CODES,
  isRoleResult,
  runCli,
  type StructuredModelCaller,
  type StructuredModelInput,
  type StructuredModelRequest,
} from "../src/index.js";

interface RecordedStructuredCall {
  readonly input: StructuredModelInput;
  readonly outputName: string;
}

class StubStructuredModelClient implements StructuredModelCaller {
  readonly calls: RecordedStructuredCall[] = [];

  constructor(private readonly response: JsonValue) {}

  async call<T>(request: StructuredModelRequest<T>): Promise<T> {
    this.calls.push({
      input: request.input,
      outputName: request.output.name,
    });
    return request.output.parse(this.response);
  }
}

class MemoryFs {
  readonly files = new Map<string, string>();

  constructor(entries: readonly (readonly [string, string])[]) {
    for (const [path, content] of entries) {
      this.files.set(path, content);
    }
  }

  async readText(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) {
      throw new Error(`Missing fixture ${path}`);
    }
    return content;
  }

  async writeText(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }
}

describe("role invoke CLI", () => {
  it("writes a schema-valid RoleResult and exits 0 for a valid Architect invocation", async () => {
    const cwd = "/roles-cli-test";
    const inputPath = resolve(cwd, "invocation.json");
    const outputPath = resolve(cwd, "result.json");
    const contextPath = resolve(cwd, "context.json");
    const fs = new MemoryFs([
      [inputPath, stableJson(validInvocation())],
      [
        contextPath,
        stableJson({
          story: {
            title: "Build ADR-2 Role runner CLI",
          },
          context: {
            repo: "dev-genie",
          },
        }),
      ],
    ]);
    const modelClient = new StubStructuredModelClient(validArchitectureImpact());

    const exitCode = await runCli(
      [
        "invoke",
        ARCHITECT_ROLE_ID,
        "--input",
        "invocation.json",
        "--output",
        "result.json",
        "--context",
        "context.json",
      ],
      {
        cwd,
        readText: (path) => fs.readText(path),
        writeText: (path, content) => fs.writeText(path, content),
        modelClient,
        now: fixedNow,
      },
    );

    const result = parseJsonObject(requiredFile(fs, outputPath));
    expect(exitCode).toBe(ROLE_INVOKE_EXIT_CODES.ok);
    expect(isRoleResult(result)).toBe(true);
    expect(isRoleResult(result) ? result.payload.status : "").toBe("produced");
    expect(isRoleResult(result) ? result.payload.output_artifacts[0]?.artifact_type : "").toBe(
      "ArchitectureImpact",
    );
    expect(modelClient.calls).toHaveLength(1);
    expect(modelClient.calls[0]?.input.context).toMatchObject({
      prompt_ref: "dev-genie.architect-role@1.0.0",
    });
  });

  it("writes a structured error and makes no model call for schema-invalid input", async () => {
    const cwd = "/roles-cli-test";
    const inputPath = resolve(cwd, "invalid.json");
    const outputPath = resolve(cwd, "error.json");
    const fs = new MemoryFs([
      [
        inputPath,
        stableJson({
          artifact_type: "RoleInvocation",
          payload: {
            role_id: ARCHITECT_ROLE_ID,
          },
        }),
      ],
    ]);
    const modelClient = new StubStructuredModelClient(validArchitectureImpact());

    const exitCode = await runCli(
      ["invoke", ARCHITECT_ROLE_ID, "--input", "invalid.json", "--output", "error.json"],
      {
        cwd,
        readText: (path) => fs.readText(path),
        writeText: (path, content) => fs.writeText(path, content),
        writeStderr: () => {},
        modelClient,
        now: fixedNow,
      },
    );

    const error = parseJsonObject(requiredFile(fs, outputPath));
    expect(exitCode).toBe(ROLE_INVOKE_EXIT_CODES.invalidInput);
    expect(error.artifact_type).toBe("RoleInvokeError");
    expect(error.code).toBe("role_invocation_schema_invalid");
    expect(modelClient.calls).toHaveLength(0);
  });

  it("returns a skipped RoleResult and exits 0 for an unknown role id", async () => {
    const cwd = "/roles-cli-test";
    const inputPath = resolve(cwd, "unknown.json");
    const outputPath = resolve(cwd, "unknown-result.json");
    const unknownRoleId = "dev-genie.unknown-role";
    const fs = new MemoryFs([
      [
        inputPath,
        stableJson(
          withInvocationPayload({
            role_id: unknownRoleId,
          }),
        ),
      ],
    ]);
    const modelClient = new StubStructuredModelClient(validArchitectureImpact());

    const exitCode = await runCli(
      ["role", "invoke", unknownRoleId, "--input", "unknown.json", "--output", "unknown-result.json"],
      {
        cwd,
        readText: (path) => fs.readText(path),
        writeText: (path, content) => fs.writeText(path, content),
        modelClient,
        now: fixedNow,
      },
    );

    const result = parseJsonObject(requiredFile(fs, outputPath));
    expect(exitCode).toBe(ROLE_INVOKE_EXIT_CODES.ok);
    expect(isRoleResult(result)).toBe(true);
    expect(isRoleResult(result) ? result.payload.status : "").toBe("skipped");
    expect(isRoleResult(result) ? result.payload.skip_reason?.code : "").toBe(
      "role:not_registered",
    );
    expect(modelClient.calls).toHaveLength(0);
  });

  it("is byte-stable for a fixed invocation, clock, and fake model", async () => {
    const cwd = "/roles-cli-test";
    const first = await runStableInvocation(cwd, "first.json");
    const second = await runStableInvocation(cwd, "second.json");

    expect(first.exitCode).toBe(ROLE_INVOKE_EXIT_CODES.ok);
    expect(second.exitCode).toBe(ROLE_INVOKE_EXIT_CODES.ok);
    expect(first.output).toBe(second.output);
  });

  it("returns needs_human cleanly when no model credentials are available", async () => {
    const cwd = "/roles-cli-test";
    const inputPath = resolve(cwd, "invocation.json");
    const outputPath = resolve(cwd, "result.json");
    const fs = new MemoryFs([[inputPath, stableJson(validInvocation())]]);

    const exitCode = await runCli(
      ["invoke", ARCHITECT_ROLE_ID, "--input", "invocation.json", "--output", "result.json"],
      {
        cwd,
        readText: (path) => fs.readText(path),
        writeText: (path, content) => fs.writeText(path, content),
        env: {},
        now: fixedNow,
      },
    );

    const result = parseJsonObject(requiredFile(fs, outputPath));
    expect(exitCode).toBe(ROLE_INVOKE_EXIT_CODES.needsHuman);
    expect(isRoleResult(result)).toBe(true);
    expect(isRoleResult(result) ? result.payload.status : "").toBe("needs_human");
    expect(isRoleResult(result) ? result.payload.missing_context[0]?.code : "").toBe(
      "model:credentials_unavailable",
    );
  });
});

async function runStableInvocation(
  cwd: string,
  outputFileName: string,
): Promise<{ readonly exitCode: number; readonly output: string }> {
  const inputPath = resolve(cwd, "invocation.json");
  const outputPath = resolve(cwd, outputFileName);
  const fs = new MemoryFs([[inputPath, stableJson(validInvocation())]]);
  const modelClient = new StubStructuredModelClient(validArchitectureImpact());
  const exitCode = await runCli(
    ["invoke", ARCHITECT_ROLE_ID, "--input", "invocation.json", "--output", outputFileName],
    {
      cwd,
      readText: (path) => fs.readText(path),
      writeText: (path, content) => fs.writeText(path, content),
      modelClient,
      now: fixedNow,
    },
  );
  return {
    exitCode,
    output: requiredFile(fs, outputPath),
  };
}

function fixedNow(): Date {
  return new Date("2026-05-24T00:34:00.000Z");
}

function withInvocationPayload(patch: Partial<RoleInvocation["payload"]>): RoleInvocation {
  const base = validInvocation();
  return {
    ...base,
    payload: {
      ...base.payload,
      ...patch,
    },
  };
}

function validInvocation(): RoleInvocation {
  return {
    artifact_id: "artifact:sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    artifact_type: "RoleInvocation",
    schema_version: "1.0.0",
    protocol_version: "1.1.0",
    producer: {
      primitive: "loop",
      name: "roles-test",
      invocation_id: "architect-role-cli-call-001",
    },
    created_at: "2026-05-24T00:33:00.000Z",
    source_refs: [],
    output_refs: [],
    ownership: emptyOwnership(),
    confidence: {
      score: 1,
      level: "high",
      reason_codes: ["test:fixture"],
    },
    review_required: {
      required: false,
      reason_codes: [],
    },
    diagnostics: {
      status: "produced",
      warnings: [],
      errors: [],
      missing_context: [],
    },
    payload: {
      invocation_id: "architect-role-cli-call-001",
      role_id: ARCHITECT_ROLE_ID,
      role_version: ARCHITECT_ROLE_VERSION,
      operation: "assess_architecture_impact",
      decision_scope: {
        scope_type: "task",
        scope_id: "DGOS-T-0034",
        objective: "Build the ADR-2 subprocess Role runner CLI.",
        constraints: ["roles:subprocess_contract", "roles:no_prose_parsing"],
      },
      input_artifacts: [
        {
          ref_type: "artifact",
          id: "task:DGOS-T-0034",
          artifact_type: "Task",
          schema_version: "1.0.0",
          protocol_version: "1.1.0",
          relation: "read",
        },
      ],
      context_bundle_refs: [
        {
          ref_type: "artifact",
          id: "context:role-invoke-cli",
          artifact_type: "ContextBundle",
          schema_version: "1.0.0",
          protocol_version: "1.1.0",
          relation: "read",
        },
      ],
      policy_decision_refs: [],
      budget: {
        max_output_tokens: 4000,
      },
      model_tier_policy: {
        allowed_tiers: ["standard", "frontier"],
        preferred_tier: "frontier",
        fallback_allowed: true,
      },
      timeout_ms: 30000,
      allowed_engines: [],
      allowed_tools: [],
      expected_output_artifacts: [
        {
          artifact_type: "ArchitectureImpact",
          schema_version: "1.0.0",
          required: true,
          relation: "produces",
        },
      ],
      trace: {
        destination: {
          ref_type: "file",
          id: "roles/runs/architect-role-cli-call-001.jsonl",
          relation: "produces",
        },
        trace_id: "trace-architect-role-cli-call-001",
      },
    },
  };
}

function validArchitectureImpact(): JsonObject {
  return {
    artifact_id: "artifact:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    artifact_type: "ArchitectureImpact",
    schema_version: "1.0.0",
    protocol_version: "1.1.0",
    producer: {
      primitive: "role",
      name: ARCHITECT_ROLE_ID,
      version: ARCHITECT_ROLE_VERSION,
      invocation_id: "architect-role-cli-call-001",
    },
    created_at: "2026-05-24T00:34:00.000Z",
    source_refs: [],
    output_refs: [],
    ownership: {
      owns_files: ["roles/src/cli/role-invoke.ts"],
      owns_interfaces: ["interface:adr-2-role-subprocess-cli"],
      owns_data: [],
      owns_workflow_steps: ["workflow:roles-role-invoke"],
    },
    confidence: {
      score: 0.88,
      level: "high",
      reason_codes: ["test:stubbed_model"],
    },
    review_required: {
      required: false,
      reason_codes: [],
    },
    diagnostics: {
      status: "produced",
      warnings: [],
      errors: [],
      missing_context: [],
    },
    payload: {
      summary: {
        impact_level: "medium",
        primary_change: "add_new_surface",
        affected_primitive: "role",
        reason_codes: ["role_cli:subprocess_contract"],
      },
      affected_surfaces: {
        owns_files: ["roles/src/cli/role-invoke.ts"],
        owns_interfaces: ["interface:adr-2-role-subprocess-cli"],
        owns_data: [],
        owns_workflow_steps: ["workflow:roles-role-invoke"],
        depends_on: ["interface:role-runner"],
      },
      owned_surfaces: {
        owns_files: ["roles/src/cli/role-invoke.ts"],
        owns_interfaces: ["interface:adr-2-role-subprocess-cli"],
        owns_data: [],
        owns_workflow_steps: ["workflow:roles-role-invoke"],
        depends_on: [],
      },
      proposed_changes: [
        {
          change_id: "add_role_invoke_cli",
          change_type: "add",
          component: {
            name: "role-invoke",
            kind: "role",
          },
          target_surfaces: {
            owns_files: ["roles/src/cli/role-invoke.ts"],
            owns_interfaces: ["interface:adr-2-role-subprocess-cli"],
            owns_data: [],
            owns_workflow_steps: ["workflow:roles-role-invoke"],
            depends_on: [],
          },
          rationale_codes: ["adr-2:json_file_handoff"],
        },
      ],
      risks: [
        {
          risk_id: "stdout_prose_leak",
          category: "runtime",
          severity: "medium",
          affected_surfaces: {
            owns_files: ["roles/src/cli/role-invoke.ts"],
            owns_interfaces: ["interface:adr-2-role-subprocess-cli"],
            owns_data: [],
            owns_workflow_steps: ["workflow:roles-role-invoke"],
            depends_on: [],
          },
          mitigation_codes: ["test:output_file_json_only"],
        },
      ],
      tradeoffs: [
        {
          tradeoff_id: "subprocess_vs_in_process",
          chosen_option: "subprocess_contract_with_in_process_test_hook",
          rejected_options: ["reimplement_role_logic_in_cli"],
          reason_codes: ["adr-2:cross_platform_boundary"],
        },
      ],
      decisions: [
        {
          decision_id: "reuse_shared_role_runner",
          status: "accepted",
          decision: "cli_calls_role_runner_with_registry",
          applies_to_surfaces: {
            owns_files: ["roles/src/cli/role-invoke.ts"],
            owns_interfaces: ["interface:role-runner"],
            owns_data: [],
            owns_workflow_steps: ["workflow:roles-role-invoke"],
            depends_on: [],
          },
          reason_codes: ["task:no_runner_reimplementation"],
        },
      ],
      assumptions: [
        {
          assumption_id: "caller_supplies_context_file",
          subject: "bounded_context_arrives_as_json_when_needed",
          confidence: "medium",
          validation_needed: true,
        },
      ],
    },
  };
}

function parseJsonObject(text: string): JsonObject {
  const parsed: JsonValue = JSON.parse(text);
  if (!isJsonObject(parsed)) {
    throw new Error("Expected JSON object");
  }
  return parsed;
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredFile(fs: MemoryFs, path: string): string {
  const content = fs.files.get(path);
  if (content === undefined) {
    throw new Error(`Expected file ${path}`);
  }
  return content;
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function emptyOwnership(): OwnershipSurface {
  return {
    owns_files: [],
    owns_interfaces: [],
    owns_data: [],
    owns_workflow_steps: [],
  };
}
