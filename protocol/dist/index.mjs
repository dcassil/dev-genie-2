// src/index.ts
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
var require2 = createRequire(import.meta.url);
function resolveProtocolSchemaDir() {
  const packageJsonPath = require2.resolve("protocol/package.json");
  return resolve(dirname(packageJsonPath), "schemas");
}
export {
  resolveProtocolSchemaDir
};
