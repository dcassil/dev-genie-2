import { basename, join } from "node:path";

import type {
  AgentConfigDetectionReport,
  AgentConfigLockDeclaration,
  AuditDetectionReport,
  CiDetectionReport,
  CiWorkflowDetection,
  DetectRepoStateOptions,
  DetectedManagedRegionPresence,
  DetectedPluginPresence,
  DetectionNotesSection,
  EslintDetectionReport,
  ExistingConfigDetectionReport,
  HooksDetectionReport,
  LastRunRecordReference,
  LockDeclaration,
  ManagedRegionBounds,
  PluginDetectionSignal,
  RepoState,
  TypescriptDetectionReport,
} from "./engine.js";
import type { FsReadPort } from "./ports.js";

const PLUGIN_IDS = ["dev-genie", "guardrails", "audit", "katana", "daimyo"] as const;
const ROOT_AGENT_CONFIGS = ["CLAUDE.md", "AGENTS.md", "GEMINI.md", ".windsurfrules"] as const;
const DEV_GENIE_FEATURES = ["guardrails"] as const;
const KATANA_BEGIN = "<!-- katana:begin -->";
const KATANA_END = "<!-- katana:end -->";
const LAST_RUN_PATH = ".dev-genie/init.last-run.json";
const MANAGED_GUARDRAILS_COMMAND = "guardrails/scripts/lint-edited-file.sh";

export async function detect(
  readPort: FsReadPort,
  options: DetectRepoStateOptions,
): Promise<RepoState> {
  const reader = new WorkspaceReader(readPort, options.workspaceRoot);
  const packageJson = await readJsonObject(reader, "package.json");
  const detectionReport = await detectExistingConfig(reader, options.workspaceRoot, packageJson);
  const managedRegions = await detectManagedRegions(reader, detectionReport.agentConfigs, options);
  const plugins = await detectPlugins(reader, detectionReport, managedRegions);
  const lastRun = await detectLastRun(reader);
  const locks = flattenLocks(detectionReport.agentConfigs);

  return {
    repo_classification: classifyRepo(detectionReport),
    plugins,
    managed_regions: managedRegions,
    locks,
    last_run: lastRun,
    detection_report: detectionReport,
  };
}

export async function detectRepoState(
  readPort: FsReadPort,
  options: DetectRepoStateOptions = { workspaceRoot: "." },
): Promise<RepoState> {
  return detect(readPort, options);
}

class WorkspaceReader {
  constructor(
    private readonly port: FsReadPort,
    private readonly workspaceRoot: string,
  ) {}

  async exists(relativePath: string): Promise<boolean> {
    try {
      return await this.port.exists(this.resolve(relativePath));
    } catch {
      return false;
    }
  }

  async readFile(relativePath: string): Promise<string | null> {
    try {
      return await this.port.readFile(this.resolve(relativePath));
    } catch {
      return null;
    }
  }

  async readDir(relativePath: string): Promise<readonly string[] | null> {
    try {
      const entries = await this.port.readDir(this.resolve(relativePath));
      return [...entries].sort();
    } catch {
      return null;
    }
  }

  private resolve(relativePath: string): string {
    if (relativePath === "." || relativePath === "") {
      return this.workspaceRoot;
    }
    return join(this.workspaceRoot, relativePath);
  }
}

async function detectExistingConfig(
  reader: WorkspaceReader,
  workspaceRoot: string,
  packageJson: UnknownObject | null,
): Promise<ExistingConfigDetectionReport> {
  return {
    repoPath: workspaceRoot,
    hasPackageJson: packageJson !== null,
    eslint: await detectEslint(reader, packageJson),
    typescript: await detectTypescript(reader),
    prettier: await detectPrettier(reader, packageJson),
    hooks: await detectHooks(reader),
    ci: await detectCi(reader),
    scripts: detectScripts(packageJson),
    packageScripts: extractPackageScripts(packageJson),
    audit: await detectAudit(reader),
    packageManager: await detectPackageManager(reader),
    agentConfigs: await detectAgentConfigs(reader),
  };
}

