import { startServer } from "./server.js";

startServer().catch((error: Error) => {
  console.error(error);
  process.exit(1);
});
