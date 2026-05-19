import { test } from "vitest";
import type { BoardPort } from "../../src/board/port.js";
import { InternalBoardPort } from "../../src/board/internal.js";
import { ExternalStubBoardPort } from "../../src/board/external-stub.js";

// Type-level: both backends must be assignable to BoardPort. The cast itself
// is the check; if it doesn't compile, the file fails to typecheck.
test("BoardPort is implemented by both backends", () => {
  const _internal: BoardPort = new InternalBoardPort({} as never);
  const _external: BoardPort = new ExternalStubBoardPort({} as never);
  void _internal;
  void _external;
});
