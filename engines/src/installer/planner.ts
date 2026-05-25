import type {
  InstallPlan,
  InstallPlanAction,
  InstallPlanMutation,
  InstallPlanReasonCode,
  InstallSourceWriter,
  InstallWriteStrategy,
} from "protocol";

import type {
  DesiredConfigTarget,
  DesiredPlugin,
  DetectedManagedRegionPresence,
  RepoState,
  DesiredState,
} from "./engine.js";

export const INSTALL_PLAN_VERSION = "1.0.0";
export const INSTALLER_ENGINE_VERSION = "0.8.0";

type ExistingFindingStatus = NonNullable<DesiredConfigTarget["status"]>;

interface PlanTarget {
  readonly target: string;
  readonly target_path: string;
  readonly required: boolean;
  readonly source: "config" | "plugin";
  readonly plugin_id?: string;
  readonly status?: ExistingFindingStatus;
  readonly desired_content?: string;
  readonly baseline_content?: string;
}

interface TargetWriterSpec {
  readonly write_strategy: InstallWriteStrategy;
  readonly source_writer: InstallSourceWriter;
  readonly managed_marker: string | null;
}

interface MutationDecision {
  readonly action: InstallPlanAction;
  readonly reason_code: InstallPlanReasonCode;
}

const DEV_GENIE_GUARDRAILS_MARKER = "<!-- dev-genie:guardrails:begin/end -->";
const DEV_GENIE_GUARDRAILS_BEGIN = "<!-- dev-genie:guardrails:begin -->";
const KATANA_MARKER = "<!-- katana:begin/end -->";

const GREENFIELD_PLUGIN_ORDER = ["guardrails", "audit", "katana", "daimyo", "dev-genie"];

const GREENFIELD_TARGET_PRECEDENCE: Readonly<Record<string, number>> = {
  "agent-config-guardrails": 10,
  "dev-genie:guardrails": 10,
  "eslint-managed-layer": 20,
  "claude-settings-hooks": 30,
  "audit-baseline": 40,
  "katana:claude-code": 80,
  "daimyo:claude-code": 90,
};

const EXISTING_TARGET_PRECEDENCE: Readonly<Record<string, number>> = {
  "agent-config-guardrails": 10,
  "dev-genie:guardrails": 10,
  "eslint-managed-layer": 20,
  "claude-settings-hooks": 30,
  "audit-baseline": 40,
  "katana:claude-code": 50,
  "daimyo:claude-code": 60,
};

export function plan(
  state: RepoState,
  desired: DesiredState,
): InstallPlan {
  return planInstall(state, desired, INSTALLER_ENGINE_VERSION);
}

export function planInstall(
  state: RepoState,
  desired: DesiredState,
  engineVersion: string = INSTALLER_ENGINE_VERSION,
): InstallPlan {
  const targets = state.repo_classification === "greenfield"
    ? greenfieldTargets(desired)
    : existingRepoTargets(desired);
  const mutations = uniqueTargets(targets)
    .map((target) => buildMutation(state, target))
    .sort((left, right) => compareMutations(state, left, right));

  return {
    plan_version: INSTALL_PLAN_VERSION,
    engine_version: engineVersion,
    repo_classification: state.repo_classification,
    mutations,
  };
}

function greenfieldTargets(desired: DesiredState): readonly PlanTarget[] {
  const targets: PlanTarget[] = [];
  for (const pluginId of GREENFIELD_PLUGIN_ORDER) {
    const desiredPlugin = desired.plugins.find((plugin) => plugin.plugin_id === pluginId);
    if (desiredPlugin !== undefined) {
      const pluginTarget = planTargetForPlugin(desiredPlugin);
      if (pluginTarget !== null) {
        targets.push(pluginTarget);
      }
    }
  }

  const remainingPlugins = desired.plugins
    .filter((plugin) => !GREENFIELD_PLUGIN_ORDER.includes(plugin.plugin_id))
    .sort((left, right) => left.plugin_id.localeCompare(right.plugin_id));
  for (const plugin of remainingPlugins) {
    const pluginTarget = planTargetForPlugin(plugin);
    if (pluginTarget !== null) {
      targets.push(pluginTarget);
    }
  }

  targets.push(...desired.configs.map(planTargetForConfig));
  return targets;
}

