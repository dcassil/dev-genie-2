import { BuiltInValidation, asNodeId, asTaskId } from "daimyo";
import type {
  CapabilityTask,
  DeclaredCommand,
  ExecutionEvidence,
  NodeRef,
  ShellRunResult,
  StructuredModelCaller as DaimyoStructuredModelCaller,
} from "daimyo";
import type {
  ArchitectureImpact,
  JsonObject,
  JsonValue,
  RoleResult,
  ValidationReport,
} from "protocol";

import {
  architectureImpactValidationErrors,
  isArchitectureImpact,
  isValidationReport,
  validationReportValidationErrors,
} from "../runner/protocol-schemas.js";
import type { ProofStory } from "../proof/story.js";
import { InMemoryValidationStore } from "./in-memory-validation-store.js";

export interface ProofValidationGateInput {
  readonly story: ProofStory;
  readonly candidate: ArchitectureImpact | JsonValue;
  readonly roleResult: RoleResult;
  readonly now?: () => Date;
}

export interface ProofValidationGateResult {
  readonly report: ValidationReport;
  readonly status: "pass" | "fail";
  readonly schemaValid: boolean;
  readonly acceptance: ProofAcceptanceResult;
}

export interface ProofAcceptanceResult {
  readonly pass: boolean;
  readonly checks: readonly ProofAcceptanceCheck[];
}

export interface ProofAcceptanceCheck {
  readonly id: string;
  readonly pass: boolean;
  readonly expected: JsonValue;
  readonly actual: JsonValue;
}

const VALIDATION_COMMAND = "protocol-proof-validate-architecture-impact";

export async function validateProofArchitectureImpact(
  input: ProofValidationGateInput,
): Promise<ProofValidationGateResult> {
  const createdAt = (input.now ?? (() => new Date()))().toISOString();
  const store = new InMemoryValidationStore();
  const taskId = asTaskId(input.story.id);
  const nodeId = asNodeId(`${input.roleResult.payload.invocation_id}:validation`);
  const node: NodeRef = {
    id: nodeId,
    taskId,
    type: "leaf",
    status: "done",
  };
  await store.upsertNode(taskId, { ...node, retryCount: 0 });

  const schemaValid = isArchitectureImpact(input.candidate);
  const acceptance = schemaValid
    ? evaluateProofAcceptance(input.story, input.candidate)
    : failedSchemaAcceptance(input.candidate);
  const validation = new BuiltInValidation({
    executionStore: store,
    modelClient: unavailableModelClient(),
    now: () => createdAt,
    makeReportRef: () => `validation:${input.story.id}:${input.roleResult.payload.invocation_id}`,
    runCommand: commandRunnerFor(schemaValid, acceptance),
  });

  const result = await validation.validate({
    task: validationTask(input.story),
    node,
    scope: "parent",
    evidence: validationEvidence(input.story, input.roleResult, input.candidate),
  });
  const report = store.getValidationReport(result.report_ref);
  if (report === undefined) {
    throw new Error(`Validation report ${result.report_ref} was not persisted`);
  }
  const protocolReport = normalizeProofValidationReport(report, acceptance);
  if (!isValidationReport(protocolReport)) {
    throw new Error(`ValidationReport failed protocol schema validation: ${validationReportValidationErrors().join("; ")}`);
  }
  return {
    report: protocolReport,
    status: result.status,
    schemaValid,
    acceptance,
  };
}

export function evaluateProofAcceptance(
  story: ProofStory,
  impact: ArchitectureImpact,
): ProofAcceptanceResult {
  const surfaces = collectSurfaces(impact);
  const reasonCodes = collectReasonCodes(impact);
  const primitive = impact.payload.summary.affected_primitive;
  const checks: readonly ProofAcceptanceCheck[] = [
    {
      id: "schema_valid",
      pass: true,
      expected: "ArchitectureImpact protocol schema",
      actual: "valid",
    },
    {
      id: "required_surfaces",
      pass: story.validation_intent.required_surfaces.every((surface) => surfaces.has(surface)),
      expected: [...story.validation_intent.required_surfaces],
      actual: [...surfaces].sort(),
    },
    {
      id: "required_reason_code",
      pass: story.validation_intent.required_reason_codes.some((reasonCode) => reasonCodes.has(reasonCode)),
      expected: [...story.validation_intent.required_reason_codes],
      actual: [...reasonCodes].sort(),
    },
    {
      id: "required_primitive",
      pass: story.validation_intent.required_primitives.includes(primitive),
      expected: [...story.validation_intent.required_primitives],
      actual: primitive,
    },
    {
      id: "minimum_proposed_changes",
      pass: impact.payload.proposed_changes.length >= story.validation_intent.min_proposed_changes,
      expected: story.validation_intent.min_proposed_changes,
      actual: impact.payload.proposed_changes.length,
    },
    {
      id: "requires_decision",
      pass: !story.validation_intent.requires_decision || impact.payload.decisions.length > 0,
      expected: story.validation_intent.requires_decision,
      actual: impact.payload.decisions.length > 0,
    },
  ];
  return {
    checks,
    pass: checks.every((check) => check.pass),
  };
}

