import type {
  InstallPlan,
  InstallerRepoClassification,
  ReconciliationReport,
} from "protocol";

import { applyInstallPlan } from "./applier.js";
import type { ApplyInstallPlanOptions } from "./applier.js";
import { detectRepoState } from "./detector.js";
import {
  INSTALLER_ENGINE_VERSION,
  plan as planInstall,
} from "./planner.js";
import type {
  FsReadPort,
  ManagedWriter,
} from "./ports.js";

export { INSTALLER_ENGINE_VERSION };

export type PluginDetectionSignalKind =
  | "claude_plugin_manifest"
  | "marketplace_directory"
  | "managed_config"
  | "mcp_config";

export interface PluginDetectionSignal {
  readonly kind: PluginDetectionSignalKind;
  readonly path: string;
  readonly detail?: string;
}

export interface DetectedPluginPresence {
  readonly plugin_id: string;
  readonly present: boolean;
  readonly source_path?: string;
  readonly signals: readonly PluginDetectionSignal[];
}

export interface ManagedRegionBounds {
  readonly begin_offset: number;
  readonly begin_line: number;
  readonly content_start_offset: number;
  readonly content_start_line: number;
  readonly content_end_offset: number;
  readonly content_end_line: number;
  readonly end_offset: number;
  readonly end_line: number;
  readonly content: string;
}

export interface DetectedManagedRegionPresence {
  readonly target: string;
  readonly target_path: string;
  readonly managed_marker: string;
  readonly marker_kind: "dev-genie" | "katana";
  readonly feature?: string;
  readonly present: boolean;
  readonly region: ManagedRegionBounds | null;
}

export interface LockDeclaration {
  readonly pattern: string;
  readonly reason: string;
  readonly sourceLine: number;
  readonly agentConfigPath: string;
}

export interface LastRunRecordReference {
  readonly path: string;
  readonly schemaVersion?: number;
  readonly timestamp?: string;
  readonly repoFingerprint?: string;
  readonly rawContent: string;
}

export interface DetectionNotesSection {
  readonly found: boolean;
  readonly files: readonly string[];
  readonly notes: string;
}

export interface EslintDetectionReport extends DetectionNotesSection {
  readonly flat: boolean;
  readonly legacy: boolean;
  readonly extendsChain?: readonly string[];
  readonly effectiveRules?: Readonly<Record<string, unknown>>;
}

export interface TypescriptDetectionReport extends DetectionNotesSection {
  readonly extendsChain?: readonly string[];
  readonly effectiveOptions?: Readonly<Record<string, unknown>>;
}

export interface HooksDetectionReport {
  readonly found: boolean;
  readonly husky: boolean;
  readonly lefthook: boolean;
  readonly nativePreCommit: boolean;
  readonly preCommitFramework: boolean;
  readonly files: readonly string[];
  readonly notes: string;
}

export interface CiWorkflowDetection {
  readonly path: string;
  readonly runsLint: boolean;
  readonly runsTypecheck: boolean;
  readonly runsAudit: boolean;
  readonly runsBuild: boolean;
}

export interface CiDetectionReport {
  readonly found: boolean;
  readonly dir: string;
  readonly workflows: readonly CiWorkflowDetection[];
  readonly anyRunsLint: boolean;
  readonly anyRunsTypecheck: boolean;
  readonly anyRunsAudit: boolean;
  readonly anyRunsBuild: boolean;
  readonly files: readonly string[];
  readonly notes: string;
}

export interface AuditDetectionReport {
  readonly found: boolean;
  readonly hasDir: boolean;
  readonly hasBaseline: boolean;
  readonly hasHook: boolean;
  readonly files: readonly string[];
  readonly notes: string;
}

export interface AgentConfigLockDeclaration {
  readonly pattern: string;
  readonly reason: string;
  readonly sourceLine: number;
}

export interface AgentConfigDetectionReport {
  readonly path: string;
  readonly rawContent: string;
  readonly rules: readonly string[];
  readonly locks: readonly AgentConfigLockDeclaration[];
}

export interface ExistingConfigDetectionReport {
  readonly repoPath: string;
  readonly hasPackageJson: boolean;
  readonly eslint: EslintDetectionReport;
  readonly typescript: TypescriptDetectionReport;
  readonly prettier: DetectionNotesSection;
  readonly hooks: HooksDetectionReport;
  readonly ci: CiDetectionReport;
  readonly scripts: DetectionNotesSection;
  readonly packageScripts: Readonly<Record<string, string>>;
  readonly audit: AuditDetectionReport;
  readonly packageManager: DetectionNotesSection;
  readonly agentConfigs: readonly AgentConfigDetectionReport[];
}

export interface RepoState {
  readonly repo_classification: InstallerRepoClassification;
  readonly plugins: readonly DetectedPluginPresence[];
  readonly managed_regions: readonly DetectedManagedRegionPresence[];
  readonly locks: readonly LockDeclaration[];
  readonly last_run: LastRunRecordReference | null;
  readonly detection_report: ExistingConfigDetectionReport;
}

export interface DesiredPlugin {
  readonly plugin_id: string;
  readonly enabled: boolean;
}

export interface DesiredConfigTarget {
  readonly target: string;
  readonly target_path: string;
  readonly required: boolean;
  readonly status?: "present" | "weaker" | "conflicting" | "missing";
  readonly desired_content?: string;
  readonly baseline_content?: string;
}

export interface DesiredState {
  readonly plugins: readonly DesiredPlugin[];
  readonly configs: readonly DesiredConfigTarget[];
}

export interface DetectRepoStateOptions {
  readonly workspaceRoot: string;
  readonly desired?: DesiredState;
}

export interface InstallerEngineContract {
  detect(readPort: FsReadPort, options?: DetectRepoStateOptions): Promise<RepoState>;
  plan(state: RepoState, desired: DesiredState): InstallPlan;
  apply(plan: InstallPlan, managedWriter: ManagedWriter, options?: ApplyInstallPlanOptions): Promise<ReconciliationReport>;
}

export class InstallerEngine implements InstallerEngineContract {
  detect(readPort: FsReadPort, options: DetectRepoStateOptions = { workspaceRoot: "." }): Promise<RepoState> {
    return detectRepoState(readPort, options);
  }

  plan(state: RepoState, desired: DesiredState): InstallPlan {
    return planInstall(state, desired);
  }

  apply(
    plan: InstallPlan,
    managedWriter: ManagedWriter,
    options: ApplyInstallPlanOptions = {},
  ): Promise<ReconciliationReport> {
    return applyInstallPlan(plan, managedWriter, options);
  }
}