function existingRepoTargets(desired: DesiredState): readonly PlanTarget[] {
  return [
    ...desired.configs.map(planTargetForConfig),
    ...desired.plugins
      .slice()
      .sort((left, right) => left.plugin_id.localeCompare(right.plugin_id))
      .map(planTargetForPlugin)
      .filter(isPlanTarget),
  ];
}

function planTargetForConfig(config: DesiredConfigTarget): PlanTarget {
  const target: PlanTarget = {
    target: config.target,
    target_path: config.target_path,
    required: config.required,
    source: "config",
    ...(config.status === undefined ? {} : { status: config.status }),
    ...(config.desired_content === undefined ? {} : { desired_content: config.desired_content }),
    ...(config.baseline_content === undefined ? {} : { baseline_content: config.baseline_content }),
  };
  return target;
}

function planTargetForPlugin(plugin: DesiredPlugin): PlanTarget | null {
  if (!plugin.enabled) {
    return null;
  }

  if (plugin.plugin_id === "guardrails") {
    return {
      target: "agent-config-guardrails",
      target_path: "CLAUDE.md",
      required: true,
      source: "plugin",
      plugin_id: plugin.plugin_id,
    };
  }

  if (plugin.plugin_id === "audit") {
    return {
      target: "audit-baseline",
      target_path: ".audit/audit.config.json",
      required: true,
      source: "plugin",
      plugin_id: plugin.plugin_id,
    };
  }

  if (plugin.plugin_id === "katana") {
    return {
      target: "katana:claude-code",
      target_path: ".mcp.json",
      required: true,
      source: "plugin",
      plugin_id: plugin.plugin_id,
    };
  }

  if (plugin.plugin_id === "daimyo") {
    return {
      target: "daimyo:claude-code",
      target_path: ".mcp.json",
      required: true,
      source: "plugin",
      plugin_id: plugin.plugin_id,
    };
  }

  if (plugin.plugin_id === "dev-genie") {
    return {
      target: "dev-genie:guardrails",
      target_path: "CLAUDE.md",
      required: true,
      source: "plugin",
      plugin_id: plugin.plugin_id,
    };
  }

  return null;
}

function isPlanTarget(target: PlanTarget | null): target is PlanTarget {
  return target !== null;
}

function uniqueTargets(targets: readonly PlanTarget[]): readonly PlanTarget[] {
  const byKey = new Map<string, PlanTarget>();
  for (const target of targets) {
    if (!target.required) {
      continue;
    }
    byKey.set(`${target.target}\u0000${target.target_path}`, mergeTarget(byKey.get(`${target.target}\u0000${target.target_path}`), target));
  }
  return [...byKey.values()];
}

function mergeTarget(previous: PlanTarget | undefined, next: PlanTarget): PlanTarget {
  if (previous === undefined) {
    return next;
  }
  return {
    ...previous,
    ...next,
    source: previous.source === "config" ? previous.source : next.source,
    ...(previous.plugin_id === undefined ? {} : { plugin_id: previous.plugin_id }),
  };
}

function buildMutation(state: RepoState, target: PlanTarget): InstallPlanMutation {
  const writer = writerSpecForTarget(target);
  const decision = decisionForTarget(state, target, writer);
  return {
    mutation_id: mutationId(target.target),
    target: target.target,
    target_path: target.target_path,
    action: decision.action,
    write_strategy: writer.write_strategy,
    managed_marker: writer.managed_marker,
    reason_code: decision.reason_code,
    rationale: rationaleForDecision(target, decision),
    source_writer: writer.source_writer,
  };
}