async function detectEslint(
  reader: WorkspaceReader,
  packageJson: UnknownObject | null,
): Promise<EslintDetectionReport> {
  const candidates = [
    "eslint.config.js",
    "eslint.config.mjs",
    "eslint.config.cjs",
    "eslint.config.ts",
    ".eslintrc",
    ".eslintrc.json",
    ".eslintrc.js",
    ".eslintrc.cjs",
    ".eslintrc.yaml",
    ".eslintrc.yml",
  ];
  const rootEntries = await reader.readDir(".");
  const files = uniqueSorted([
    ...(await existingPaths(reader, candidates)),
    ...(rootEntries ?? []).filter((entry) => entry.startsWith("eslint.config.")),
  ]);
  if (isUnknownObject(packageJson?.eslintConfig)) {
    files.push("package.json#eslintConfig");
  }

  const flat = files.some((file) => file.startsWith("eslint.config."));
  const legacy = files.some((file) => file.startsWith(".eslintrc"));
  const notes = flat && legacy
    ? "both flat and legacy eslint config detected"
    : flat
      ? "flat config"
      : legacy
        ? "legacy .eslintrc config (consider migration)"
        : files.includes("package.json#eslintConfig")
          ? "eslint config embedded in package.json"
          : "no eslint config found";

  return {
    found: files.length > 0,
    files,
    flat,
    legacy,
    notes,
  };
}

async function detectTypescript(reader: WorkspaceReader): Promise<TypescriptDetectionReport> {
  const entries = await reader.readDir(".");
  const files = (entries ?? [])
    .filter((entry) => /^tsconfig.*\.json$/.test(entry))
    .sort();

  return {
    found: files.length > 0,
    files,
    notes: files.length > 0 ? `${files.length} tsconfig file(s)` : "no tsconfig found",
  };
}

async function detectPrettier(
  reader: WorkspaceReader,
  packageJson: UnknownObject | null,
): Promise<DetectionNotesSection> {
  const files = await existingPaths(reader, [
    ".prettierrc",
    ".prettierrc.json",
    ".prettierrc.js",
    ".prettierrc.cjs",
    ".prettierrc.mjs",
    ".prettierrc.yaml",
    ".prettierrc.yml",
    ".prettierrc.toml",
    "prettier.config.js",
    "prettier.config.mjs",
    "prettier.config.cjs",
  ]);
  if (Object.prototype.hasOwnProperty.call(packageJson ?? {}, "prettier")) {
    files.push("package.json#prettier");
  }

  return {
    found: files.length > 0,
    files,
    notes: files.length > 0 ? "prettier configured" : "no prettier config",
  };
}

async function detectHooks(reader: WorkspaceReader): Promise<HooksDetectionReport> {
  const files: string[] = [];
  const notes: string[] = [];

  if (await reader.exists(".husky")) {
    files.push(".husky/");
    files.push(...await listFilesRecursive(reader, ".husky"));
    notes.push("husky");
  }

  for (const rel of ["lefthook.yml", "lefthook.yaml", ".pre-commit-config.yaml"]) {
    if (await reader.exists(rel)) {
      files.push(rel);
      notes.push(rel.startsWith("lefthook") ? "lefthook" : "pre-commit");
    }
  }

  if (await reader.exists(".git/hooks/pre-commit")) {
    files.push(".git/hooks/pre-commit");
    notes.push("raw git pre-commit hook");
  }

  const uniqueFiles = uniqueSorted(files);
  return {
    found: uniqueFiles.length > 0,
    husky: notes.includes("husky"),
    lefthook: notes.includes("lefthook"),
    nativePreCommit: notes.includes("raw git pre-commit hook"),
    preCommitFramework: notes.includes("pre-commit"),
    files: uniqueFiles,
    notes: notes.length > 0 ? uniqueSorted(notes).join(", ") : "no git hooks configured",
  };
}

