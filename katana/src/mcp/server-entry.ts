import { startServer } from "./server.js";

const root = process.env.KATANA_WORKSPACE ?? process.cwd();
startServer({ workspaceRoot: root }).catch((e) => {
  console.error(e);
  process.exit(1);
});
