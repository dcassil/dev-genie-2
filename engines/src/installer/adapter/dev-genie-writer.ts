import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type {
  InstallPlanMutation,
  ReconciliationDetail,
  ReconciliationJsonValue,
  ReconciliationOutcome,
  ReconciliationReasonCode,
  ReconciliationStatus,
} from "protocol";

import type {
  DevGenieManagedWriter,
  FullFileWriteRequest,
  JsonMergeRequest,
  LastRunWriteRequest,
  LayeredWriteRequest,
  LockQueryRequest,
  ManagedRegionSnapshot,
  ManagedRegionWriteRequest,
  ManagedTargetLock,
  ManagedWriterRequest,
} from "../ports.js";
import { outcomeDetail } from "../ports.js";

type MaybePromise<T> = T | Promise<T>;

export interface AgentBlockResult {
  readonly ok: boolean;
  readonly changed: boolean;
  readonly action: string;
}

export interface LayeredEslintResult {
  readonly ok: boolean;
  readonly mode: string;
  readonly path?: string;
  readonly fallbackReason?: string;
  readonly rewroteEntryPoint?: boolean;
}

export interface ClaudeSettingsMergeResult {
  readonly action: string;
  readonly changed: boolean;
  readonly path: string;
}

export interface AuditInstallResult {
  readonly changed: readonly unknown[];
  readonly skipped: readonly unknown[];
  readonly errors: readonly unknown[];
}

export interface ApplyFindingsResult {
  readonly applied: readonly unknown[];
  readonly skipped: readonly unknown[];
  readonly errors: readonly unknown[];
}

export interface DevGenieWriterDependencies {
  readonly writeAgentBlock: (filePath: string, body: string) => MaybePromise<AgentBlockResult>;
  readonly writeLayeredEslintConfig: (
    repoPath: string,
    rules: Readonly<Record<string, unknown>>,
    opts?: Readonly<{ rewriteEntryPoint?: boolean }>,
  ) => MaybePromise<LayeredEslintResult>;
  readonly mergeEditLintHook: (
    opts: Readonly<{ settingsPath: string }>,
  ) => MaybePromise<ClaudeSettingsMergeResult>;
  readonly installAudit: (
    repoPath: string,
    opts?: Readonly<{ components?: readonly string[] }>,
  ) => MaybePromise<AuditInstallResult>;
  readonly applyFindings: (
    opts: Readonly<{
      repoPath: string;
      archId: string;
      findings: readonly unknown[];
      mode: "dry-run" | "apply-all";
    }>,
  ) => MaybePromise<ApplyFindingsResult>;
  readonly findLockForFinding: (repoPath: string, finding: unknown) => MaybePromise<unknown>;
  readonly saveLastRun: (
    repoPath: string,
    payload?: Readonly<{
      plan?: readonly unknown[];
      applied?: readonly unknown[];
      skipped?: readonly unknown[];
      errors?: readonly unknown[];
      extra?: Readonly<Record<string, unknown>>;
    }>,
  ) => MaybePromise<unknown>;
  readonly ensureGitignore: (repoPath: string) => MaybePromise<boolean>;
  readonly beginMarker: string;
  readonly endMarker: string;
}

export interface DevGenieManagedWriterOptions {
  readonly devGenieRoot?: string;
  readonly dependencies?: DevGenieWriterDependencies;
}

const requireModule = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

export class DevGenieManagedWriterAdapter implements DevGenieManagedWriter {
  private readonly dependencies: DevGenieWriterDependencies;

  constructor(options: DevGenieManagedWriterOptions = {}) {
    this.dependencies = options.dependencies ?? createDefaultDependencies(resolveDevGenieRoot(options.devGenieRoot));
  }

  async readManagedRegion(request: ManagedWriterRequest): Promise<ManagedRegionSnapshot> {
    const filePath = workspacePath(request.workspaceRoot, request.mutation.target_path);
    const marker = request.mutation.managed_marker ?? "<!-- dev-genie:guardrails:begin/end -->";
    const content = readCurrentRegion(filePath, this.dependencies.beginMarker, this.dependencies.endMarker);
    return {
      target_path: request.mutation.target_path,
      managed_marker: marker,
      begin_marker: this.dependencies.beginMarker,
      end_marker: this.dependencies.endMarker,
      present: content !== null,
      content,
    };
  }

