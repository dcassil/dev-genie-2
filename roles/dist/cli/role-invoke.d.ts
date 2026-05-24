import type { RoleResult } from "protocol";
import { RoleRegistry } from "../registry/role-registry.js";
import { type StructuredModelCaller } from "../runner/structured-model.js";
export declare const ROLE_INVOKE_EXIT_CODES: {
    readonly ok: 0;
    readonly invalidInput: 2;
    readonly blocked: 10;
    readonly needsHuman: 11;
    readonly failed: 12;
    readonly usage: 64;
    readonly ioError: 66;
};
type TextReader = (path: string) => Promise<string>;
type TextWriter = (path: string, content: string) => Promise<void>;
type StreamReader = () => Promise<string>;
type StreamWriter = (content: string) => void | Promise<void>;
export interface RoleInvokeCliDeps {
    readonly readText?: TextReader;
    readonly writeText?: TextWriter;
    readonly readStdin?: StreamReader;
    readonly writeStdout?: StreamWriter;
    readonly writeStderr?: StreamWriter;
    readonly registry?: RoleRegistry;
    readonly modelClient?: StructuredModelCaller;
    readonly now?: () => Date;
    readonly cwd?: string;
    readonly env?: Readonly<Record<string, string | undefined>>;
}
export declare function runCli(argv: readonly string[], deps?: RoleInvokeCliDeps): Promise<number>;
export declare function createDefaultRoleRegistry(): RoleRegistry;
export declare function exitCodeForRoleResult(result: RoleResult): number;
export {};
