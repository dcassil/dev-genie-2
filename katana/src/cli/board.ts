import type { BoardPort, BoardFilter } from "../board/port.js";
import { InternalBoardPort } from "../board/internal.js";
import { ExternalStubBoardPort } from "../board/external-stub.js";
import { render_markdown } from "../board/render-markdown.js";
import type { InternalBoardDeps } from "../board/internal-deps.js";

export interface BoardCommandArgs {
  backend?: "internal" | "external-stub"; // default: "internal"
  level?: BoardFilter["level"];
  parent?: string;
  include_archived?: boolean;
  hide_empty?: boolean;
  workspace_root: string;                  // resolved from cwd by caller
}

export interface BoardCommandDeps {
  internal_deps: InternalBoardDeps; // factory wires this from storage layer
  stdout: (s: string) => void;      // injected for tests
}

export async function run_board_command(
  args: BoardCommandArgs,
  deps: BoardCommandDeps,
): Promise<number> {
  const backend_name = args.backend ?? "internal";
  let port: BoardPort;
  if (backend_name === "internal") {
    port = new InternalBoardPort(deps.internal_deps, {
      workspace_root: args.workspace_root,
    });
  } else if (backend_name === "external-stub") {
    port = new ExternalStubBoardPort({ workspace_root: args.workspace_root });
  } else {
    throw new Error(`unknown backend: ${backend_name}`);
  }

  const snapshot = await port.list_board({
    level: args.level,
    parent: args.parent as never,
    include_archived: args.include_archived ?? false,
  });
  const md = render_markdown(snapshot, {
    hide_empty_columns: args.hide_empty ?? false,
    heading: `Katana Board (${port.backend})`,
  });
  deps.stdout(md);
  return 0;
}