function decisionForTarget(
  state: RepoState,
  target: PlanTarget,
  writer: TargetWriterSpec,
): MutationDecision {
  const statusDecision = decisionForStatus(target.status);
  const baseDecision = statusDecision ?? decisionFromState(state, target, writer);
  if (baseDecision.action === "skip") {
    return baseDecision;
  }
  if (isTargetLocked(state, target.target_path)) {
    return {
      action: baseDecision.action,
      reason_code: "locked",
    };
  }
  return baseDecision;
}

function decisionForStatus(status: ExistingFindingStatus | undefined): MutationDecision | null {
  if (status === undefined) {
    return null;
  }
  if (status === "present") {
    return {
      action: "skip",
      reason_code: "already_satisfied",
    };
  }
  if (status === "weaker") {
    return {
      action: "update",
      reason_code: "stale",
    };
  }
  if (status === "conflicting") {
    return {
      action: "update",
      reason_code: "conflicting",
    };
  }
  return {
    action: "create",
    reason_code: "missing",
  };
}

function decisionFromState(
  state: RepoState,
  target: PlanTarget,
  writer: TargetWriterSpec,
): MutationDecision {
  if (!isTargetPresent(state, target, writer)) {
    return {
      action: "create",
      reason_code: "missing",
    };
  }

  const region = managedRegionForTarget(state, target, writer);
  if (region?.region !== null && region?.region !== undefined && target.baseline_content !== undefined && region.region.content !== target.baseline_content) {
    return {
      action: "update",
      reason_code: "conflicting",
    };
  }

  if (target.desired_content !== undefined && region?.region !== null && region?.region !== undefined && region.region.content !== target.desired_content) {
    return {
      action: "update",
      reason_code: "stale",
    };
  }

  return {
    action: "skip",
    reason_code: "already_satisfied",
  };
}

function isTargetPresent(
  state: RepoState,
  target: PlanTarget,
  writer: TargetWriterSpec,
): boolean {
  if (target.source === "plugin" && target.plugin_id !== undefined) {
    return pluginPresent(state, target.plugin_id);
  }
  if (writer.write_strategy === "managed_region") {
    return managedRegionForTarget(state, target, writer)?.present === true;
  }
  if (writer.source_writer === "dev-genie:eslint-layered") {
    return pluginSignalPresent(state, "guardrails", "eslint.config.guardrails.mjs");
  }
  if (writer.source_writer === "dev-genie:claude-settings") {
    return pluginSignalPresent(state, "guardrails", ".claude/settings.json");
  }
  if (writer.source_writer === "dev-genie:audit") {
    return state.detection_report.audit.hasBaseline || state.detection_report.audit.found;
  }
  if (target.target === "katana:claude-code") {
    return pluginPresent(state, "katana");
  }
  if (target.target === "daimyo:claude-code") {
    return pluginPresent(state, "daimyo");
  }
  return false;
}

function pluginPresent(state: RepoState, pluginId: string): boolean {
  return state.plugins.some((plugin) => plugin.plugin_id === pluginId && plugin.present);
}

function pluginSignalPresent(state: RepoState, pluginId: string, path: string): boolean {
  return state.plugins.some((plugin) => {
    return plugin.plugin_id === pluginId
      && plugin.signals.some((signal) => signal.path === path);
  });
}

function managedRegionForTarget(
  state: RepoState,
  target: PlanTarget,
  writer: TargetWriterSpec,
): DetectedManagedRegionPresence | undefined {
  return state.managed_regions.find((region) => {
    return region.target_path === target.target_path
      && (region.target === target.target
        || region.managed_marker === writer.managed_marker
        || markerAliasesMatch(region.managed_marker, writer.managed_marker));
  });
}

function markerAliasesMatch(regionMarker: string, writerMarker: string | null): boolean {
  return writerMarker === DEV_GENIE_GUARDRAILS_MARKER
    ? regionMarker === DEV_GENIE_GUARDRAILS_BEGIN
    : regionMarker === writerMarker;
}

function isTargetLocked(state: RepoState, targetPath: string): boolean {
  return state.locks.some((lock) => lockMatchesTarget(lock.pattern, targetPath));
}