async function detectCi(reader: WorkspaceReader): Promise<CiDetectionReport> {
  const workflows: CiWorkflowDetection[] = [];
  const workflowFiles = await listFilesRecursive(reader, ".github/workflows");

  for (const file of workflowFiles) {
    if (!/\.ya?ml$/i.test(file)) {
      continue;
    }
    const content = await reader.readFile(file);
    const runs = scanWorkflowForCommands(content ?? "");
    workflows.push({
      path: file,
      runsLint: runs.lint,
      runsTypecheck: runs.typecheck,
      runsAudit: runs.audit,
      runsBuild: runs.build,
    });
  }

  for (const rel of [".gitlab-ci.yml", ".circleci/config.yml"]) {
    if (await reader.exists(rel)) {
      const content = await reader.readFile(rel);
      const runs = scanWorkflowForCommands(content ?? "");
      workflows.push({
        path: rel,
        runsLint: runs.lint,
        runsTypecheck: runs.typecheck,
        runsAudit: runs.audit,
        runsBuild: runs.build,
      });
    }
  }

  workflows.sort((left, right) => left.path.localeCompare(right.path));
  const files = workflows.map((workflow) => workflow.path);

  return {
    found: files.length > 0,
    dir: ".github/workflows",
    workflows,
    anyRunsLint: workflows.some((workflow) => workflow.runsLint),
    anyRunsTypecheck: workflows.some((workflow) => workflow.runsTypecheck),
    anyRunsAudit: workflows.some((workflow) => workflow.runsAudit),
    anyRunsBuild: workflows.some((workflow) => workflow.runsBuild),
    files,
    notes: files.length > 0 ? "CI config found" : "no CI config found",
  };
}

function detectScripts(packageJson: UnknownObject | null): DetectionNotesSection {
  const scripts = extractPackageScripts(packageJson);
  const wanted = ["lint", "typecheck", "format", "test", "build", "audit"];
  const files: string[] = [];
  const present = new Set<string>();

  for (const scriptName of Object.keys(scripts).sort()) {
    for (const wantedName of wanted) {
      if (scriptName === wantedName || scriptName.startsWith(`${wantedName}:`)) {
        present.add(wantedName);
        files.push(`package.json#scripts.${scriptName}`);
      }
    }
  }

  return {
    found: files.length > 0,
    files,
    notes: present.size > 0
      ? `scripts present: ${[...present].sort().join(", ")}; missing: ${wanted.filter((name) => !present.has(name)).join(", ") || "none"}`
      : `none of [${wanted.join(", ")}] present`,
  };
}

async function detectAudit(reader: WorkspaceReader): Promise<AuditDetectionReport> {
  const hasDir = await reader.exists(".audit");
  const hasBaseline = await reader.exists(".audit/audit.config.json");
  const hookCandidates = [
    ".husky/pre-commit",
    ".git/hooks/pre-commit",
    "lefthook.yml",
    "lefthook.yaml",
    ".pre-commit-config.yaml",
  ];
  let hasHook = false;

  for (const hookPath of hookCandidates) {
    const content = await reader.readFile(hookPath);
    if (content !== null && /\baudit\b/.test(content)) {
      hasHook = true;
      break;
    }
  }

  if (!hasDir) {
    return {
      found: false,
      hasDir: false,
      hasBaseline: false,
      hasHook,
      files: [],
      notes: "no .audit/ directory",
    };
  }

  const files = await listFilesRecursive(reader, ".audit");
  return {
    found: true,
    hasDir,
    hasBaseline,
    hasHook,
    files,
    notes: `.audit/ present (${files.length} file(s)); baseline=${hasBaseline} hook=${hasHook}`,
  };
}

