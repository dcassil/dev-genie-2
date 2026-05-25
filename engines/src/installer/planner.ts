import type { InstallPlan } from "protocol";

import type { DesiredState, RepoState } from "./engine.js";

export const INSTALL_PLAN_VERSION = "1.0.0";

export function planInstall(
  state: RepoState,
  _desired: DesiredState,
  engineVersion: string,
): InstallPlan {
  return {
    plan_version: INSTALL_PLAN_VERSION,
    engine_version: engineVersion,
    repo_classification: state.repo_classification,
    mutations: [],
  };
}
