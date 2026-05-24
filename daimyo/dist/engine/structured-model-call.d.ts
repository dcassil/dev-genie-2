import type { JsonObject, JsonValue } from "../core/domain.js";
export type JsonSchema = JsonObject;
export interface StructuredModelInput {
    readonly context: JsonValue;
    readonly rules?: JsonValue;
    readonly request: JsonValue;
}
export interface StructuredModelSchema<T> {
    readonly name: string;
    readonly schema: JsonSchema;
    readonly parse: (value: JsonValue) => T;
}
export interface StructuredModelClientOptions {
    readonly endpoint: string;
    readonly apiKey?: string;
    readonly model: string;
    readonly timeoutMs?: number;
    readonly maxResponseBytes?: number;
    readonly fetchImpl?: typeof fetch;
}
export interface StructuredModelRequest<T> {
    readonly input: StructuredModelInput;
    readonly output: StructuredModelSchema<T>;
}
export declare class StructuredModelCallError extends Error {
    constructor(message: string);
}
/**
 * Bounded structured-model-call primitive.
 *
 * The caller injects model identity, credentials, endpoint, and optionally
 * fetch. The endpoint contract is intentionally simple: it receives
 * `{ model, input: { context, request }, response_schema }` and returns the
 * typed JSON payload directly.
 */
export declare class StructuredModelClient {
    private readonly options;
    private readonly fetchImpl;
    private readonly timeoutMs;
    private readonly maxResponseBytes;
    constructor(options: StructuredModelClientOptions);
    call<T>(request: StructuredModelRequest<T>): Promise<T>;
    private headers;
}
export declare function parseJson(value: string, label: string): JsonValue;
export declare function isJsonObject(value: JsonValue): value is JsonObject;
export declare function requireJsonObject(value: JsonValue, label: string): JsonObject;