async function detectPackageManager(reader: WorkspaceReader): Promise<DetectionNotesSection> {
  const lockfiles: ReadonlyArray<readonly [string, string]> = [
    ["package-lock.json", "npm"],
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["bun.lockb", "bun"],
  ];
  const files: string[] = [];
  const managers: string[] = [];

  for (const [file, manager] of lockfiles) {
    if (await reader.exists(file)) {
      files.push(file);
      managers.push(manager);
    }
  }

  return {
    found: files.length > 0,
    files,
    notes: managers.length === 0
      ? "no lockfile found"
      : managers.length === 1
        ? `package manager: ${managers[0]}`
        : `multiple lockfiles: ${managers.join(", ")}`,
  };
}

async function detectAgentConfigs(reader: WorkspaceReader): Promise<readonly AgentConfigDetectionReport[]> {
  const paths: string[] = [];

  for (const rootConfig of ROOT_AGENT_CONFIGS) {
    if (await reader.exists(rootConfig)) {
      paths.push(rootConfig);
    }
  }

  paths.push(...await listFilesRecursive(reader, ".cursor/rules"));
  paths.push(...await listFilesRecursive(reader, ".claude"));

  const configs: AgentConfigDetectionReport[] = [];
  for (const relPath of uniqueSorted(paths).filter(isAgentConfigPath)) {
    const rawContent = await reader.readFile(relPath);
    if (rawContent === null) {
      continue;
    }
    configs.push({
      path: relPath,
      rawContent,
      rules: parseRules(rawContent),
      locks: parseLocks(rawContent),
    });
  }

  return configs.sort((left, right) => left.path.localeCompare(right.path));
}

async function detectManagedRegions(
  reader: WorkspaceReader,
  agentConfigs: readonly AgentConfigDetectionReport[],
  options: DetectRepoStateOptions,
): Promise<readonly DetectedManagedRegionPresence[]> {
  const targetPaths = uniqueSorted([
    ...ROOT_AGENT_CONFIGS,
    ...agentConfigs.map((config) => config.path),
    ...(options.desired?.configs.map((config) => config.target_path) ?? []),
  ]);
  const regions: DetectedManagedRegionPresence[] = [];

  for (const targetPath of targetPaths) {
    const content = await reader.readFile(targetPath);

    for (const feature of DEV_GENIE_FEATURES) {
      const begin = `<!-- dev-genie:${feature}:begin -->`;
      const end = `<!-- dev-genie:${feature}:end -->`;
      regions.push(buildRegionPresence({
        content,
        feature,
        markerKind: "dev-genie",
        target: `dev-genie:${feature}`,
        targetPath,
        begin,
        end,
      }));
    }

    regions.push(buildRegionPresence({
      content,
      markerKind: "katana",
      target: "katana:agent-doc",
      targetPath,
      begin: KATANA_BEGIN,
      end: KATANA_END,
    }));
  }

  return regions.sort((left, right) => `${left.target_path}:${left.managed_marker}`
    .localeCompare(`${right.target_path}:${right.managed_marker}`));
}