  async findLock(request: LockQueryRequest): Promise<ManagedTargetLock | null> {
    if (request.mutation.reason_code === "locked") {
      return {
        pattern: request.mutation.target_path,
        reason: request.mutation.rationale,
        target_path: request.mutation.target_path,
      };
    }

    const rawLock = await this.dependencies.findLockForFinding(
      request.workspaceRoot,
      request.finding ?? findingForMutation(request.mutation),
    );
    return normalizeLock(rawLock, request.mutation.target_path);
  }

  async writeManagedRegion(request: ManagedRegionWriteRequest): Promise<ReconciliationOutcome> {
    const blocked = await this.lockedOutcome(request, request.lock);
    if (blocked !== null) {
      return blocked;
    }

    const dryRun = await this.dryRunOutcome(request);
    if (dryRun !== null) {
      return dryRun;
    }

    const result = await this.dependencies.writeAgentBlock(
      workspacePath(request.workspaceRoot, request.mutation.target_path),
      request.body,
    );
    return result.changed
      ? outcome(request.mutation, "applied", "written", `Wrote dev-genie managed region in ${request.mutation.target_path}.`, {
        action: result.action,
        ok: result.ok,
      })
      : outcome(request.mutation, "skipped", "already_satisfied", `Dev-genie managed region in ${request.mutation.target_path} was already current.`, {
        action: result.action,
        ok: result.ok,
      });
  }

  async writeLayered(request: LayeredWriteRequest): Promise<ReconciliationOutcome> {
    const blocked = await this.lockedOutcome(request, request.lock);
    if (blocked !== null) {
      return blocked;
    }
    const dryRun = await this.dryRunOutcome(request);
    if (dryRun !== null) {
      return dryRun;
    }

    const result = await this.dependencies.writeLayeredEslintConfig(request.workspaceRoot, request.rules, {
      rewriteEntryPoint: request.rewriteEntryPoint ?? false,
    });
    if (!result.ok) {
      return outcome(request.mutation, "blocked", "delegated_skip", `dev-genie ESLint layered writer could not apply ${request.mutation.target}.`, detailFromRecord({
        mode: result.mode,
        fallback_reason: result.fallbackReason,
      }));
    }
    return outcome(request.mutation, "applied", "written", `Delegated ${request.mutation.target} to dev-genie ESLint layered writer.`, detailFromRecord({
      mode: result.mode,
      path: result.path,
      rewrote_entry_point: result.rewroteEntryPoint ?? false,
    }));
  }

  async mergeJson(request: JsonMergeRequest): Promise<ReconciliationOutcome> {
    const blocked = await this.lockedOutcome(request, request.lock);
    if (blocked !== null) {
      return blocked;
    }
    const dryRun = await this.dryRunOutcome(request);
    if (dryRun !== null) {
      return dryRun;
    }

    const settingsPath = request.settingsPath ?? workspacePath(request.workspaceRoot, request.mutation.target_path);
    const result = await this.dependencies.mergeEditLintHook({ settingsPath });
    return result.changed
      ? outcome(request.mutation, "applied", "written", `Merged dev-genie managed JSON settings into ${request.mutation.target_path}.`, {
        action: result.action,
        path: result.path,
      })
      : outcome(request.mutation, "skipped", "already_satisfied", `${request.mutation.target_path} already contains the dev-genie managed JSON settings.`, {
        action: result.action,
        path: result.path,
      });
  }

