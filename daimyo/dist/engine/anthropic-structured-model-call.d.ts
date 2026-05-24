import type { StructuredModelRequest } from "./structured-model-call.js";
export interface AnthropicStructuredModelClientOptions {
    readonly apiKey: string;
    readonly model: string;
    readonly endpoint?: string;
    readonly anthropicVersion?: string;
    readonly timeoutMs?: number;
    readonly maxTokens?: number;
    readonly fetchImpl?: typeof fetch;
}
export declare class AnthropicStructuredModelClient {
    private readonly options;
    private readonly endpoint;
    private readonly anthropicVersion;
    private readonly timeoutMs;
    private readonly maxTokens;
    private readonly fetchImpl;
    constructor(options: AnthropicStructuredModelClientOptions);
    call<T>(request: StructuredModelRequest<T>): Promise<T>;
}
