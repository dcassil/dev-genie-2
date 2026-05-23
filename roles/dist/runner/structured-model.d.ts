import type { JsonObject, JsonValue } from "protocol";
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
export interface StructuredModelRequest<T> {
    readonly input: StructuredModelInput;
    readonly output: StructuredModelSchema<T>;
}
export interface StructuredModelCaller {
    call<T>(request: StructuredModelRequest<T>): Promise<T>;
}
export declare class StructuredModelCallError extends Error {
    constructor(message: string);
}
