import { existsSync, readdirSync, readFileSync } from "node:fs";

import type {
  InstallPlanMutation,
  ReconciliationOutcome,
} from "protocol";

export interface FsReadPort {
  exists(path: string): Promise<boolean>;
  readFile(path: string): Promise<string>;
  readDir(path: string): Promise<readonly string[]>;
}

export interface ManagedWriter {
  applyMutation(mutation: InstallPlanMutation): Promise<ReconciliationOutcome>;
}

export class NodeFsReadPort implements FsReadPort {
  async exists(path: string): Promise<boolean> {
    return existsSync(path);
  }

  async readFile(path: string): Promise<string> {
    return readFileSync(path, "utf8");
  }

  async readDir(path: string): Promise<readonly string[]> {
    return readdirSync(path).sort();
  }
}
