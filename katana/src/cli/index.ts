import { run_board_command } from "./board.js";
import type { BoardCommandArgs, BoardCommandDeps } from "./board.js";
import { runInstall } from "./install.js";
import type { InstallCommandDeps } from "./install.js";
import type { InternalBoardDeps } from "../board/internal-deps.js";

export interface CLIContext {
  workspace_root: string;
  internal_deps: InternalBoardDeps;
}

export async function handle_board_command(
  args: Partial<BoardCommandArgs>,
  context: CLIContext,
): Promise<number> {
  const deps: BoardCommandDeps = {
    internal_deps: context.internal_deps,
    stdout: (s: string) => process.stdout.write(s),
  };

  return run_board_command(
    {
      backend: args.backend ?? "internal",
      level: args.level,
      parent: args.parent,
      include_archived: args.include_archived ?? false,
      hide_empty: args.hide_empty ?? false,
      workspace_root: context.workspace_root,
    },
    deps,
  );
}

export async function handle_install_command(argv: string[]): Promise<number> {
  const deps: InstallCommandDeps = {
    stdout: (s: string) => process.stdout.write(s),
    stderr: (s: string) => process.stderr.write(s),
  };

  return runInstall(argv, deps);
}

export { run_board_command, type BoardCommandArgs, type BoardCommandDeps } from "./board.js";
export { runInstall, type InstallCommandDeps } from "./install.js";