async function detectPlugins(
  reader: WorkspaceReader,
  report: ExistingConfigDetectionReport,
  managedRegions: readonly DetectedManagedRegionPresence[],
): Promise<readonly DetectedPluginPresence[]> {
  const mcpConfigs = await readMcpConfigSignals(reader);
  const managedHook = await hasManagedGuardrailsHook(reader);
  const plugins: DetectedPluginPresence[] = [];

  for (const pluginId of PLUGIN_IDS) {
    const signals: PluginDetectionSignal[] = [];
    const rootManifestPath = ".claude-plugin/plugin.json";
    const rootManifest = await readJsonObject(reader, rootManifestPath);

    if (pluginManifestName(rootManifest) === pluginId) {
      signals.push({
        kind: "claude_plugin_manifest",
        path: rootManifestPath,
        detail: pluginId,
      });
    }

    for (const manifestPath of [
      `${pluginId}/.claude-plugin/plugin.json`,
      `.claude/plugins/${pluginId}/plugin.json`,
    ]) {
      if (await reader.exists(manifestPath)) {
        signals.push({
          kind: "claude_plugin_manifest",
          path: manifestPath,
          detail: pluginId,
        });
      }
    }

    if (await reader.exists(pluginId)) {
      signals.push({
        kind: "marketplace_directory",
        path: pluginId,
      });
    }

    signals.push(...managedPluginSignals(pluginId, report, managedRegions, mcpConfigs, managedHook));

    if (pluginId === "dev-genie" && await reader.exists(LAST_RUN_PATH)) {
      signals.push({ kind: "managed_config", path: LAST_RUN_PATH });
    }
    if (pluginId === "guardrails" && await reader.exists("eslint.config.guardrails.mjs")) {
      signals.push({ kind: "managed_config", path: "eslint.config.guardrails.mjs" });
    }
    if (pluginId === "katana") {
      for (const path of [".katana/config.toml", ".katana/vision.md", ".katana/agents-manifest.json"]) {
        if (await reader.exists(path)) {
          signals.push({ kind: "managed_config", path });
        }
      }
    }

    const uniqueSignals = uniqueSignalsByKey(signals);
    const plugin: DetectedPluginPresence = {
      plugin_id: pluginId,
      present: uniqueSignals.length > 0,
      signals: uniqueSignals,
      ...(uniqueSignals[0] === undefined ? {} : { source_path: uniqueSignals[0].path }),
    };
    plugins.push(plugin);
  }

  return plugins;
}

function managedPluginSignals(
  pluginId: (typeof PLUGIN_IDS)[number],
  report: ExistingConfigDetectionReport,
  managedRegions: readonly DetectedManagedRegionPresence[],
  mcpConfigs: readonly PluginDetectionSignal[],
  managedHook: boolean,
): readonly PluginDetectionSignal[] {
  const signals: PluginDetectionSignal[] = [];

  if (pluginId === "dev-genie") {
    if (managedRegions.some((region) => region.marker_kind === "dev-genie" && region.present)) {
      signals.push({ kind: "managed_config", path: "agentConfigs", detail: "dev-genie managed region" });
    }
  }

  if (pluginId === "guardrails") {
    if (managedHook) {
      signals.push({ kind: "managed_config", path: ".claude/settings.json", detail: MANAGED_GUARDRAILS_COMMAND });
    }
    if (managedRegions.some((region) => region.marker_kind === "dev-genie" && region.feature === "guardrails" && region.present)) {
      signals.push({ kind: "managed_config", path: "agentConfigs", detail: "dev-genie:guardrails" });
    }
  }

  if (pluginId === "audit" && report.audit.found) {
    for (const file of report.audit.files.length > 0 ? report.audit.files : [".audit/"]) {
      signals.push({ kind: "managed_config", path: file });
    }
  }

  if (pluginId === "katana") {
    if (managedRegions.some((region) => region.marker_kind === "katana" && region.present)) {
      signals.push({ kind: "managed_config", path: "agentConfigs", detail: "katana marker" });
    }
    signals.push(...mcpConfigs.filter((signal) => signal.detail === "katana"));
  }

  if (pluginId === "daimyo") {
    signals.push(...mcpConfigs.filter((signal) => signal.detail === "daimyo"));
  }

  return signals;
}

async function readMcpConfigSignals(reader: WorkspaceReader): Promise<readonly PluginDetectionSignal[]> {
  const signals: PluginDetectionSignal[] = [];
  for (const path of [".mcp.json", ".cursor/mcp.json"]) {
    const raw = await reader.readFile(path);
    if (raw === null) {
      continue;
    }
    const parsed = parseJsonObject(raw);
    if (!isUnknownObject(parsed?.mcpServers)) {
      continue;
    }
    for (const server of ["katana", "daimyo"]) {
      if (Object.prototype.hasOwnProperty.call(parsed.mcpServers, server)) {
        signals.push({
          kind: "mcp_config",
          path,
          detail: server,
        });
      }
    }
  }
  return signals;
}