  async writeFullFile(request: FullFileWriteRequest): Promise<ReconciliationOutcome> {
    const blocked = await this.lockedOutcome(request, request.lock);
    if (blocked !== null) {
      return blocked;
    }
    const dryRun = await this.dryRunOutcome(request);
    if (dryRun !== null) {
      return dryRun;
    }

    const auditOptions = request.components === undefined ? {} : { components: request.components };
    const result = await this.dependencies.installAudit(request.workspaceRoot, auditOptions);
    if (result.errors.length > 0) {
      return outcome(request.mutation, "blocked", "delegated_skip", "dev-genie audit reconciler reported errors.", {
        changed: jsonArray(result.changed),
        skipped: jsonArray(result.skipped),
        errors: jsonArray(result.errors),
      });
    }
    return result.changed.length > 0
      ? outcome(request.mutation, "applied", "written", "Delegated audit reconciliation to dev-genie audit writer.", {
        changed: jsonArray(result.changed),
        skipped: jsonArray(result.skipped),
      })
      : outcome(request.mutation, "skipped", "already_satisfied", "dev-genie audit reconciliation was already satisfied.", {
        changed: [],
        skipped: jsonArray(result.skipped),
      });
  }

  async recordLastRun(request: LastRunWriteRequest): Promise<ReconciliationOutcome> {
    if (request.dryRun === true) {
      return outcome(request.mutation, "skipped", "delegated_skip", "Dry run: dev-genie last-run record was not written.", {
        dry_run: true,
        target_path: ".dev-genie/init.last-run.json",
      });
    }

    const gitignoreChanged = await this.dependencies.ensureGitignore(request.workspaceRoot);
    const payload: {
      plan?: readonly unknown[];
      applied?: readonly unknown[];
      skipped?: readonly unknown[];
      errors?: readonly unknown[];
      extra?: Readonly<Record<string, unknown>>;
    } = {};
    if (request.plan !== undefined) {
      payload.plan = request.plan;
    }
    if (request.applied !== undefined) {
      payload.applied = request.applied;
    }
    if (request.skipped !== undefined) {
      payload.skipped = request.skipped;
    }
    if (request.errors !== undefined) {
      payload.errors = request.errors;
    }
    if (request.extra !== undefined) {
      payload.extra = request.extra;
    }
    const record = await this.dependencies.saveLastRun(request.workspaceRoot, payload);
    return outcome(request.mutation, "applied", "written", "Delegated last-run persistence to dev-genie plan-store.", {
      gitignore_changed: gitignoreChanged,
      record: jsonValue(record),
    });
  }

  private async lockedOutcome(
    request: ManagedWriterRequest,
    explicitLock: ManagedTargetLock | undefined,
  ): Promise<ReconciliationOutcome | null> {
    const lock = explicitLock ?? await this.findLock(request);
    if (lock === null) {
      return null;
    }
    return outcome(
      request.mutation,
      "blocked",
      "lock_blocked",
      `${request.mutation.target_path} is locked by dev-genie agent-config policy; write was not attempted.`,
      lockDetail(lock),
    );
  }

  private async dryRunOutcome(request: ManagedWriterRequest): Promise<ReconciliationOutcome | null> {
    if (request.dryRun !== true) {
      return null;
    }
    const result = await this.dependencies.applyFindings({
      repoPath: request.workspaceRoot,
      archId: "installer",
      findings: [findingForMutation(request.mutation)],
      mode: "dry-run",
    });
    return outcome(request.mutation, "skipped", "delegated_skip", `Dry run: delegated dev-genie apply mode for ${request.mutation.target}.`, {
      dry_run: true,
      applied: jsonArray(result.applied),
      skipped: jsonArray(result.skipped),
      errors: jsonArray(result.errors),
    });
  }
}

