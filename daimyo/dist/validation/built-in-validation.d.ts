import type { ExecutionStore } from "../core/execution-store.js";
import type { Validation, ValidationRequest, ValidationResult } from "../core/ports/capabilities.js";
import { type DeclaredCommand, type ShellRunResult } from "../engine/shell-runner.js";
import { type StructuredModelRequest } from "../engine/structured-model-call.js";
export interface StructuredModelCaller {
    call<T>(request: StructuredModelRequest<T>): Promise<T>;
}
export interface BuiltInValidationOptions {
    readonly executionStore: ExecutionStore;
    readonly modelClient: StructuredModelCaller;
    readonly runCommand?: (command: DeclaredCommand) => Promise<ShellRunResult>;
    readonly now?: () => string;
    readonly makeReportRef?: (request: ValidationRequest) => string;
}
export declare class BuiltInValidation implements Validation {
    private readonly executionStore;
    private readonly modelClient;
    private readonly runCommand;
    private readonly now;
    private readonly makeReportRef;
    constructor(options: BuiltInValidationOptions);
    validate(request: ValidationRequest): Promise<ValidationResult>;
    private validateWithCommand;
    private validateWithModelFallback;
    private persistResult;
}