async function hasManagedGuardrailsHook(reader: WorkspaceReader): Promise<boolean> {
  const raw = await reader.readFile(".claude/settings.json");
  return raw !== null && raw.includes(MANAGED_GUARDRAILS_COMMAND);
}

async function detectLastRun(reader: WorkspaceReader): Promise<LastRunRecordReference | null> {
  const rawContent = await reader.readFile(LAST_RUN_PATH);
  if (rawContent === null) {
    return null;
  }

  const parsed = parseJsonObject(rawContent);
  return {
    path: LAST_RUN_PATH,
    rawContent,
    ...(typeof parsed?.schemaVersion === "number" ? { schemaVersion: parsed.schemaVersion } : {}),
    ...(typeof parsed?.timestamp === "string" ? { timestamp: parsed.timestamp } : {}),
    ...(typeof parsed?.repoFingerprint === "string" ? { repoFingerprint: parsed.repoFingerprint } : {}),
  };
}

function classifyRepo(report: ExistingConfigDetectionReport): "greenfield" | "existing" {
  const greenfield =
    !report.hasPackageJson
    && !report.eslint.files.some((file) => file.startsWith("eslint.config."))
    && !report.typescript.files.includes("tsconfig.json")
    && Object.keys(report.packageScripts).length === 0
    && !report.hooks.found;

  return greenfield ? "greenfield" : "existing";
}

function buildRegionPresence(options: {
  readonly content: string | null;
  readonly markerKind: "dev-genie" | "katana";
  readonly feature?: string;
  readonly target: string;
  readonly targetPath: string;
  readonly begin: string;
  readonly end: string;
}): DetectedManagedRegionPresence {
  const region = options.content === null
    ? null
    : findRegionBounds(options.content, options.begin, options.end);

  return {
    target: options.target,
    target_path: options.targetPath,
    managed_marker: options.begin,
    marker_kind: options.markerKind,
    present: region !== null,
    region,
    ...(options.feature === undefined ? {} : { feature: options.feature }),
  };
}

function findRegionBounds(content: string, begin: string, end: string): ManagedRegionBounds | null {
  const beginOffset = content.indexOf(begin);
  if (beginOffset === -1) {
    return null;
  }

  const contentStartOffset = beginOffset + begin.length + newlineWidthAfter(content, beginOffset + begin.length);
  const endOffset = content.indexOf(end, contentStartOffset);
  if (endOffset === -1) {
    return null;
  }

  const contentEndOffset = stripSingleTrailingNewline(content, contentStartOffset, endOffset);
  return {
    begin_offset: beginOffset,
    begin_line: lineForOffset(content, beginOffset),
    content_start_offset: contentStartOffset,
    content_start_line: lineForOffset(content, contentStartOffset),
    content_end_offset: contentEndOffset,
    content_end_line: lineForOffset(content, contentEndOffset),
    end_offset: endOffset,
    end_line: lineForOffset(content, endOffset),
    content: content.slice(contentStartOffset, contentEndOffset),
  };
}

function newlineWidthAfter(content: string, offset: number): number {
  if (content.slice(offset, offset + 2) === "\r\n") {
    return 2;
  }
  return content[offset] === "\n" ? 1 : 0;
}

function stripSingleTrailingNewline(content: string, startOffset: number, endOffset: number): number {
  if (endOffset > startOffset && content[endOffset - 1] === "\n") {
    return content[endOffset - 2] === "\r" ? endOffset - 2 : endOffset - 1;
  }
  return endOffset;
}

function lineForOffset(content: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (content[index] === "\n") {
      line += 1;
    }
  }
  return line;
}