function commandRunnerFor(
  schemaValid: boolean,
  acceptance: ProofAcceptanceResult,
): (command: DeclaredCommand) => Promise<ShellRunResult> {
  return async (command: DeclaredCommand): Promise<ShellRunResult> => {
    if (command.command !== VALIDATION_COMMAND) {
      return {
        exitCode: 127,
        stdout: "",
        stderr: `Unsupported validation command: ${command.command}`,
      };
    }
    const stdout = JSON.stringify({
      schema_valid: schemaValid,
      schema_errors: schemaValid ? [] : architectureImpactValidationErrors(),
      acceptance,
    });
    return {
      exitCode: schemaValid && acceptance.pass ? 0 : 1,
      stdout,
      stderr: "",
    };
  };
}

function validationTask(story: ProofStory): CapabilityTask {
  return {
    id: asTaskId(story.id),
    title: story.title,
    status: "done",
    revision: "proof-story@1",
    body: story.body,
    acceptanceCriteria: story.acceptance_criteria,
    metadata: {
      validation_command: {
        command: VALIDATION_COMMAND,
        args: [story.id],
        timeoutMs: 5000,
      },
    },
  };
}

function validationEvidence(
  story: ProofStory,
  roleResult: RoleResult,
  candidate: ArchitectureImpact | JsonValue,
): ExecutionEvidence {
  return {
    summary: "Protocol proof Architect Role produced an ArchitectureImpact candidate for validation.",
    touch_report: {
      task_id: asTaskId(story.id),
      report_type: "touch_report",
      touched_files: isArchitectureImpact(candidate) ? candidate.ownership.owns_files : [],
      touched_interfaces: isArchitectureImpact(candidate) ? candidate.ownership.owns_interfaces : [],
      touched_data: isArchitectureImpact(candidate) ? candidate.ownership.owns_data : [],
      touched_workflow_steps: isArchitectureImpact(candidate) ? candidate.ownership.owns_workflow_steps : [],
    },
    produced_artifact_refs: roleResult.payload.output_artifacts,
  };
}

function failedSchemaAcceptance(candidate: ArchitectureImpact | JsonValue): ProofAcceptanceResult {
  return {
    pass: false,
    checks: [
      {
        id: "schema_valid",
        pass: false,
        expected: "ArchitectureImpact protocol schema",
        actual: summarizeJsonValue(candidate),
      },
    ],
  };
}

function normalizeProofValidationReport(
  report: ValidationReport,
  acceptance: ProofAcceptanceResult,
): ValidationReport {
  if (report.payload.scope !== "parent" || report.payload.status !== "fail") {
    return report;
  }
  return {
    ...report,
    payload: {
      ...report.payload,
      details: {
        ...report.payload.details,
        normalized_blocking_reason_codes: true,
      },
      completion_decision: {
        can_mark_complete: false,
        authority: "parent_authoritative",
        blocking_reason_codes: failedCheckReasonCodes(acceptance),
      },
    },
  };
}

function failedCheckReasonCodes(acceptance: ProofAcceptanceResult): string[] {
  const failed = acceptance.checks.filter((check) => !check.pass);
  if (failed.length === 0) {
    return ["validation:proof_gate_failed"];
  }
  return failed.map((check) => `validation:${check.id}`);
}

function collectSurfaces(impact: ArchitectureImpact): ReadonlySet<string> {
  return new Set([
    ...surfaceValues(impact.ownership),
    ...surfaceValues(impact.payload.affected_surfaces),
    ...surfaceValues(impact.payload.owned_surfaces),
    ...impact.payload.proposed_changes.flatMap((change) => surfaceValues(change.target_surfaces)),
    ...impact.payload.risks.flatMap((risk) => surfaceValues(risk.affected_surfaces)),
    ...impact.payload.decisions.flatMap((decision) => surfaceValues(decision.applies_to_surfaces)),
  ]);
}

function collectReasonCodes(impact: ArchitectureImpact): ReadonlySet<string> {
  return new Set([
    ...(impact.confidence.reason_codes ?? []),
    ...impact.review_required.reason_codes,
    ...impact.payload.summary.reason_codes,
    ...impact.payload.proposed_changes.flatMap((change) => change.rationale_codes),
    ...impact.payload.risks.flatMap((risk) => risk.mitigation_codes),
    ...impact.payload.tradeoffs.flatMap((tradeoff) => tradeoff.reason_codes),
    ...impact.payload.decisions.flatMap((decision) => decision.reason_codes),
  ]);
}

function surfaceValues(surface: {
  readonly owns_files: readonly string[];
  readonly owns_interfaces: readonly string[];
  readonly owns_data: readonly string[];
  readonly owns_workflow_steps: readonly string[];
  readonly depends_on?: readonly string[];
}): readonly string[] {
  return [
    ...surface.owns_files,
    ...surface.owns_interfaces,
    ...surface.owns_data,
    ...surface.owns_workflow_steps,
    ...(surface.depends_on ?? []),
  ];
}

function summarizeJsonValue(value: ArchitectureImpact | JsonValue): JsonObject {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return { keys: Object.keys(value).sort() };
  }
  if (Array.isArray(value)) {
    return { array_length: value.length };
  }
  return { value_type: value === null ? "null" : typeof value };
}

function unavailableModelClient(): DaimyoStructuredModelCaller {
  return {
    async call<T>(): Promise<T> {
      throw new Error("Proof validation gate uses the daimyo command path; model fallback is not configured.");
    },
  };
}
