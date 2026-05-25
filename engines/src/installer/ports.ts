import { existsSync, readdirSync, readFileSync } from "node:fs";

import type {
  InstallPlanMutation,
  ReconciliationDetail,
  ReconciliationOutcome,
} from "protocol";

export interface FsReadPort {
  exists(path: string): Promise<boolean>;
  readFile(path: string): Promise<string>;
  readDir(path: string): Promise<readonly string[]>;
}

export type ManagedWriteOutcome = ReconciliationOutcome;

export interface ManagedTargetLock {
  readonly pattern: string;
  readonly reason: string;
  readonly target_path: string;
  readonly agent_file?: string;
  readonly source_line?: number;
}

export interface ManagedRegionSnapshot {
  readonly target_path: string;
  readonly managed_marker: string;
  readonly begin_marker: string;
  readonly end_marker: string;
  readonly present: boolean;
  readonly content: string | null;
}

export interface ManagedWriterRequest {
  readonly workspaceRoot: string;
  readonly mutation: InstallPlanMutation;
  readonly dryRun?: boolean;
}

export interface ManagedRegionWriteRequest extends ManagedWriterRequest {
  readonly body: string;
  readonly baselineContent?: string;
  readonly lock?: ManagedTargetLock;
}

export interface LayeredWriteRequest extends ManagedWriterRequest {
  readonly rules: Readonly<Record<string, unknown>>;
  readonly rewriteEntryPoint?: boolean;
  readonly lock?: ManagedTargetLock;
}

export interface JsonMergeRequest extends ManagedWriterRequest {
  readonly settingsPath?: string;
  readonly lock?: ManagedTargetLock;
}

export interface FullFileWriteRequest extends ManagedWriterRequest {
  readonly components?: readonly string[];
  readonly lock?: ManagedTargetLock;
}

export type KatanaPlatformId = "claude-code" | "cursor" | "openai-codex";

export interface DelegatedPlatformInstallRequest extends ManagedWriterRequest {
  readonly platformId?: KatanaPlatformId;
  readonly katanaRoot?: string;
  readonly mcpCommand?: string;
  readonly mcpArgs?: readonly string[];
  readonly force?: boolean;
}

export interface LastRunWriteRequest {
  readonly workspaceRoot: string;
  readonly mutation: InstallPlanMutation;
  readonly dryRun?: boolean;
  readonly plan?: readonly unknown[];
  readonly applied?: readonly unknown[];
  readonly skipped?: readonly unknown[];
  readonly errors?: readonly unknown[];
  readonly extra?: Readonly<Record<string, unknown>>;
}

export interface LockQueryRequest extends ManagedWriterRequest {
  readonly finding?: unknown;
}

export interface ManagedRegionReader {
  readManagedRegion(request: ManagedWriterRequest): Promise<ManagedRegionSnapshot>;
}

export interface DevGenieManagedWriter extends ManagedRegionReader {
  findLock(request: LockQueryRequest): Promise<ManagedTargetLock | null>;
  writeManagedRegion(request: ManagedRegionWriteRequest): Promise<ManagedWriteOutcome>;
  writeLayered(request: LayeredWriteRequest): Promise<ManagedWriteOutcome>;
  mergeJson(request: JsonMergeRequest): Promise<ManagedWriteOutcome>;
  writeFullFile(request: FullFileWriteRequest): Promise<ManagedWriteOutcome>;
  recordLastRun(request: LastRunWriteRequest): Promise<ManagedWriteOutcome>;
}

export interface KatanaPlatformManagedWriter {
  delegatePlatformInstall(request: DelegatedPlatformInstallRequest): Promise<ManagedWriteOutcome>;
}

export interface ManagedWriter extends DevGenieManagedWriter, KatanaPlatformManagedWriter {
}

export function outcomeDetail(
  detail: ReconciliationDetail | undefined,
): Pick<ReconciliationOutcome, "detail"> {
  return detail === undefined ? {} : { detail };
}

export class NodeFsReadPort implements FsReadPort {
  async exists(path: string): Promise<boolean> {
    return existsSync(path);
  }

  async readFile(path: string): Promise<string> {
    return readFileSync(path, "utf8");
  }

  async readDir(path: string): Promise<readonly string[]> {
    return readdirSync(path).sort();
  }
}
