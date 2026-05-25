import type {
  InstallPlan,
  InstallerRepoClassification,
  ReconciliationReport,
} from "protocol";

import { applyInstallPlan } from "./applier.js";
import { detectRepoState } from "./detector.js";
import { planInstall } from "./planner.js";
import type {
  FsReadPort,
  ManagedWriter,
} from "./ports.js";

export const INSTALLER_ENGINE_VERSION = "0.8.0";

export interface DetectedPluginPresence {
  readonly plugin_id: string;
  readonly present: boolean;
  readonly source_path?: string;
}

export interface DetectedManagedRegionPresence {
  readonly target: string;
  readonly target_path: string;
  readonly managed_marker: string;
  readonly present: boolean;
}

export interface LockDeclaration {
  readonly lock_id: string;
  readonly target_path: string;
  readonly source: string;
  readonly rationale?: string;
}

export interface LastRunRecordReference {
  readonly path: string;
  readonly run_id?: string;
  readonly recorded_at?: string;
}

export interface RepoState {
  readonly repo_classification: InstallerRepoClassification;
  readonly plugins: readonly DetectedPluginPresence[];
  readonly managed_regions: readonly DetectedManagedRegionPresence[];
  readonly locks: readonly LockDeclaration[];
  readonly last_run: LastRunRecordReference | null;
}

export interface DesiredPlugin {
  readonly plugin_id: string;
  readonly enabled: boolean;
}

export interface DesiredConfigTarget {
  readonly target: string;
  readonly target_path: string;
  readonly required: boolean;
}

export interface DesiredState {
  readonly plugins: readonly DesiredPlugin[];
  readonly configs: readonly DesiredConfigTarget[];
}

export interface InstallerEngineContract {
  detect(readPort: FsReadPort): Promise<RepoState>;
  plan(state: RepoState, desired: DesiredState): InstallPlan;
  apply(plan: InstallPlan, managedWriter: ManagedWriter): Promise<ReconciliationReport>;
}

export class InstallerEngine implements InstallerEngineContract {
  detect(readPort: FsReadPort): Promise<RepoState> {
    return detectRepoState(readPort);
  }

  plan(state: RepoState, desired: DesiredState): InstallPlan {
    return planInstall(state, desired, INSTALLER_ENGINE_VERSION);
  }

  apply(plan: InstallPlan, managedWriter: ManagedWriter): Promise<ReconciliationReport> {
    return applyInstallPlan(plan, managedWriter, INSTALLER_ENGINE_VERSION);
  }
}
