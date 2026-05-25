import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type {
  InstallPlanMutation,
  ReconciliationDetail,
  ReconciliationOutcome,
  ReconciliationReasonCode,
  ReconciliationStatus,
} from "protocol";

import type {
  DelegatedPlatformInstallRequest,
  KatanaPlatformId,
  KatanaPlatformManagedWriter,
} from "../ports.js";
import { outcomeDetail } from "../ports.js";

export interface KatanaInstallOptions {
  readonly workspaceRoot: string;
  readonly katanaRoot: string;
  readonly mcpCommand: string;
  readonly mcpArgs?: readonly string[];
  readonly dryRun?: boolean;
  readonly force?: boolean;
}

export interface KatanaWrittenFile {
  readonly path: string;
  readonly action: "created" | "updated" | "skipped" | "removed";
  readonly bytes: number;
}

export interface KatanaInstallReport {
  readonly platform: KatanaPlatformId;
  readonly files: readonly KatanaWrittenFile[];
  readonly mcpRegistered: boolean;
  readonly commands: readonly string[];
  readonly warnings: readonly string[];
}

export interface KatanaPlatformAdapterContract {
  readonly id: KatanaPlatformId;
  install(opts: KatanaInstallOptions): Promise<KatanaInstallReport>;
}

export interface KatanaPlatformDependencies {
  getAdapter(platformId: KatanaPlatformId): KatanaPlatformAdapterContract;
}

export interface KatanaPlatformWriterOptions {
  readonly katanaRoot?: string;
  readonly dependencies?: KatanaPlatformDependencies;
}

const here = dirname(fileURLToPath(import.meta.url));
const PLATFORM_IDS: readonly KatanaPlatformId[] = ["claude-code", "cursor", "openai-codex"];

export class KatanaPlatformWriterAdapter implements KatanaPlatformManagedWriter {
  private readonly dependencies: KatanaPlatformDependencies;
  private readonly katanaPackageRoot: string;

  constructor(options: KatanaPlatformWriterOptions = {}) {
    this.katanaPackageRoot = resolveKatanaRoot(options.katanaRoot);
    this.dependencies = options.dependencies ?? createDefaultKatanaDependencies(this.katanaPackageRoot);
  }

  async delegatePlatformInstall(request: DelegatedPlatformInstallRequest): Promise<ReconciliationOutcome> {
    const platformId = request.platformId ?? platformFromMutation(request.mutation);
    const adapter = this.dependencies.getAdapter(platformId);
    const installOptions = installOptionsForRequest(request, this.katanaPackageRoot);
    const report = await adapter.install(installOptions);
    return outcomeFromInstallReport(request.mutation, report, request.dryRun === true);
  }
}

export function createDefaultKatanaDependencies(katanaRoot: string): KatanaPlatformDependencies {
  return {
    getAdapter(platformId) {
      return {
        id: platformId,
        async install(opts) {
          const mod = await importedModule(join(katanaRoot, "src", "platform", "registry.ts"));
          const getAdapter = functionField(mod, "getAdapter");
          const adapter = getAdapter(platformId);
          if (!isRecord(adapter)) {
            throw new Error("katana getAdapter returned a non-object adapter.");
          }
          const install = adapter.install;
          if (typeof install !== "function") {
            throw new Error("katana platform adapter is missing install().");
          }
          return normalizeInstallReport(await install(opts), platformId);
        },
      };
    },
  };
}

function outcomeFromInstallReport(
  mutation: InstallPlanMutation,
  report: KatanaInstallReport,
  dryRun: boolean,
): ReconciliationOutcome {
  const status = statusFromFiles(report.files);
  const reasonCode: ReconciliationReasonCode = status === "skipped" ? "already_satisfied" : "written";
  const actionSummary = summarizeActions(report.files);
  const rationale = status === "skipped"
    ? `Katana platform install for ${report.platform} was already satisfied.`
    : `Delegated platform install to katana ${report.platform} adapter (${actionSummary}).`;
  return outcome(mutation, status, reasonCode, rationale, {
    platform: report.platform,
    mcp_registered: report.mcpRegistered,
    commands: [...report.commands],
    warnings: [...report.warnings],
    files: report.files.map((file) => ({
      path: file.path,
      action: file.action,
      bytes: file.bytes,
      removal: file.action === "removed",
    })),
    dry_run: dryRun,
  });
}

