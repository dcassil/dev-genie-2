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