function lockMatchesTarget(pattern: string, targetPath: string): boolean {
  const normalizedPattern = trimSlashes(pattern);
  const normalizedTarget = trimSlashes(targetPath);
  if (normalizedPattern === normalizedTarget) {
    return true;
  }
  if (normalizedPattern.includes("*")) {
    return wildcardMatches(normalizedPattern, normalizedTarget);
  }
  return normalizedTarget.endsWith(`/${normalizedPattern}`);
}

function wildcardMatches(pattern: string, value: string): boolean {
  const parts = pattern.split("*");
  let position = 0;
  const first = parts[0] ?? "";
  if (first.length > 0 && !value.startsWith(first)) {
    return false;
  }
  position = first.length;

  for (let index = 1; index < parts.length; index += 1) {
    const part = parts[index] ?? "";
    if (part.length === 0) {
      continue;
    }
    const found = value.indexOf(part, position);
    if (found === -1) {
      return false;
    }
    position = found + part.length;
  }

  const last = parts[parts.length - 1] ?? "";
  return last.length === 0 || value.endsWith(last);
}

function trimSlashes(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === "/") {
    start += 1;
  }
  while (end > start && value[end - 1] === "/") {
    end -= 1;
  }
  return value.slice(start, end);
}

function writerSpecForTarget(target: PlanTarget): TargetWriterSpec {
  if (target.target === "eslint-managed-layer" || target.target.includes("eslint")) {
    return {
      write_strategy: "layered",
      source_writer: "dev-genie:eslint-layered",
      managed_marker: null,
    };
  }

  if (target.target === "claude-settings-hooks" || target.target_path === ".claude/settings.json") {
    return {
      write_strategy: "json_merge",
      source_writer: "dev-genie:claude-settings",
      managed_marker: null,
    };
  }

  if (target.target === "audit-baseline" || target.target.startsWith("audit")) {
    return {
      write_strategy: "full_file",
      source_writer: "dev-genie:audit",
      managed_marker: null,
    };
  }

  if (target.target === "katana:claude-code" || target.target === "daimyo:claude-code" || target.target_path === ".mcp.json") {
    return {
      write_strategy: "delegated",
      source_writer: "katana:platform",
      managed_marker: KATANA_MARKER,
    };
  }

  return {
    write_strategy: "managed_region",
    source_writer: "dev-genie:agent-config",
    managed_marker: DEV_GENIE_GUARDRAILS_MARKER,
  };
}

function compareMutations(
  state: RepoState,
  left: InstallPlanMutation,
  right: InstallPlanMutation,
): number {
  const precedence = state.repo_classification === "greenfield"
    ? GREENFIELD_TARGET_PRECEDENCE
    : EXISTING_TARGET_PRECEDENCE;
  const leftPrecedence = precedence[left.target] ?? 1_000;
  const rightPrecedence = precedence[right.target] ?? 1_000;
  if (leftPrecedence !== rightPrecedence) {
    return leftPrecedence - rightPrecedence;
  }
  return left.mutation_id.localeCompare(right.mutation_id);
}

function mutationId(target: string): string {
  const normalized = target
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.length === 0 ? "mutation:target" : `mutation:${normalized}`;
}

function rationaleForDecision(target: PlanTarget, decision: MutationDecision): string {
  const subject = `${target.target} at ${target.target_path}`;
  if (decision.reason_code === "missing") {
    return `${subject} is absent from the detected repo state, so the installer plans a create mutation.`;
  }
  if (decision.reason_code === "stale") {
    return `${subject} is present but does not match the desired managed content, so the installer plans an update mutation.`;
  }
  if (decision.reason_code === "already_satisfied") {
    return `${subject} already satisfies the desired installer state, so the installer plans a skip mutation.`;
  }
  if (decision.reason_code === "conflicting") {
    return `${subject} has a managed region that diverged from the recorded baseline, so the installer plans an update for conflict-aware apply.`;
  }
  return `${subject} is locked by the detected repo state, so the installer emits the mutation for a blocked apply outcome.`;
}
