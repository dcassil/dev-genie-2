#!/usr/bin/env node
import { runCli } from "../dist/role-invoke.mjs";

const exitCode = await runCli(process.argv.slice(2));
process.exit(exitCode);