export function createDefaultDependencies(devGenieRoot: string): DevGenieWriterDependencies {
  return {
    writeAgentBlock(filePath, body) {
      const mod = requiredModule(join(devGenieRoot, "lib", "agent-config-writer.js"));
      return normalizeAgentBlockResult(callFunction(mod, "writeAgentBlock", filePath, body));
    },
    writeLayeredEslintConfig(repoPath, rules, opts) {
      const mod = requiredModule(join(devGenieRoot, "lib", "eslint-layered-writer.js"));
      return normalizeLayeredResult(callFunction(mod, "writeLayeredEslintConfig", repoPath, rules, opts ?? {}));
    },
    async mergeEditLintHook(opts) {
      const mod = await importedModule(join(devGenieRoot, "lib", "claude-settings-merger.mjs"));
      return normalizeSettingsResult(callFunction(mod, "mergeEditLintHook", opts));
    },
    async installAudit(repoPath, opts) {
      const mod = requiredModule(join(devGenieRoot, "lib", "audit-reconcile.js"));
      return normalizeAuditResult(await callFunction(mod, "installAudit", repoPath, opts ?? {}));
    },
    async applyFindings(opts) {
      const mod = requiredModule(join(devGenieRoot, "lib", "apply-flow.js"));
      return normalizeApplyFindingsResult(await callFunction(mod, "applyFindings", opts));
    },
    async findLockForFinding(repoPath, finding) {
      const mod = requiredModule(join(devGenieRoot, "lib", "apply-flow.js"));
      return await callFunction(mod, "findLockForFinding", repoPath, finding);
    },
    saveLastRun(repoPath, payload) {
      const mod = requiredModule(join(devGenieRoot, "lib", "plan-store.js"));
      return callFunction(mod, "saveLastRun", repoPath, payload ?? {});
    },
    ensureGitignore(repoPath) {
      const mod = requiredModule(join(devGenieRoot, "lib", "plan-store.js"));
      const result = callFunction(mod, "ensureGitignore", repoPath);
      return result === true;
    },
    beginMarker: "<!-- dev-genie:guardrails:begin -->",
    endMarker: "<!-- dev-genie:guardrails:end -->",
  };
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

function workspacePath(workspaceRoot: string, targetPath: string): string {
  return isAbsolute(targetPath) ? targetPath : join(workspaceRoot, targetPath);
}

function readCurrentRegion(filePath: string, beginMarker: string, endMarker: string): string | null {
  if (!existsSync(filePath)) {
    return null;
  }
  const raw = readFileSync(filePath, "utf8");
  const begin = raw.indexOf(beginMarker);
  if (begin === -1) {
    return null;
  }
  const contentStart = begin + beginMarker.length;
  const end = raw.indexOf(endMarker, contentStart);
  if (end === -1) {
    return null;
  }
  return raw.slice(contentStart, end).replace(/^\r?\n/, "").replace(/\r?\n$/, "");
}

function findingForMutation(mutation: InstallPlanMutation): Readonly<Record<string, unknown>> {
  return {
    id: mutation.mutation_id,
    category: categoryForMutation(mutation),
    key: mutation.target,
    status: mutation.action === "skip" ? "present" : mutation.reason_code,
    severity: "recommended",
    diff: {
      kind: diffKindForMutation(mutation),
      target: mutation.target_path,
      value: mutation.target,
    },
  };
}

function categoryForMutation(mutation: InstallPlanMutation): string {
  if (mutation.source_writer === "dev-genie:eslint-layered") {
    return "eslint";
  }
  if (mutation.source_writer === "dev-genie:audit") {
    return "audit";
  }
  if (mutation.source_writer === "dev-genie:claude-settings") {
    return "settings";
  }
  return "agent-config";
}

function diffKindForMutation(mutation: InstallPlanMutation): string {
  return mutation.write_strategy === "json_merge" ? "json-patch" : "ensure";
}

function normalizeLock(rawLock: unknown, targetPath: string): ManagedTargetLock | null {
  if (!isRecord(rawLock)) {
    return null;
  }
  const pattern = stringField(rawLock, "pattern");
  const reason = stringField(rawLock, "reason");
  if (pattern === null || reason === null) {
    return null;
  }
  return {
    pattern,
    reason,
    target_path: targetPath,
    ...(stringField(rawLock, "agentFile") === null ? {} : { agent_file: stringField(rawLock, "agentFile") ?? "" }),
    ...(numberField(rawLock, "sourceLine") === null ? {} : { source_line: numberField(rawLock, "sourceLine") ?? 0 }),
  };
}

function lockDetail(lock: ManagedTargetLock): ReconciliationDetail {
  return {
    pattern: lock.pattern,
    reason: lock.reason,
    target_path: lock.target_path,
    ...(lock.agent_file === undefined ? {} : { agent_file: lock.agent_file }),
    ...(lock.source_line === undefined ? {} : { source_line: lock.source_line }),
  };
}

function resolveDevGenieRoot(explicitRoot: string | undefined): string {
  if (explicitRoot !== undefined) {
    return explicitRoot;
  }
  const candidates = [
    resolve(process.cwd(), "dev-genie"),
    resolve(process.cwd(), "..", "dev-genie"),
    resolve(here, "../../../../dev-genie"),
    resolve(here, "../../dev-genie"),
  ];
  const found = candidates.find((candidate) => existsSync(join(candidate, "lib", "agent-config-writer.js")));
  if (found !== undefined) {
    return found;
  }
  return resolve(process.cwd(), "dev-genie");
}

function requiredModule(modulePath: string): Record<string, unknown> {
  const loaded: unknown = requireModule(modulePath);
  if (!isRecord(loaded)) {
    throw new Error(`Expected object module from ${modulePath}`);
  }
  return loaded;
}

async function importedModule(modulePath: string): Promise<Record<string, unknown>> {
  const loaded: unknown = await import(pathToFileURL(modulePath).href);
  if (!isRecord(loaded)) {
    throw new Error(`Expected object module from ${modulePath}`);
  }
  return loaded;
}

function callFunction(moduleRecord: Record<string, unknown>, exportName: string, ...args: readonly unknown[]): unknown {
  const fn = moduleRecord[exportName];
  if (typeof fn !== "function") {
    throw new Error(`Expected ${exportName} export to be callable.`);
  }
  return fn(...args);
}

function normalizeAgentBlockResult(raw: unknown): AgentBlockResult {
  if (!isRecord(raw)) {
    throw new Error("writeAgentBlock returned a non-object result.");
  }
  return {
    ok: raw.ok === true,
    changed: raw.changed === true,
    action: stringField(raw, "action") ?? "unknown",
  };
}

function normalizeLayeredResult(raw: unknown): LayeredEslintResult {
  if (!isRecord(raw)) {
    throw new Error("writeLayeredEslintConfig returned a non-object result.");
  }
  const path = stringField(raw, "path");
  const fallbackReason = stringField(raw, "fallbackReason");
  return {
    ok: raw.ok === true,
    mode: stringField(raw, "mode") ?? "unknown",
    ...(path === null ? {} : { path }),
    ...(fallbackReason === null ? {} : { fallbackReason }),
    ...(typeof raw.rewroteEntryPoint === "boolean" ? { rewroteEntryPoint: raw.rewroteEntryPoint } : {}),
  };
}

function normalizeSettingsResult(raw: unknown): ClaudeSettingsMergeResult {
  if (!isRecord(raw)) {
    throw new Error("mergeEditLintHook returned a non-object result.");
  }
  return {
    action: stringField(raw, "action") ?? "unknown",
    changed: raw.changed === true,
    path: stringField(raw, "path") ?? "",
  };
}

function normalizeAuditResult(raw: unknown): AuditInstallResult {
  if (!isRecord(raw)) {
    throw new Error("installAudit returned a non-object result.");
  }
  return {
    changed: arrayField(raw, "changed"),
    skipped: arrayField(raw, "skipped"),
    errors: arrayField(raw, "errors"),
  };
}

function normalizeApplyFindingsResult(raw: unknown): ApplyFindingsResult {
  if (!isRecord(raw)) {
    throw new Error("applyFindings returned a non-object result.");
  }
  return {
    applied: arrayField(raw, "applied"),
    skipped: arrayField(raw, "skipped"),
    errors: arrayField(raw, "errors"),
  };
}

function detailFromRecord(record: Readonly<Record<string, unknown>>): ReconciliationDetail {
  const detail: ReconciliationDetail = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) {
      detail[key] = jsonValue(value);
    }
  }
  return detail;
}

function jsonArray(values: readonly unknown[]): ReconciliationJsonValue[] {
  return values.map(jsonValue);
}

function jsonValue(value: unknown): ReconciliationJsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(jsonValue);
  }
  if (isRecord(value)) {
    return detailFromRecord(value);
  }
  return String(value);
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
