import type {
  InstallPlan,
  ReconciliationOutcome,
  ReconciliationReport,
} from "protocol";

import type { ManagedWriter } from "./ports.js";

export const RECONCILIATION_REPORT_VERSION = "1.0.0";

export async function applyInstallPlan(
  plan: InstallPlan,
  _managedWriter: ManagedWriter,
  engineVersion: string,
): Promise<ReconciliationReport> {
  const outcomes = plan.mutations.map(skippedOutcome);

  return {
    report_version: RECONCILIATION_REPORT_VERSION,
    engine_version: engineVersion,
    repo_classification: plan.repo_classification,
    had_conflict: false,
    counts: {
      applied: 0,
      skipped: outcomes.length,
      blocked: 0,
      conflict: 0,
    },
    outcomes,
  };
}

function skippedOutcome(mutation: InstallPlan["mutations"][number]): ReconciliationOutcome {
  return {
    mutation_id: mutation.mutation_id,
    status: "skipped",
    reason_code: "delegated_skip",
    rationale: "Installer Engine scaffold does not apply managed writes until the applier implementation lands.",
  };
}