function statusFromFiles(files: readonly KatanaWrittenFile[]): ReconciliationStatus {
  return files.some((file) => file.action === "created" || file.action === "updated" || file.action === "removed")
    ? "applied"
    : "skipped";
}

function summarizeActions(files: readonly KatanaWrittenFile[]): string {
  const created = files.filter((file) => file.action === "created").length;
  const updated = files.filter((file) => file.action === "updated").length;
  const skipped = files.filter((file) => file.action === "skipped").length;
  const removed = files.filter((file) => file.action === "removed").length;
  return `${created} created, ${updated} updated, ${skipped} skipped, ${removed} removed`;
}

function installOptionsForRequest(
  request: DelegatedPlatformInstallRequest,
  katanaPackageRoot: string,
): KatanaInstallOptions {
  return {
    workspaceRoot: request.workspaceRoot,
    katanaRoot: request.katanaRoot ?? join(request.workspaceRoot, ".katana"),
    mcpCommand: request.mcpCommand ?? "node",
    mcpArgs: request.mcpArgs ?? [join(katanaPackageRoot, "bin", "katana-mcp.js")],
    dryRun: request.dryRun ?? false,
    force: request.force ?? false,
  };
}

function platformFromMutation(mutation: InstallPlanMutation): KatanaPlatformId {
  const suffix = mutation.target.split(":")[1];
  return suffix !== undefined && isPlatformId(suffix) ? suffix : "claude-code";
}

function isPlatformId(value: string): value is KatanaPlatformId {
  for (const id of PLATFORM_IDS) {
    if (id === value) {
      return true;
    }
  }
  return false;
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

function resolveKatanaRoot(explicitRoot: string | undefined): string {
  if (explicitRoot !== undefined) {
    return explicitRoot;
  }
  const candidates = [
    resolve(process.cwd(), "katana"),
    resolve(process.cwd(), "..", "katana"),
    resolve(here, "../../../../katana"),
    resolve(here, "../../katana"),
  ];
  const found = candidates.find((candidate) => existsSync(join(candidate, "src", "platform", "registry.ts")));
  if (found !== undefined) {
    return found;
  }
  return resolve(process.cwd(), "katana");
}

async function importedModule(modulePath: string): Promise<Record<string, unknown>> {
  const loaded: unknown = await import(pathToFileURL(modulePath).href);
  if (!isRecord(loaded)) {
    throw new Error(`Expected object module from ${modulePath}`);
  }
  return loaded;
}

function normalizeInstallReport(raw: unknown, platformId: KatanaPlatformId): KatanaInstallReport {
  if (!isRecord(raw)) {
    throw new Error("katana install() returned a non-object report.");
  }
  return {
    platform: platformId,
    files: arrayField(raw, "files").map(normalizeWrittenFile),
    mcpRegistered: raw.mcpRegistered === true,
    commands: arrayField(raw, "commands").map(stringValue),
    warnings: arrayField(raw, "warnings").map(stringValue),
  };
}

function normalizeWrittenFile(raw: unknown): KatanaWrittenFile {
  if (!isRecord(raw)) {
    return {
      path: "",
      action: "skipped",
      bytes: 0,
    };
  }
  const action = actionField(raw.action);
  return {
    path: stringField(raw, "path") ?? "",
    action,
    bytes: numberField(raw, "bytes") ?? 0,
  };
}

function actionField(value: unknown): KatanaWrittenFile["action"] {
  return value === "created" || value === "updated" || value === "skipped" || value === "removed"
    ? value
    : "skipped";
}

function functionField(record: Record<string, unknown>, key: string): (...args: readonly unknown[]) => unknown {
  const value = record[key];
  if (typeof value !== "function") {
    throw new Error(`Expected katana ${key} export to be callable.`);
  }
  return (...args: readonly unknown[]) => value(...args);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function numberField(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" ? value : null;
}

function arrayField(record: Record<string, unknown>, key: string): readonly unknown[] {
  const value = record[key];
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : String(value);
}
