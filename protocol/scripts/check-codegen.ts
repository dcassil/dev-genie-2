import { generateTypeBindings } from "./lib/codegen.js";
import { displayPath, generatedTypesPath, readTextIfExists } from "./lib/paths.js";

const before = readTextIfExists(generatedTypesPath);

await generateTypeBindings();

const after = readTextIfExists(generatedTypesPath);

if (before !== after) {
  console.error(`${displayPath(generatedTypesPath)} was stale. Run npm run codegen and commit the result.`);
  process.exitCode = 1;
}
