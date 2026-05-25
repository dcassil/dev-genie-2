import type { FsReadPort } from "./ports.js";
import type { RepoState } from "./engine.js";

export async function detectRepoState(readPort: FsReadPort): Promise<RepoState> {
  const rootExists = await readPort.exists(".");

  return {
    repo_classification: rootExists ? "existing" : "greenfield",
    plugins: [],
    managed_regions: [],
    locks: [],
    last_run: null,
  };
}
