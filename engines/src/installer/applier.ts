import { createHash } from "node:crypto";

import type {
  InstallPlan,
  InstallPlanMutation,
  ReconciliationDetail,
  ReconciliationOutcome,
  ReconciliationReasonCode,
  ReconciliationReport,
  ReconciliationStatus,
} from "protocol";

import type {
  ManagedTargetLock,
  ManagedWriter,
  ManagedWriterRequest,
} from "./ports.js";
import { outcomeDetail } from "./ports.js";

export const RECONCILIATION_REPORT_VERSION = "1.0.0";
const DEFAULT_WORKSPACE_ROOT = ".";
const DEFAULT_MANAGED_REGION_BODY = [
  "Dev-genie managed guardrails configuration.",
  "Re-run the Installer Engine to reconcile this block.",
].join("\n");

export interface ApplyInstallPlanOptions {
  readonly workspaceRoot?: string;
  readonly dryRun?: boolean;
  readonly engineVersion?: string;
}

export async function apply(
  plan: InstallPlan,
  managedWriter: ManagedWriter,
): Promise<ReconciliationReport> {
  return applyInstallPlan(plan, managedWriter);
}

export async function applyInstallPlan(
  plan: InstallPlan,
  managedWriter: ManagedWriter,
  options: ApplyInstallPlanOptions = {},
): Promise<ReconciliationReport> {
  const workspaceRoot = options.workspaceRoot ?? DEFAULT_WORKSPACE_ROOT;
  const dryRun = options.dryRun ?? false;
  const outcomes: ReconciliationOutcome[] = [];

  for (const mutation of plan.mutations) {
    outcomes.push(await applyMutation({
      workspaceRoot,
      mutation,
      dryRun,
      managedWriter,
    }));
  }

  if (!dryRun && outcomes.some((outcome) => outcome.status === "applied")) {
    await managedWriter.recordLastRun({
      workspaceRoot,
      mutation: lastRunMutation(),
      plan: plan.mutations,
      applied: outcomes.filter((outcome) => outcome.status === "applied"),
      skipped: outcomes.filter((outcome) => outcome.status === "skipped"),
      errors: outcomes.filter((outcome) => outcome.status === "blocked" || outcome.status === "conflict"),
      extra: {
        report_version: RECONCILIATION_REPORT_VERSION,
        engine_version: options.engineVersion ?? plan.engine_version,
        repo_classification: plan.repo_classification,
      },
    });
  }

  return {
    report_version: RECONCILIATION_REPORT_VERSION,
    engine_version: options.engineVersion ?? plan.engine_version,
    repo_classification: plan.repo_classification,
    had_conflict: outcomes.some((outcome) => outcome.status === "conflict"),
    counts: countsFor(outcomes),
    outcomes,
  };
}

interface MutationApplyContext extends ManagedWriterRequest {
  readonly managedWriter: ManagedWriter;
}

async function applyMutation(context: MutationApplyContext): Promise<ReconciliationOutcome> {
  const { mutation, managedWriter } = context;

  if (mutation.action === "skip" || mutation.reason_code === "already_satisfied") {
    return skippedOutcome(mutation);
  }

  const lock = await lockFor(context);
  if (lock !== null) {
    return blockedOutcome(mutation, lock);
  }

  if (mutation.write_strategy === "managed_region") {
    return applyManagedRegionMutation(context);
  }

  if (context.dryRun === true) {
    return dryRunOutcome(mutation);
  }

  if (mutation.write_strategy === "layered") {
    return managedWriter.writeLayered({
      workspaceRoot: context.workspaceRoot,
      mutation,
      rules: rulesForMutation(mutation),
      rewriteEntryPoint: false,
    });
  }

  if (mutation.write_strategy === "json_merge") {
    return managedWriter.mergeJson({
      workspaceRoot: context.workspaceRoot,
      mutation,
    });
  }

  if (mutation.write_strategy === "full_file") {
    return managedWriter.writeFullFile({
      workspaceRoot: context.workspaceRoot,
      mutation,
      ...componentsForMutation(mutation),
    });
  }

  return managedWriter.delegatePlatformInstall({
    workspaceRoot: context.workspaceRoot,
    mutation,
  });
}

async function applyManagedRegionMutation(context: MutationApplyContext): Promise<ReconciliationOutcome> {
  const { mutation, managedWriter } = context;
  const baselineContent = stringField(mutation, "baseline_content");
  const desiredContent = stringField(mutation, "desired_content") ?? DEFAULT_MANAGED_REGION_BODY;
  const snapshot = await managedWriter.readManagedRegion(context);

  if (snapshot.present && snapshot.content === desiredContent) {
    return skippedOutcome(mutation);
  }

  if (
    snapshot.present
    && ((baselineContent !== null && snapshot.content !== baselineContent)
      || (baselineContent === null && mutation.reason_code === "conflicting"))
  ) {
    return conflictOutcome(mutation, {
      target_path: snapshot.target_path,
      managed_marker: snapshot.managed_marker,
      current_region_hash: hashRegion(snapshot.content),
      ...detailString("baseline_region_hash", baselineContent === null ? null : hashRegion(baselineContent)),
      ...detailString("current_region", snapshot.content),
    });
  }

  if (context.dryRun === true) {
    return dryRunOutcome(mutation);
  }

  return managedWriter.writeManagedRegion({
    workspaceRoot: context.workspaceRoot,
    mutation,
    body: desiredContent,
    ...(baselineContent === null ? {} : { baselineContent }),
  });
}

