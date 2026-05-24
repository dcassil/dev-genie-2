export interface DeclaredCommand {
    readonly command: string;
    readonly args?: readonly string[];
    readonly cwd?: string;
    readonly env?: Readonly<Record<string, string>>;
    readonly timeoutMs?: number;
}
export interface ShellRunResult {
    readonly exitCode: number;
    readonly stdout: string;
    readonly stderr: string;
}
/**
 * Runs a declared command without invoking a shell and captures all output.
 */
export declare function runDeclaredCommand(command: DeclaredCommand): Promise<ShellRunResult>;