function parseLocks(content: string): readonly AgentConfigLockDeclaration[] {
  const locks: AgentConfigLockDeclaration[] = [];
  const lines = content.split(/\r?\n/);
  const lockPatterns = [
    /\bdo\s+not\s+(?:modify|edit|change|touch|alter)\s+`([^`\n]+)`/i,
    /\bnever\s+(?:modify|edit|change|touch)\s+`([^`\n]+)`/i,
    /\bdon'?t\s+(?:modify|edit|change|touch)\s+`([^`\n]+)`/i,
    /\bdo\s+not\s+(?:modify|edit|change|touch|alter)\s+(\S+?)(?:[.,;:!]\s|\s|$)/i,
    /\bnever\s+(?:modify|edit|change|touch)\s+(\S+?)(?:[.,;:!]\s|\s|$)/i,
    /\bdon'?t\s+(?:modify|edit|change|touch)\s+(\S+?)(?:[.,;:!]\s|\s|$)/i,
    /`([^`\n]+)`\s+is\s+locked\b/i,
    /\b(\S+)\s+is\s+locked\b/i,
    /`([^`\n]+)`\s+(?:must|should)\s+not\s+be\s+(?:modified|edited|changed|touched)\b/i,
  ];

  for (const [index, line] of lines.entries()) {
    for (const pattern of lockPatterns) {
      const match = line.match(pattern);
      if (match?.[1] === undefined) {
        continue;
      }
      const raw = match[1].trim().replace(/^["'`]|["'`]$/g, "").replace(/[.,;:!?]+$/, "");
      if (raw.length === 0 || !/[./*]/.test(raw)) {
        continue;
      }
      locks.push({
        pattern: raw,
        reason: line.trim(),
        sourceLine: index + 1,
      });
      break;
    }
  }

  locks.push(...parseFencedLocks(content));
  return locks;
}

function parseFencedLocks(content: string): readonly AgentConfigLockDeclaration[] {
  const locks: AgentConfigLockDeclaration[] = [];
  const fencePattern = /```[a-zA-Z]*\n([\s\S]*?)```/g;
  let match = fencePattern.exec(content);

  while (match !== null) {
    const body = match[1] ?? "";
    const startLine = content.slice(0, match.index).split(/\r?\n/).length;
    const block = body.match(/locked\s*:\s*\n((?:\s*-\s*.+\n?)+)/);
    if (block?.[1] !== undefined) {
      for (const item of block[1].split(/\n/).map(cleanLockItem).filter(Boolean)) {
        locks.push({ pattern: item, reason: "fenced locked: block", sourceLine: startLine });
      }
    }

    const inline = body.match(/locked\s*:\s*\[([^\]]+)\]/);
    if (inline?.[1] !== undefined) {
      for (const item of inline[1].split(",").map(cleanLockItem).filter(Boolean)) {
        locks.push({ pattern: item, reason: "fenced locked: inline", sourceLine: startLine });
      }
    }
    match = fencePattern.exec(content);
  }

  return locks;
}

function cleanLockItem(item: string): string {
  return item.replace(/^\s*-\s*/, "").trim().replace(/^["']|["']$/g, "");
}

function parseRules(content: string): readonly string[] {
  const rules: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*[-*]\s+(.+)$/);
    if (match?.[1] !== undefined) {
      rules.push(match[1].trim());
    }
    if (rules.length >= 200) {
      break;
    }
  }
  return rules;
}

function flattenLocks(agentConfigs: readonly AgentConfigDetectionReport[]): readonly LockDeclaration[] {
  return agentConfigs.flatMap((agentConfig) => agentConfig.locks.map((lock) => ({
    pattern: lock.pattern,
    reason: lock.reason,
    sourceLine: lock.sourceLine,
    agentConfigPath: agentConfig.path,
  })));
}

async function existingPaths(reader: WorkspaceReader, candidates: readonly string[]): Promise<string[]> {
  const files: string[] = [];
  for (const candidate of candidates) {
    if (await reader.exists(candidate)) {
      files.push(candidate);
    }
  }
  return files;
}

async function listFilesRecursive(reader: WorkspaceReader, relativePath: string): Promise<string[]> {
  const entries = await reader.readDir(relativePath);
  if (entries === null) {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const childPath = relativePath === "." ? entry : `${relativePath}/${entry}`;
    const childEntries = await reader.readDir(childPath);
    if (childEntries !== null) {
      files.push(...await listFilesRecursive(reader, childPath));
      continue;
    }
    files.push(childPath);
  }

  return files.sort();
}

function isAgentConfigPath(path: string): boolean {
  return ROOT_AGENT_CONFIGS.includes(path as (typeof ROOT_AGENT_CONFIGS)[number])
    || /\.(md|mdc|markdown)$/i.test(path)
    || basename(path) === ".windsurfrules";
}

function scanWorkflowForCommands(text: string): Readonly<Record<"lint" | "typecheck" | "audit" | "build", boolean>> {
  const found = {
    lint: false,
    typecheck: false,
    audit: false,
    build: false,
  };
  const tools = ["npm run", "pnpm run", "pnpm", "yarn run", "yarn", "npx"];
  const targets: Readonly<Record<keyof typeof found, readonly string[]>> = {
    lint: ["lint"],
    typecheck: ["typecheck", "type-check", "tsc"],
    audit: ["audit"],
    build: ["build"],
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const lineMatch = rawLine.match(/^\s*(?:-\s*)?run\s*:\s*(.*)$/i);
    const command = (lineMatch?.[1] ?? rawLine).replace(/^['"]|['"]$/g, "").trim();
    if (command.length === 0) {
      continue;
    }

    for (const target of Object.keys(targets) as Array<keyof typeof targets>) {
      if (found[target]) {
        continue;
      }
      for (const name of targets[target]) {
        const toolPattern = new RegExp(`(^|[\\s;&|])(?:${tools.map(escapeRegex).join("|")})\\s+${escapeRegex(name)}(?:\\b|$)`);
        if (toolPattern.test(command)
          || (name === "tsc" && /(^|[\s;&|])tsc(\s|$)/.test(command))
          || (target === "lint" && /(^|[\s;&|])eslint(\s|$)/.test(command))) {
          found[target] = true;
          break;
        }
      }
    }
  }

  return found;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function readJsonObject(reader: WorkspaceReader, relativePath: string): Promise<UnknownObject | null> {
  const raw = await reader.readFile(relativePath);
  if (raw === null) {
    return null;
  }
  return parseJsonObject(raw);
}

function parseJsonObject(raw: string): UnknownObject | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isUnknownObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function extractPackageScripts(packageJson: UnknownObject | null): Readonly<Record<string, string>> {
  if (!isUnknownObject(packageJson?.scripts)) {
    return {};
  }

  const scripts: Record<string, string> = {};
  for (const [name, value] of Object.entries(packageJson.scripts).sort(([left], [right]) => left.localeCompare(right))) {
    if (typeof value === "string") {
      scripts[name] = value;
    }
  }
  return scripts;
}

function pluginManifestName(manifest: UnknownObject | null): string | null {
  return typeof manifest?.name === "string" ? manifest.name : null;
}

function uniqueSignalsByKey(signals: readonly PluginDetectionSignal[]): readonly PluginDetectionSignal[] {
  const byKey = new Map<string, PluginDetectionSignal>();
  for (const signal of signals) {
    byKey.set(`${signal.kind}:${signal.path}:${signal.detail ?? ""}`, signal);
  }
  return [...byKey.values()].sort((left, right) => `${left.kind}:${left.path}:${left.detail ?? ""}`
    .localeCompare(`${right.kind}:${right.path}:${right.detail ?? ""}`));
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

interface UnknownObject {
  readonly [key: string]: unknown;
}

function isUnknownObject(value: unknown): value is UnknownObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