async function lockFor(context: MutationApplyContext): Promise<ManagedTargetLock | null> {
  if (context.mutation.reason_code === "locked") {
    const detectedLock = await context.managedWriter.findLock(context);
    return detectedLock ?? {
      pattern: context.mutation.target_path,
      reason: context.mutation.rationale,
      target_path: context.mutation.target_path,
    };
  }
  return context.managedWriter.findLock(context);
}

function skippedOutcome(mutation: InstallPlanMutation): ReconciliationOutcome {
  return {
    mutation_id: mutation.mutation_id,
    status: "skipped",
    reason_code: "already_satisfied",
    rationale: `${mutation.target} at ${mutation.target_path} already satisfies the install plan; no write was attempted.`,
  };
}

function dryRunOutcome(mutation: InstallPlanMutation): ReconciliationOutcome {
  return outcome(
    mutation,
    "skipped",
    "delegated_skip",
    `Dry run: ${mutation.target} at ${mutation.target_path} was not written.`,
    {
      dry_run: true,
      planned_action: mutation.action,
      write_strategy: mutation.write_strategy,
      source_writer: mutation.source_writer,
    },
  );
}

function blockedOutcome(mutation: InstallPlanMutation, lock: ManagedTargetLock): ReconciliationOutcome {
  return outcome(
    mutation,
    "blocked",
    "lock_blocked",
    `${mutation.target_path} is locked by managed configuration policy; write was not attempted.`,
    {
      pattern: lock.pattern,
      reason: lock.reason,
      target_path: lock.target_path,
      ...detailString("agent_file", lock.agent_file ?? null),
      ...detailNumber("source_line", lock.source_line ?? null),
    },
  );
}

function conflictOutcome(mutation: InstallPlanMutation, detail: ReconciliationDetail): ReconciliationOutcome {
  return outcome(
    mutation,
    "conflict",
    "managed_region_drift",
    `${mutation.target_path} managed region differs from the recorded baseline; write was not attempted.`,
    detail,
  );
}

function outcome(
  mutation: InstallPlanMutation,
  status: ReconciliationStatus,
  reasonCode: ReconciliationReasonCode,
  rationale: string,
  detail?: ReconciliationDetail,
): ReconciliationOutcome {
  return {
    mutation_id: mutation.mutation_id,
    status,
    reason_code: reasonCode,
    rationale,
    ...outcomeDetail(detail),
  };
}

function countsFor(outcomes: readonly ReconciliationOutcome[]): ReconciliationReport["counts"] {
  const counts: ReconciliationReport["counts"] = {
    applied: 0,
    skipped: 0,
    blocked: 0,
    conflict: 0,
  };
  for (const outcome of outcomes) {
    counts[outcome.status] += 1;
  }
  return counts;
}

function hashRegion(content: string | null): string {
  return createHash("sha256").update(content ?? "").digest("hex");
}

function rulesForMutation(mutation: InstallPlanMutation): Readonly<Record<string, unknown>> {
  const rules = recordField(mutation, "rules");
  return rules ?? {};
}

function componentsForMutation(
  mutation: InstallPlanMutation,
): Pick<Parameters<ManagedWriter["writeFullFile"]>[0], "components"> {
  const components = stringArrayField(mutation, "components");
  return components === null ? {} : { components };
}

function stringField(record: object, key: string): string | null {
  if (!isRecord(record)) {
    return null;
  }
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function recordField(record: object, key: string): Readonly<Record<string, unknown>> | null {
  if (!isRecord(record)) {
    return null;
  }
  const value = record[key];
  return isRecord(value) ? value : null;
}

function stringArrayField(record: object, key: string): readonly string[] | null {
  if (!isRecord(record)) {
    return null;
  }
  const value = record[key];
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    return null;
  }
  return value;
}

function isRecord(value: object | unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function detailString(key: string, value: string | null): ReconciliationDetail {
  return value === null ? {} : { [key]: value };
}

function detailNumber(key: string, value: number | null): ReconciliationDetail {
  return value === null ? {} : { [key]: value };
}

function lastRunMutation(): InstallPlanMutation {
  return {
    mutation_id: "mutation:dev-genie-last-run",
    target: "dev-genie-last-run",
    target_path: ".dev-genie/init.last-run.json",
    action: "update",
    write_strategy: "full_file",
    managed_marker: null,
    reason_code: "stale",
    rationale: "Persist Installer Engine last-run metadata after apply.",
    source_writer: "dev-genie:audit",
  };
}
