export {
  INSTALLER_ENGINE_VERSION,
  InstallerEngine,
} from "./engine.js";
export {
  INSTALL_PLAN_VERSION,
  planInstall,
} from "./planner.js";
export {
  detectRepoState,
} from "./detector.js";
export {
  RECONCILIATION_REPORT_VERSION,
  applyInstallPlan,
} from "./applier.js";
export type {
  DesiredConfigTarget,
  DesiredPlugin,
  DesiredState,
  DetectedManagedRegionPresence,
  DetectedPluginPresence,
  InstallerEngineContract,
  LastRunRecordReference,
  LockDeclaration,
  RepoState,
} from "./engine.js";
export type {
  FsReadPort,
  ManagedWriter,
} from "./ports.js";
export type {
  InstallPlan,
  InstallPlanAction,
  InstallPlanMutation,
  InstallPlanReasonCode,
  InstallSourceWriter,
  InstallerRepoClassification,
  InstallWriteStrategy,
  ReconciliationOutcome,
  ReconciliationReasonCode,
  ReconciliationReport,
  ReconciliationStatus,
} from "protocol";
